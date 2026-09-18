import { Router } from "express";
import { PaymentController } from "../controllers/payment.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { paymentVerifyLimiter } from "../middlewares/rate-limit.middleware.js";

const router = Router();

// Webhook endpoint from Razorpay (public endpoint, verified using cryptographic signature)
router.post("/webhook", PaymentController.handleWebhook);

router.use(requireAuth);

router.post("/create-order", PaymentController.createOrder);
router.post("/verify", paymentVerifyLimiter, PaymentController.verifyPayment);
router.get("/:paymentId", PaymentController.getPaymentStatus);

export default router;
