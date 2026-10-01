import { CourseService } from "../services/course.service.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { z } from "zod";

const getLessonProgressParamsSchema = z.object({
  id: z.string().uuid("Invalid Lesson ID"),
});

const saveLessonProgressParamsSchema = z.object({
  id: z.string().uuid("Invalid Lesson ID"),
});

const saveLessonProgressBodySchema = z.object({
  progress_seconds: z.number().nonnegative().optional(),
  last_position: z.number().nonnegative().optional(),
  lastPosition: z.number().nonnegative().optional(),
  duration: z.number().nonnegative().optional(),
  completed: z.boolean().optional(),
});

export class LessonController {
  static async getLessonProgress(req, res, next) {
    try {
      const { id } = getLessonProgressParamsSchema.parse(req.params);
      const progress = await CourseService.getLessonProgress(req.user.id, id);
      return successResponse(res, progress);
    } catch (err) {
      next(err);
    }
  }

  static async saveLessonProgress(req, res, next) {
    try {
      const { id } = saveLessonProgressParamsSchema.parse(req.params);
      const body = saveLessonProgressBodySchema.parse(req.body);
      const result = await CourseService.saveLessonProgress(req.user.id, null, id, body);
      return successResponse(res, result, "Progress updated successfully");
    } catch (err) {
      next(err);
    }
  }

  static async removeLessonProgress(req, res, next) {
    try {
      const { id } = getLessonProgressParamsSchema.parse(req.params);
      const result = await CourseService.removeLessonProgress(req.user.id, id);
      return successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
}