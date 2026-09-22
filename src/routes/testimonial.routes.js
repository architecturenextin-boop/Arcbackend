import { Router } from "express";
import { testimonialController } from "../controllers/testimonial.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/rbac.middleware.js";

const router = Router();

// 1. Public endpoint (Approved testimonials only)
router.get("/", testimonialController.getPublicTestimonials);

// 2. Student authenticated endpoints
router.get("/my", requireAuth, testimonialController.getMyTestimonials);
router.post("/", requireAuth, testimonialController.submitTestimonial);
router.delete("/:id", requireAuth, testimonialController.deleteMyTestimonial);

// 3. Admin protected endpoints
router.get("/admin/list", requireAuth, requireAdmin, testimonialController.getAdminTestimonials);
router.post("/admin", requireAuth, requireAdmin, testimonialController.createAdminTestimonial);
router.patch("/admin/:id/approve", requireAuth, requireAdmin, testimonialController.approveTestimonial);
router.patch("/admin/:id/reject", requireAuth, requireAdmin, testimonialController.rejectTestimonial);
router.delete("/admin/:id", requireAuth, requireAdmin, testimonialController.deleteAdminTestimonial);

export default router;
