import crypto from "crypto";
import { prisma } from "../config/db.js";
import { config } from "../config/env.js";
import { CouponService } from "./coupon.service.js";

function razorpayAuthorization(keyId, keySecret) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export class PaymentService {
  static async createOrder({ courseId, couponCode, user }) {
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

    const coursePrice = Number(course.price);
    const currency = course.currency === "?" || course.currency === ",1" ? "INR" : course.currency || "INR";

    let discountAmount = 0;
    let finalAmount = coursePrice;
    let validatedCoupon = null;

    if (couponCode && typeof couponCode === "string" && couponCode.trim()) {
      const couponRes = await CouponService.validateCoupon({
        code: couponCode,
        courseId: course.id,
        userId: user.id,
      });
      discountAmount = couponRes.discountAmount;
      finalAmount = couponRes.finalAmount;
      validatedCoupon = couponRes.coupon;
    }

    // ZERO PAYMENT FLOW
    if (finalAmount === 0) {
      const orderUniqueId = `free_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const paymentUniqueId = `coupon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const result = await prisma.$transaction(async (tx) => {
        // 1. Create completed payment record
        const payment = await tx.payment.create({
          data: {
            user_id: user.id,
            course_id: course.id,
            amount: 0,
            originalAmount: coursePrice,
            discountAmount: discountAmount,
            finalAmount: 0,
            couponId: validatedCoupon ? validatedCoupon.id : null,
            couponCode: validatedCoupon ? validatedCoupon.code : null,
            currency,
            status: "COMPLETED",
            gateway: "COUPON",
            gateway_order_id: orderUniqueId,
            gateway_payment_id: paymentUniqueId,
            paid_at: new Date(),
          },
        });

        // 2. Create active enrollment
        await tx.enrollment.upsert({
          where: {
            user_id_course_id: {
              user_id: user.id,
              course_id: course.id,
            },
          },
          create: {
            user_id: user.id,
            course_id: course.id,
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

        // 3. Create CouponRedemption and increment usedCount if coupon applied
        if (validatedCoupon) {
          await tx.couponRedemption.create({
            data: {
              couponId: validatedCoupon.id,
              userId: user.id,
              paymentId: payment.id,
              orderId: orderUniqueId,
              discountAmount: discountAmount,
            },
          });

          await tx.coupon.update({
            where: { id: validatedCoupon.id },
            data: {
              usedCount: { increment: 1 },
            },
          });
        }

        return payment;
      });

      return {
        free: true,
        paymentId: result.id,
        courseId: course.id,
      };
    }

    // PAID FLOW (finalAmount > 0)
    const amountInPaise = Math.round(finalAmount * 100);
    if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
      throw new Error("Invalid final payment amount.");
    }

    // 1. Create a pending payment record in PostgreSQL
    const payment = await prisma.payment.create({
      data: {
        user_id: user.id,
        course_id: course.id,
        amount: finalAmount,
        originalAmount: coursePrice,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
        couponId: validatedCoupon ? validatedCoupon.id : null,
        couponCode: validatedCoupon ? validatedCoupon.code : null,
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
          const errData = await res.text();
          console.warn("Razorpay order creation fallback:", errData);
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
        coupon: true,
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
          const expectedAmountInPaise = Math.round(Number(payment.amount) * 100);
          if (razorpayPayment.amount !== expectedAmountInPaise) {
            throw new Error(`Payment verification failed: Paid amount (${razorpayPayment.amount}) does not match expected amount (${expectedAmountInPaise}).`);
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

    // Execute atomic transaction: Mark payment as completed, create enrollment, and handle coupon redemption
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

      // If coupon was applied to this payment, record redemption & increment usage idempotently
      if (payment.couponId) {
        const existingRedemption = await tx.couponRedemption.findUnique({
          where: {
            couponId_paymentId: {
              couponId: payment.couponId,
              paymentId: payment.id,
            },
          },
        });

        if (!existingRedemption) {
          await tx.couponRedemption.create({
            data: {
              couponId: payment.couponId,
              userId: user.id,
              paymentId: payment.id,
              orderId: payment.gateway_order_id,
              discountAmount: payment.discountAmount || 0,
            },
          });

          await tx.coupon.update({
            where: { id: payment.couponId },
            data: {
              usedCount: { increment: 1 },
            },
          });
        }
      }
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
          coupon: true,
        },
      });

      if (!payment) {
        console.warn(`[Webhook Warning] Webhook received for order ${orderId} but no database record was found`);
        return { processed: false, reason: "Payment record not found" };
      }

      if (payment.status === "COMPLETED") {
        return { processed: true, message: "Payment already processed" };
      }

      const expectedAmountInPaise = Math.round(Number(payment.amount) * 100);
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

        if (payment.couponId) {
          const existingRedemption = await tx.couponRedemption.findUnique({
            where: {
              couponId_paymentId: {
                couponId: payment.couponId,
                paymentId: payment.id,
              },
            },
          });

          if (!existingRedemption) {
            await tx.couponRedemption.create({
              data: {
                couponId: payment.couponId,
                userId: payment.user_id,
                paymentId: payment.id,
                orderId: payment.gateway_order_id,
                discountAmount: payment.discountAmount || 0,
              },
            });

            await tx.coupon.update({
              where: { id: payment.couponId },
              data: {
                usedCount: { increment: 1 },
              },
            });
          }
        }
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
        coupon: {
          select: { id: true, code: true, discountType: true, discountValue: true },
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
