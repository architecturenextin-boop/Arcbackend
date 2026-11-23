import { CourseService } from "../services/course.service.js";
import { successResponse } from "../utils/response.js";
import { memoryCache } from "../utils/memory-cache.js";
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
  last_position: z.number().nonnegative().optional(),
  lastPosition: z.number().nonnegative().optional(),
  duration: z.number().nonnegative().optional(),
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
      const cacheKey = `public:courses:${page || "all"}:${limit || "all"}`;

      res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");

      const cached = memoryCache.get(cacheKey);
      if (cached) {
        res.setHeader("x-cache", "HIT");
        res.setHeader("x-total-count", cached.total);
        if (page) res.setHeader("x-page", page);
        if (limit) res.setHeader("x-limit", limit);
        return successResponse(res, cached.courses);
      }

      res.setHeader("x-cache", "MISS");
      const { courses, total } = await CourseService.getAllPublishedCourses({ page, limit });

      res.setHeader("x-total-count", total);
      if (page) res.setHeader("x-page", page);
      if (limit) res.setHeader("x-limit", limit);

      memoryCache.set(cacheKey, { courses, total }, 120);
      return successResponse(res, courses);
    } catch (err) {
      next(err);
    }
  }

  static async getCourse(req, res, next) {
    try {
      const { idOrSlug } = getCourseParamsSchema.parse(req.params);
      const isPublic = !req.user;
      const cacheKey = `public:course:${idOrSlug}`;

      if (isPublic) {
        res.setHeader("Cache-Control", "public, max-age=180, stale-while-revalidate=600");
        const cached = memoryCache.get(cacheKey);
        if (cached) {
          res.setHeader("x-cache", "HIT");
          return successResponse(res, cached);
        }
      }

      res.setHeader("x-cache", "MISS");
      const course = await CourseService.getCourseBySlugOrId(idOrSlug);
      if (isPublic) {
        memoryCache.set(cacheKey, course, 180);
      }
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
      const body = saveLessonProgressBodySchema.parse(req.body);
      const result = await CourseService.saveLessonProgress(req.user.id, courseId, lessonId, body);
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

  static async getEnrollmentCount(req, res, next) {
    try {
      const cacheKey = "public:enrollment-stats";
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

      const cached = memoryCache.get(cacheKey);
      if (cached) {
        res.setHeader("x-cache", "HIT");
        return successResponse(res, cached);
      }

      res.setHeader("x-cache", "MISS");
      const stats = await CourseService.getPublicEnrollmentStats();
      memoryCache.set(cacheKey, stats, 60);
      return successResponse(res, stats);
    } catch (err) {
      next(err);
    }
  }
}
