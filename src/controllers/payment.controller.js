import { PaymentService } from "../services/payment.service.js";
import { successResponse } from "../utils/response.js";
import { z } from "zod";

const createOrderSchema = z.object({
  courseId: z.string().uuid("Invalid Course ID"),
});

const verifyPaymentSchema = z.preprocess((val) => {
  if (val && typeof val === "object") {
    return {
      paymentId: val.paymentId || val.purchaseId,
      gatewayPaymentId: val.gatewayPaymentId || val.razorpayPaymentId,
      gatewaySignature: val.gatewaySignature || val.razorpaySignature,
    };
  }
  return val;
}, z.object({
  paymentId: z.string().uuid("Invalid Payment ID"),
  gatewayPaymentId: z.string().min(1, "Gateway payment ID is required"),
  gatewaySignature: z.string().min(1, "Gateway signature is required"),
}));

const getPaymentStatusSchema = z.object({
  paymentId: z.string().uuid("Invalid Payment ID"),
});

export class PaymentController {
  static async createOrder(req, res, next) {
    try {
      const { courseId } = createOrderSchema.parse(req.body);
      const result = await PaymentService.createOrder({ courseId, user: req.user });
      return successResponse(res, result, "Payment order created");
    } catch (err) {
      next(err);
    }
  }

  static async verifyPayment(req, res, next) {
    try {
      const validated = verifyPaymentSchema.parse(req.body);

      const result = await PaymentService.verifyPayment({
        paymentId: validated.paymentId,
        gatewayPaymentId: validated.gatewayPaymentId,
        gatewaySignature: validated.gatewaySignature,
        user: req.user,
      });

      return successResponse(res, result, "Payment verified and enrollment created successfully");
    } catch (err) {
      next(err);
    }
  }

  static async getPaymentStatus(req, res, next) {
    try {
      const { paymentId } = getPaymentStatusSchema.parse({
        paymentId: req.params.paymentId,
      });
      const payment = await PaymentService.getPaymentStatus(paymentId, req.user);
      return successResponse(res, payment);
    } catch (err) {
      next(err);
    }
  }

  static async handleWebhook(req, res, next) {
    try {
      const signature = req.headers["x-razorpay-signature"] || "";
      const rawBody = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body);

      const result = await PaymentService.handleWebhook({
        rawBody,
        signature,
      });

      return successResponse(res, result, "Webhook processed successfully");
    } catch (err) {
      next(err);
    }
  }
}
