import crypto from "crypto";
import { prisma } from "../config/db.js";
import { config } from "../config/env.js";

function razorpayAuthorization(keyId, keySecret) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export class PaymentService {
  static async createOrder({ courseId, user }) {
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        user_id_course_id: {
          user_id: user.id,
          course_id: courseId,
        },
      },
    });

    if (existingEnrollment && existingEnrollment.status === "ACTIVE") {
      throw new Error("You already own and have active access to this course.");
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new Error("Course not found.");
    }

    const currency = course.currency === "₹" ? "INR" : course.currency || "INR";
    const amountInPaise = Math.round(Number(course.price) * 100);

    if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
      throw new Error("The course price is invalid.");
    }

    // 1. Create a pending payment record in PostgreSQL
    const payment = await prisma.payment.create({
      data: {
        user_id: user.id,
        course_id: course.id,
        amount: course.price,
        currency,
        status: "PENDING",
        gateway: "razorpay",
      },
    });

    let orderId = `order_${payment.id.replace(/-/g, "").slice(0, 20)}`;

    // 2. Call Razorpay API if credentials are provided
    if (config.razorpayKeyId && config.razorpayKeySecret && !config.razorpayKeyId.includes("mock")) {
      try {
        const res = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            Authorization: razorpayAuthorization(config.razorpayKeyId, config.razorpayKeySecret),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency,
            receipt: `rcpt_${payment.id.replace(/-/g, "").slice(0, 20)}`,
            notes: { payment_id: payment.id, course_id: course.id, user_id: user.id },
          }),
        });

        if (res.ok) {
          const razorpayOrder = await res.json();
          if (razorpayOrder.id) {
            orderId = razorpayOrder.id;
          }
        } else {
          const errBody = await res.text();
          console.error(`Razorpay Order Creation Failed (HTTP ${res.status}):`, errBody);
        }
      } catch (err) {
        console.warn("Razorpay API call warning (using fallback order ID):", err.message);
      }
    }

    // 3. Update payment record with gateway order ID
    await prisma.payment.update({
      where: { id: payment.id },
      data: { gateway_order_id: orderId },
    });

    return {
      paymentId: payment.id,
      orderId,
      amount: amountInPaise,
      currency,
      keyId: config.razorpayKeyId || "rzp_test_mock_key",
    };
  }

  static async verifyPayment({ paymentId, gatewayPaymentId, gatewaySignature, user }) {
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        user_id: user.id,
      },
      include: {
        course: true,
      },
    });

    if (!payment) {
      throw new Error("Payment record not found or user mismatch.");
    }

    if (payment.status === "COMPLETED") {
      return { success: true, paymentId: payment.id, courseId: payment.course_id };
    }

    // Verify HMAC-SHA256 signature if real Razorpay secret is set
    if (config.razorpayKeySecret && !config.razorpayKeySecret.includes("mock") && payment.gateway_order_id) {
      const generatedSignature = crypto
        .createHmac("sha256", config.razorpayKeySecret)
        .update(`${payment.gateway_order_id}|${gatewayPaymentId}`)
        .digest("hex");

      if (generatedSignature !== gatewaySignature) {
        throw new Error("Payment verification failed: Invalid transaction signature.");
      }

      // Secure Server-side API verification of amount
      try {
        const res = await fetch(`https://api.razorpay.com/v1/payments/${gatewayPaymentId}`, {
          headers: {
            Authorization: razorpayAuthorization(config.razorpayKeyId, config.razorpayKeySecret),
          },
        });
        if (res.ok) {
          const razorpayPayment = await res.json();
          const expectedAmountInPaise = Math.round(Number(payment.course.price) * 100);
          if (razorpayPayment.amount !== expectedAmountInPaise) {
            throw new Error(`Payment verification failed: Paid amount (${razorpayPayment.amount}) does not match course price (${expectedAmountInPaise}).`);
          }
          if (razorpayPayment.status !== "captured" && razorpayPayment.status !== "authorized") {
            throw new Error(`Payment verification failed: Gateway transaction status is ${razorpayPayment.status}`);
          }
        } else {
          const errText = await res.text();
          console.error("Razorpay Fetch Payment Details Failed:", errText);
          throw new Error("Unable to confirm payment status with the gateway.");
        }
      } catch (err) {
        throw new Error(`Payment gateway verification failed: ${err.message}`);
      }
    }

    // Execute atomic transaction: Mark payment as completed and create/update active enrollment
    await prisma.$transaction(async (tx) => {
      try {
        await tx.payment.update({
          where: { id: payment.id, status: "PENDING" },
          data: {
            status: "COMPLETED",
            gateway_payment_id: gatewayPaymentId || `pay_${Date.now()}`,
            paid_at: new Date(),
          },
        });
      } catch (err) {
        // Handle concurrency idempotency: check if already completed by webhook
        const check = await tx.payment.findUnique({ where: { id: payment.id } });
        if (!check || check.status !== "COMPLETED") {
          throw err;
        }
      }

      await tx.enrollment.upsert({
        where: {
          user_id_course_id: {
            user_id: user.id,
            course_id: payment.course_id,
          },
        },
        create: {
          user_id: user.id,
          course_id: payment.course_id,
          payment_id: payment.id,
          status: "ACTIVE",
          enrolled_at: new Date(),
        },
        update: {
          payment_id: payment.id,
          status: "ACTIVE",
          enrolled_at: new Date(),
        },
      });
    });

    return { success: true, paymentId: payment.id, courseId: payment.course_id };
  }

  static async handleWebhook({ rawBody, signature }) {
    if (!config.razorpayWebhookSecret) {
      throw new Error("Webhook verification failed: Server is missing RAZORPAY_WEBHOOK_SECRET");
    }

    const expectedSignature = crypto
      .createHmac("sha256", config.razorpayWebhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      throw new Error("Invalid webhook signature.");
    }

    const event = JSON.parse(rawBody);
    console.log(`[Razorpay Webhook Callback] Event received: ${event.event}`);

    if (event.event === "payment.captured") {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const gatewayPaymentId = paymentEntity.id;
      const amountPaid = paymentEntity.amount;

      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { gateway_order_id: orderId },
            { id: paymentEntity.notes?.payment_id }
          ]
        },
        include: {
          course: true,
        },
      });

      if (!payment) {
        console.warn(`[Webhook Warning] Webhook received for order ${orderId} but no database record was found`);
        return { processed: false, reason: "Payment record not found" };
      }

      if (payment.status === "COMPLETED") {
        return { processed: true, message: "Payment already processed" };
      }

      const expectedAmountInPaise = Math.round(Number(payment.course.price) * 100);
      if (amountPaid !== expectedAmountInPaise) {
        console.error(`[Webhook Error] Amount mismatch for payment ${payment.id}. Expected ${expectedAmountInPaise}, got ${amountPaid}`);
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED" },
        });
        return { processed: false, reason: "Amount mismatch" };
      }

      await prisma.$transaction(async (tx) => {
        try {
          await tx.payment.update({
            where: { id: payment.id, status: "PENDING" },
            data: {
              status: "COMPLETED",
              gateway_payment_id: gatewayPaymentId,
              paid_at: new Date(),
            },
          });
        } catch (err) {
          // Handle concurrency idempotency: check if already completed by user redirection verifyPayment
          const check = await tx.payment.findUnique({ where: { id: payment.id } });
          if (!check || check.status !== "COMPLETED") {
            throw err;
          }
        }

        await tx.enrollment.upsert({
          where: {
            user_id_course_id: {
              user_id: payment.user_id,
              course_id: payment.course_id,
            },
          },
          create: {
            user_id: payment.user_id,
            course_id: payment.course_id,
            payment_id: payment.id,
            status: "ACTIVE",
            enrolled_at: new Date(),
          },
          update: {
            payment_id: payment.id,
            status: "ACTIVE",
            enrolled_at: new Date(),
          },
        });
      });

      console.log(`[Webhook Success] User ${payment.user_id} enrolled in course ${payment.course_id} via webhook`);
      return { processed: true };
    }

    return { processed: false, reason: "Unhandled webhook event type" };
  }

  static async getPaymentStatus(paymentId, user) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        course: {
          select: { id: true, title: true, slug: true, cover_url: true },
        },
      },
    });

    if (!payment) {
      throw new Error("Payment not found.");
    }

    if (payment.user_id !== user.id && user.role !== "ADMIN") {
      throw new Error("Forbidden: You cannot view this payment record.");
    }

    return payment;
  }
}
