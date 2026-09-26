import { Router } from "express";
import { AdminController } from "../controllers/admin.controller.js";
import { testimonialController } from "../controllers/testimonial.controller.js";
import { CouponController } from "../controllers/coupon.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/rbac.middleware.js";
import { 
  uploadVideo, 
  uploadImage, 
  uploadDocument,
  verifyVideoSignature,
  verifyImageSignature,
  verifyDocumentSignature
} from "../middlewares/upload.middleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/overview", AdminController.getOverviewStats);

// Cloudflare R2 direct presigned upload URL
router.post("/r2/presigned-url", AdminController.getPresignedUploadUrl);

// Media Uploads
router.post("/upload-video", uploadVideo.single("video"), verifyVideoSignature, AdminController.uploadVideo);
router.post("/upload-image", uploadImage.single("image"), verifyImageSignature, AdminController.uploadImage);
router.post("/upload-document", uploadDocument.single("document"), verifyDocumentSignature, AdminController.uploadDocument);

// Course Management
router.get("/courses", AdminController.getAllCourses);
router.post("/courses", AdminController.upsertCourse);
router.put("/courses/:id", AdminController.upsertCourse);
router.delete("/courses/:id", AdminController.deleteCourse);

// Student Management
router.get("/students", AdminController.getAllStudents);
router.post("/students/enroll", AdminController.manualEnrollStudent);
router.post("/students/revoke-enrollment", AdminController.revokeStudentEnrollment);
router.put("/students/:id/role", AdminController.updateStudentRole);

// Payments & Transactions
router.get("/payments", AdminController.getAllPayments);

// Testimonials Management
router.get("/testimonials", testimonialController.getAdminTestimonials);
router.post("/testimonials", testimonialController.createAdminTestimonial);
router.patch("/testimonials/:id/approve", testimonialController.approveTestimonial);
router.patch("/testimonials/:id/reject", testimonialController.rejectTestimonial);
router.delete("/testimonials/:id", testimonialController.deleteAdminTestimonial);

// Coupon Management
router.get("/coupons", CouponController.getAll);
router.post("/coupons", CouponController.create);
router.put("/coupons/:id", CouponController.update);
router.patch("/coupons/:id/toggle", CouponController.toggle);
router.delete("/coupons/:id", CouponController.delete);

export default router;
