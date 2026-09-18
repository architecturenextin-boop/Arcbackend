import { Router } from "express";
import { AdminController } from "../controllers/admin.controller.js";
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
router.put("/students/:id/role", AdminController.updateStudentRole);

// Payments & Transactions
router.get("/payments", AdminController.getAllPayments);

export default router;
