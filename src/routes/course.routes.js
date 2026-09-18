import { Router } from "express";
import { CourseController } from "../controllers/course.controller.js";
import { requireAuth, optionalAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", CourseController.getAllCourses);
router.get("/:idOrSlug", optionalAuth, CourseController.getCourse);
router.get("/:idOrSlug/learn", requireAuth, CourseController.getCourseLearningContent);
router.post("/:courseId/lessons/:lessonId/progress", requireAuth, CourseController.saveLessonProgress);
router.delete("/:courseId/lessons/:lessonId/progress", requireAuth, CourseController.removeLessonProgress);

export default router;
