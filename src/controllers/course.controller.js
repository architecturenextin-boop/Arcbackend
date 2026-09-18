import { CourseService } from "../services/course.service.js";
import { successResponse } from "../utils/response.js";
import { z } from "zod";

const getCourseParamsSchema = z.object({
  idOrSlug: z.string().min(1, "Course ID or Slug is required").max(200),
});

const saveLessonProgressParamsSchema = z.object({
  courseId: z.string().uuid("Invalid Course ID"),
  lessonId: z.string().uuid("Invalid Lesson ID"),
});

const saveLessonProgressBodySchema = z.object({
  progress_seconds: z.number().nonnegative().optional(),
  completed: z.boolean().optional(),
});

const removeLessonProgressParamsSchema = z.object({
  lessonId: z.string().uuid("Invalid Lesson ID"),
});

export class CourseController {
  static async getAllCourses(req, res, next) {
    try {
      const page = parseInt(req.query.page) || null;
      const limit = parseInt(req.query.limit) || null;

      const { courses, total } = await CourseService.getAllPublishedCourses({ page, limit });

      res.setHeader("x-total-count", total);
      if (page) res.setHeader("x-page", page);
      if (limit) res.setHeader("x-limit", limit);

      return successResponse(res, courses);
    } catch (err) {
      next(err);
    }
  }

  static async getCourse(req, res, next) {
    try {
      const { idOrSlug } = getCourseParamsSchema.parse(req.params);
      const course = await CourseService.getCourseBySlugOrId(idOrSlug);
      return successResponse(res, course);
    } catch (err) {
      if (err.message === "Course not found") {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }
      next(err);
    }
  }

  static async getCourseLearningContent(req, res, next) {
    try {
      const { idOrSlug } = getCourseParamsSchema.parse(req.params);
      const data = await CourseService.getCourseLearningContent(idOrSlug, req.user);
      return successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async saveLessonProgress(req, res, next) {
    try {
      const { courseId, lessonId } = saveLessonProgressParamsSchema.parse(req.params);
      const { progress_seconds, completed } = saveLessonProgressBodySchema.parse(req.body);
      const result = await CourseService.saveLessonProgress(req.user.id, courseId, lessonId, {
        progress_seconds,
        completed,
      });
      return successResponse(res, result, "Progress updated successfully");
    } catch (err) {
      next(err);
    }
  }

  static async removeLessonProgress(req, res, next) {
    try {
      const { lessonId } = removeLessonProgressParamsSchema.parse(req.params);
      const result = await CourseService.removeLessonProgress(req.user.id, lessonId);
      return successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
}
