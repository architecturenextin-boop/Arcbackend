import { CouponService } from "../services/coupon.service.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { z } from "zod";

const validateCouponSchema = z.object({
  code: z.string().min(1, "Coupon code is required"),
  courseId: z.string().uuid("Invalid Course ID"),
});

export class CouponController {
  static async validate(req, res, next) {
    try {
      const validated = validateCouponSchema.parse(req.body);
      const result = await CouponService.validateCoupon({
        code: validated.code,
        courseId: validated.courseId,
        userId: req.user?.id,
      });
      return successResponse(res, result, "Coupon validated successfully");
    } catch (err) {
      return errorResponse(res, err.message || "Failed to validate coupon", 400);
    }
  }

  // Admin Controllers
  static async getAll(req, res, next) {
    try {
      const coupons = await CouponService.getAllCoupons();
      return successResponse(res, coupons);
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const coupon = await CouponService.createCoupon(req.body);
      return successResponse(res, coupon, "Coupon created successfully", 201);
    } catch (err) {
      return errorResponse(res, err.message || "Failed to create coupon", 400);
    }
  }

  static async update(req, res, next) {
    try {
      const coupon = await CouponService.updateCoupon(req.params.id, req.body);
      return successResponse(res, coupon, "Coupon updated successfully");
    } catch (err) {
      return errorResponse(res, err.message || "Failed to update coupon", 400);
    }
  }

  static async toggle(req, res, next) {
    try {
      const coupon = await CouponService.toggleCoupon(req.params.id);
      return successResponse(res, coupon, `Coupon ${coupon.isActive ? "activated" : "deactivated"} successfully`);
    } catch (err) {
      return errorResponse(res, err.message || "Failed to toggle coupon status", 400);
    }
  }

  static async delete(req, res, next) {
    try {
      const result = await CouponService.deleteCoupon(req.params.id);
      return successResponse(res, result, result.message);
    } catch (err) {
      return errorResponse(res, err.message || "Failed to delete coupon", 400);
    }
  }
}
