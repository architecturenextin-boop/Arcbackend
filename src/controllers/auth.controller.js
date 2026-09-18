import { AuthService } from "../services/auth.service.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { z } from "zod";
import crypto from "crypto";
import { verifyToken } from "../utils/jwt.js";
import { prisma } from "../config/db.js";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  username: z.string().optional(),
  phone: z.string().optional(),
});

const verifyOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "Verification code must be 6 digits"),
});

const resendOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
  purpose: z.enum(["SIGNUP_VERIFY", "PASSWORD_RESET"]).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const verifyResetOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "Verification code must be 6 digits"),
});

const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const updateProfileSchema = z.object({
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  full_name: z.string().max(200).optional(),
  username: z.string().max(100).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  goal: z.string().max(500).optional().nullable(),
  onboarded: z.boolean().optional(),
  avatar_url: z.string().max(1000).optional().nullable(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

export class AuthController {
  static async register(req, res, next) {
    try {
      const validated = registerSchema.parse(req.body);
      const result = await AuthService.register(validated);
      return successResponse(res, result, result.message, 201);
    } catch (err) {
      next(err);
    }
  }

  static async verifySignupOtp(req, res, next) {
    try {
      const validated = verifyOtpSchema.parse(req.body);
      const result = await AuthService.verifySignupOtp(validated);

      if (result.token) {
        res.cookie("token", result.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: 7 * 24 * 60 * 60 * 1000,
          sameSite: "lax",
        });
      }

      return successResponse(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }

  static async resendOtp(req, res, next) {
    try {
      const validated = resendOtpSchema.parse(req.body);
      const result = await AuthService.resendOtp(validated);
      return successResponse(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }

  static async login(req, res, next) {
    try {
      const validated = loginSchema.parse(req.body);
      const result = await AuthService.login(validated);

      res.cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      });

      return successResponse(res, result, "Logged in successfully");
    } catch (err) {
      if (err.code === "UNVERIFIED_EMAIL") {
        return res.status(403).json({
          success: false,
          error: err.message,
          code: "UNVERIFIED_EMAIL",
          email: err.email,
        });
      }
      next(err);
    }
  }

  static async logout(req, res, next) {
    try {
      let token = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      } else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
      }

      if (token) {
        const decoded = verifyToken(token);
        if (decoded && decoded.exp) {
          const tokenHash = crypto.createHash("sha256").update(String(token).trim()).digest("hex");
          const expiresAt = new Date(decoded.exp * 1000);
          await prisma.tokenBlacklist.create({
            data: {
              token_hash: tokenHash,
              expires_at: expiresAt,
            },
          }).catch(() => {});
        }
      }

      res.clearCookie("token");
      return successResponse(res, {}, "Logged out successfully");
    } catch (err) {
      next(err);
    }
  }

  static async getMe(req, res, next) {
    try {
      const user = await AuthService.getMe(req.user.id);
      return successResponse(res, { user, profile: user });
    } catch (err) {
      next(err);
    }
  }

  static async updateProfile(req, res, next) {
    try {
      const validated = updateProfileSchema.parse(req.body);
      const updated = await AuthService.updateProfile(req.user.id, validated);
      return successResponse(res, { user: updated, profile: updated }, "Profile updated successfully");
    } catch (err) {
      next(err);
    }
  }

  static async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const result = await AuthService.changePassword(req.user.id, { currentPassword, newPassword });

      let token = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      } else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
      }

      if (token) {
        const decoded = verifyToken(token);
        if (decoded && decoded.exp) {
          const tokenHash = crypto.createHash("sha256").update(String(token).trim()).digest("hex");
          const expiresAt = new Date(decoded.exp * 1000);
          await prisma.tokenBlacklist.create({
            data: {
              token_hash: tokenHash,
              expires_at: expiresAt,
            },
          }).catch(() => {});
        }
      }

      return successResponse(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req, res, next) {
    try {
      const validated = forgotPasswordSchema.parse(req.body);
      const result = await AuthService.forgotPassword(validated.email);
      return successResponse(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }

  static async verifyResetOtp(req, res, next) {
    try {
      const validated = verifyResetOtpSchema.parse(req.body);
      const result = await AuthService.verifyResetOtp(validated);
      return successResponse(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const validated = resetPasswordSchema.parse(req.body);
      const result = await AuthService.resetPassword(validated);
      return successResponse(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }
}
