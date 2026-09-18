import { rateLimit } from "express-rate-limit";

// Base config builder
const createLimiter = (max, windowMs = 15 * 60 * 1000, message) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: message || "Too many requests, please try again later.",
    },
  });
};

export const apiLimiter = createLimiter(300, 15 * 60 * 1000, "Too many requests from this IP, please try again after 15 minutes");
export const loginLimiter = createLimiter(20, 15 * 60 * 1000, "Too many login attempts from this IP, please try again after 15 minutes");
export const registerLimiter = createLimiter(20, 15 * 60 * 1000, "Too many registration attempts from this IP, please try again after 15 minutes");
export const resendOtpLimiter = createLimiter(10, 15 * 60 * 1000, "Too many OTP resend attempts from this IP, please try again after 15 minutes");
export const verifyOtpLimiter = createLimiter(20, 15 * 60 * 1000, "Too many OTP verification attempts from this IP, please try again after 15 minutes");
export const forgotPasswordLimiter = createLimiter(10, 15 * 60 * 1000, "Too many password reset requests from this IP, please try again after 15 minutes");
export const verifyResetOtpLimiter = createLimiter(20, 15 * 60 * 1000, "Too many reset verification attempts from this IP, please try again after 15 minutes");
export const paymentVerifyLimiter = createLimiter(20, 15 * 60 * 1000, "Too many payment verification attempts from this IP, please try again after 15 minutes");
