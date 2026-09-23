import fs from "fs";
import path from "path";
import crypto from "crypto";
import { AdminService } from "../services/admin.service.js";
import { r2Service } from "../services/r2.service.js";
import { successResponse } from "../utils/response.js";
import { z } from "zod";

const upsertCourseSchema = z.object({
  courseData: z.object({
    id: z.string().uuid().optional(),
    slug: z.string().max(200).optional(),
    title: z.string().min(1, "Course title is required").max(200),
    tagline: z.string().max(500).optional().nullable(),
    description: z.string().optional().nullable(),
    coverUrl: z.string().max(1000).optional().nullable(),
    cover_url: z.string().max(1000).optional().nullable(),
    thumbnail_url: z.string().max(1000).optional().nullable(),
    price: z.number().nonnegative().or(z.string()),
    originalPrice: z.number().nonnegative().or(z.string()).optional().nullable(),
    original_price: z.number().nonnegative().or(z.string()).optional().nullable(),
    currency: z.string().max(10).optional(),
    totalDuration: z.string().max(50).optional().nullable(),
    total_duration: z.string().max(50).optional().nullable(),
    level: z.string().max(50).optional().nullable(),
    language: z.string().max(50).optional().nullable(),
    previewVideoUrl: z.string().max(1000).optional().nullable(),
    preview_video_url: z.string().max(1000).optional().nullable(),
    what_you_will_learn: z.array(z.string()).optional(),
    tools_covered: z.array(z.string()).optional(),
    highlights: z.array(z.string()).optional(),
    requirements: z.array(z.string()).optional(),
    target_audience: z.array(z.string()).optional(),
    published: z.boolean().optional(),
    status: z.enum(["draft", "DRAFT", "published", "PUBLISHED", "archived", "ARCHIVED", ""]).optional(),
  }),
  modulesData: z.array(z.object({
    id: z.string().optional(),
    title: z.string().min(1, "Module title is required").max(200),
    description: z.string().optional().nullable(),
    lessons: z.array(z.object({
      id: z.string().optional(),
      title: z.string().min(1, "Lesson title is required").max(200),
      description: z.string().optional().nullable(),
      duration: z.string().max(50).optional().nullable(),
      video_url: z.string().max(1000).optional().nullable(),
      video_path: z.string().max(1000).optional().nullable(),
      pdf_url: z.string().max(1000).optional().nullable(),
      pdf_path: z.string().max(1000).optional().nullable(),
      is_free: z.boolean().optional(),
    })).optional(),
  })).optional(),
});

const deleteCourseSchema = z.object({
  id: z.string().uuid("Invalid Course ID"),
});

const manualEnrollSchema = z.object({
  userId: z.string().uuid("Invalid User ID"),
  courseId: z.string().uuid("Invalid Course ID"),
});

const updateStudentRoleSchema = z.object({
  id: z.string().uuid("Invalid User ID"),
  role: z.enum(["admin", "student", "ADMIN", "STUDENT"]),
});

export class AdminController {
  static async getOverviewStats(req, res, next) {
    try {
      const stats = await AdminService.getOverviewStats();
      return successResponse(res, stats);
    } catch (err) {
      next(err);
    }
  }

  static async getAllCourses(req, res, next) {
    try {
      const courses = await AdminService.getAllCourses();
      return successResponse(res, courses);
    } catch (err) {
      next(err);
    }
  }

  static async upsertCourse(req, res, next) {
    try {
      const { courseData: cData, modulesData: mData, course, modules, p_course, p_modules } = req.body;
      const courseData = cData || course || p_course || req.body;
      const modulesData = mData || modules || p_modules || courseData.modules || [];

      const validated = upsertCourseSchema.parse({
        courseData,
        modulesData,
      });

      const result = await AdminService.upsertCourse({
        courseData: validated.courseData,
        modulesData: validated.modulesData,
      });

      return successResponse(res, result, "Course saved successfully");
    } catch (err) {
      next(err);
    }
  }

  static async deleteCourse(req, res, next) {
    try {
      const { id } = deleteCourseSchema.parse(req.params);
      const result = await AdminService.deleteCourse(id);
      return successResponse(res, result, "Course deleted successfully");
    } catch (err) {
      next(err);
    }
  }

  static async getAllStudents(req, res, next) {
    try {
      const page = parseInt(req.query.page) || null;
      const limit = parseInt(req.query.limit) || null;

      const { students, total } = await AdminService.getAllStudents({ page, limit });

      res.setHeader("x-total-count", total);
      if (page) res.setHeader("x-page", page);
      if (limit) res.setHeader("x-limit", limit);

      return successResponse(res, students);
    } catch (err) {
      next(err);
    }
  }

  static async manualEnrollStudent(req, res, next) {
    try {
      const { userId, courseId } = manualEnrollSchema.parse(req.body);
      const enrollment = await AdminService.manualEnrollStudent({ userId, courseId });
      return successResponse(res, enrollment, "Student enrolled successfully", 201);
    } catch (err) {
      next(err);
    }
  }

  static async updateStudentRole(req, res, next) {
    try {
      const { id, role } = updateStudentRoleSchema.parse({
        id: req.params.id,
        role: req.body.role,
      });
      const updated = await AdminService.updateStudentRole(id, role);
      return successResponse(res, updated, "User role updated successfully");
    } catch (err) {
      next(err);
    }
  }

  static async getAllPayments(req, res, next) {
    try {
      const page = parseInt(req.query.page) || null;
      const limit = parseInt(req.query.limit) || null;

      const { payments, total } = await AdminService.getAllPayments({ page, limit });

      res.setHeader("x-total-count", total);
      if (page) res.setHeader("x-page", page);
      if (limit) res.setHeader("x-limit", limit);

      return successResponse(res, payments);
    } catch (err) {
      next(err);
    }
  }

  static async getPresignedUploadUrl(req, res, next) {
    try {
      if (!r2Service.isConfigured()) {
        return res.status(400).json({
          success: false,
          message: "Cloudflare R2 is not configured on the server. Please set R2 credentials in environment variables.",
        });
      }

      const { filename, contentType, folder = "videos" } = req.body;
      if (!filename) {
        return res.status(400).json({ success: false, message: "filename is required." });
      }

      const ext = path.extname(filename).toLowerCase() || ".mp4";
      const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "") || "videos";
      const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
      const key = `${cleanFolder}/${cleanFolder.slice(0, 4)}-${uniqueSuffix}${ext}`;

      const uploadUrl = await r2Service.getPresignedUploadUrl({
        key,
        contentType: contentType || "application/octet-stream",
        expiresIn: 3600,
      });

      const publicUrl = r2Service.getPublicUrl(key);
      const mediaUrl = publicUrl || `/api/v1/media/video/${path.basename(key)}`;

      return successResponse(res, {
        uploadUrl,
        key,
        filename: path.basename(key),
        publicUrl,
        mediaUrl,
        videoUrl: mediaUrl,
        videoPath: mediaUrl,
      }, "Presigned upload URL generated successfully");
    } catch (err) {
      next(err);
    }
  }

  static async uploadVideo(req, res, next) {
    try {
      if (!req.file) {
        throw new Error("No video file uploaded.");
      }

      const filename = req.file.filename;
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      if (r2Service.isConfigured()) {
        const key = `videos/${filename}`;
        await r2Service.uploadFile({
          key,
          filePath: req.file.path,
          contentType: req.file.mimetype || "video/mp4",
        });
        try { fs.unlinkSync(req.file.path); } catch (_) {}

        const publicUrl = r2Service.getPublicUrl(key);
        const videoUrl = publicUrl || `${baseUrl}/api/v1/media/video/${filename}`;
        const videoPath = publicUrl || `/api/v1/media/video/${filename}`;

        return successResponse(res, {
          filename,
          originalName: req.file.originalname,
          size: req.file.size,
          videoUrl,
          videoPath,
          key,
          storage: "r2",
        }, "Video uploaded to Cloudflare R2 successfully");
      }

      const videoUrl = `${baseUrl}/api/v1/media/video/${filename}`;
      const videoPath = `/api/v1/media/video/${filename}`;

      return successResponse(res, {
        filename,
        originalName: req.file.originalname,
        size: req.file.size,
        videoUrl,
        videoPath,
        storage: "local",
      }, "Video uploaded successfully");
    } catch (err) {
      next(err);
    }
  }

  static async uploadImage(req, res, next) {
    try {
      if (!req.file) {
        throw new Error("No image file uploaded.");
      }

      const filename = req.file.filename;
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      if (r2Service.isConfigured()) {
        const key = `images/${filename}`;
        await r2Service.uploadFile({
          key,
          filePath: req.file.path,
          contentType: req.file.mimetype || "image/png",
        });
        try { fs.unlinkSync(req.file.path); } catch (_) {}

        const publicUrl = r2Service.getPublicUrl(key);
        const imageUrl = publicUrl || `${baseUrl}/uploads/images/${filename}`;
        const imagePath = publicUrl || `/uploads/images/${filename}`;

        return successResponse(res, {
          filename,
          originalName: req.file.originalname,
          size: req.file.size,
          imageUrl,
          imagePath,
          key,
          storage: "r2",
        }, "Image uploaded to Cloudflare R2 successfully");
      }

      const imageUrl = `${baseUrl}/uploads/images/${filename}`;
      const imagePath = `/uploads/images/${filename}`;

      return successResponse(res, {
        filename,
        originalName: req.file.originalname,
        size: req.file.size,
        imageUrl,
        imagePath,
        storage: "local",
      }, "Image uploaded successfully");
    } catch (err) {
      next(err);
    }
  }

  static async uploadDocument(req, res, next) {
    try {
      if (!req.file) {
        throw new Error("No document file uploaded.");
      }

      const filename = req.file.filename;
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      if (r2Service.isConfigured()) {
        const key = `documents/${filename}`;
        await r2Service.uploadFile({
          key,
          filePath: req.file.path,
          contentType: req.file.mimetype || "application/pdf",
        });
        try { fs.unlinkSync(req.file.path); } catch (_) {}

        const publicUrl = r2Service.getPublicUrl(key);
        const documentUrl = publicUrl || `${baseUrl}/api/v1/media/document/${filename}`;
        const documentPath = publicUrl || `/api/v1/media/document/${filename}`;

        return successResponse(res, {
          filename,
          originalName: req.file.originalname,
          size: req.file.size,
          documentUrl,
          documentPath,
          key,
          storage: "r2",
        }, "Document uploaded to Cloudflare R2 successfully");
      }

      const documentUrl = `${baseUrl}/api/v1/media/document/${filename}`;
      const documentPath = `/api/v1/media/document/${filename}`;

      return successResponse(res, {
        filename,
        originalName: req.file.originalname,
        size: req.file.size,
        documentUrl,
        documentPath,
        storage: "local",
      }, "Document uploaded successfully");
    } catch (err) {
      next(err);
    }
  }
}
