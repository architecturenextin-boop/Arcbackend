import { testimonialService } from "../services/testimonial.service.js";
import { successResponse, errorResponse } from "../utils/response.js";

export const testimonialController = {
  /**
   * Public: Get all approved testimonials
   * GET /api/v1/testimonials
   */
  async getPublicTestimonials(req, res, next) {
    try {
      const { courseId, limit } = req.query;
      const data = await testimonialService.getPublicTestimonials({ courseId, limit });
      return successResponse(res, data, "Approved testimonials retrieved successfully");
    } catch (err) {
      next(err);
    }
  },

  /**
   * Student: Get authenticated student's submissions
   * GET /api/v1/testimonials/my
   */
  async getMyTestimonials(req, res, next) {
    try {
      const data = await testimonialService.getMyTestimonials(req.user.id);
      return successResponse(res, data, "Your testimonials retrieved successfully");
    } catch (err) {
      next(err);
    }
  },

  /**
   * Student: Submit a new testimonial
   * POST /api/v1/testimonials
   */
  async submitTestimonial(req, res, next) {
    try {
      const { quote, rating, courseId } = req.body;
      const data = await testimonialService.submitTestimonial(req.user.id, {
        quote,
        rating,
        courseId,
      });
      return successResponse(res, data, "Testimonial submitted successfully and is pending review", 201);
    } catch (err) {
      next(err);
    }
  },

  /**
   * Student: Delete own testimonial
   * DELETE /api/v1/testimonials/:id
   */
  async deleteMyTestimonial(req, res, next) {
    try {
      const data = await testimonialService.deleteMyTestimonial(req.params.id, req.user.id);
      return successResponse(res, data, "Testimonial deleted successfully");
    } catch (err) {
      next(err);
    }
  },

  /**
   * Admin: List testimonials with filters
   * GET /api/v1/admin/testimonials
   */
  async getAdminTestimonials(req, res, next) {
    try {
      const { status, search } = req.query;
      const data = await testimonialService.getAdminTestimonials({ status, search });
      return successResponse(res, data, "Admin testimonials retrieved successfully");
    } catch (err) {
      next(err);
    }
  },

  /**
   * Admin: Approve testimonial
   * PATCH /api/v1/admin/testimonials/:id/approve
   */
  async approveTestimonial(req, res, next) {
    try {
      const data = await testimonialService.approveTestimonial(req.params.id);
      return successResponse(res, data, "Testimonial approved successfully");
    } catch (err) {
      next(err);
    }
  },

  /**
   * Admin: Reject testimonial
   * PATCH /api/v1/admin/testimonials/:id/reject
   */
  async rejectTestimonial(req, res, next) {
    try {
      const { adminNote } = req.body;
      const data = await testimonialService.rejectTestimonial(req.params.id, adminNote);
      return successResponse(res, data, "Testimonial rejected successfully");
    } catch (err) {
      next(err);
    }
  },

  /**
   * Admin: Delete testimonial
   * DELETE /api/v1/admin/testimonials/:id
   */
  async deleteAdminTestimonial(req, res, next) {
    try {
      const data = await testimonialService.deleteAdminTestimonial(req.params.id);
      return successResponse(res, data, "Testimonial deleted successfully");
    } catch (err) {
      next(err);
    }
  },

  /**
   * Admin: Create a testimonial directly
   * POST /api/v1/admin/testimonials
   */
  async createAdminTestimonial(req, res, next) {
    try {
      const { name, email, quote, rating, courseId, status, avatarUrl } = req.body;
      const data = await testimonialService.createAdminTestimonial(req.user.id, {
        name,
        email,
        quote,
        rating,
        courseId,
        status,
        avatarUrl,
      });
      return successResponse(res, data, "Testimonial created successfully", 201);
    } catch (err) {
      next(err);
    }
  },
};

