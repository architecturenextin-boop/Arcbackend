import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  loginLimiter,
  registerLimiter,
  resendOtpLimiter,
  verifyOtpLimiter,
  forgotPasswordLimiter,
  verifyResetOtpLimiter
} from "../middlewares/rate-limit.middleware.js";

const router = Router();

router.post("/register", registerLimiter, AuthController.register);
router.post("/verify-otp", verifyOtpLimiter, AuthController.verifySignupOtp);
router.post("/resend-otp", resendOtpLimiter, AuthController.resendOtp);
router.post("/login", loginLimiter, AuthController.login);
router.post("/logout", AuthController.logout);
router.get("/me", requireAuth, AuthController.getMe);
router.put("/profile", requireAuth, AuthController.updateProfile);
router.put("/onboarding", requireAuth, AuthController.updateProfile);
router.put("/change-password", requireAuth, AuthController.changePassword);
router.post("/forgot-password", forgotPasswordLimiter, AuthController.forgotPassword);
router.post("/verify-reset-otp", verifyResetOtpLimiter, AuthController.verifyResetOtp);
router.post("/reset-password", verifyResetOtpLimiter, AuthController.resetPassword);

export default router;
