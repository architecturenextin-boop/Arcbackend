import { Router } from "express";
import { LessonController } from "../controllers/lesson.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/:id/progress", requireAuth, LessonController.getLessonProgress);
router.post("/:id/progress", requireAuth, LessonController.saveLessonProgress);
router.delete("/:id/progress", requireAuth, LessonController.removeLessonProgress);

export default router;