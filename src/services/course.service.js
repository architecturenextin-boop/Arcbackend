import path from "path";
import { r2Service } from "./r2.service.js";
import { prisma } from "../config/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CourseService {
  static async getAllPublishedCourses({ page, limit } = {}) {
    const where = {
      published: true,
      status: "PUBLISHED",
    };

    const total = await prisma.course.count({ where });

    const query = {
      where,
      orderBy: { created_at: "desc" },
    };

    if (page && limit) {
      query.skip = (page - 1) * limit;
      query.take = limit;
    }

    const courses = await prisma.course.findMany(query);
    return { courses, total };
  }

  static async getCourseBySlugOrId(slugOrId) {
    const isUuid = UUID_REGEX.test(slugOrId);

    const course = await prisma.course.findFirst({
      where: isUuid ? { id: slugOrId } : { slug: slugOrId },
      include: {
        modules: {
          orderBy: { sort_order: "asc" },
          include: {
            lessons: {
              orderBy: { sort_order: "asc" },
              select: {
                id: true,
                module_id: true,
                title: true,
                description: true,
                duration: true,
                is_free: true,
                sort_order: true,
                video_url: true, // Only free lessons will have public video link in details
                hls_url: true,
                created_at: true,
                updated_at: true,
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new Error("Course not found");
    }

    // Mask non-free video URLs for public endpoint
    const safeModules = course.modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => ({
        ...l,
        video_url: l.is_free ? l.video_url : null,
        hls_url: l.is_free ? l.hls_url : null,
      })),
    }));

    return { ...course, modules: safeModules };
  }

  static async getCourseLearningContent(slugOrId, user) {
    if (!user) {
      throw new Error("Unauthorized: Please sign in to access the learning curriculum");
    }

    const isUuid = UUID_REGEX.test(slugOrId);

    const course = await prisma.course.findFirst({
      where: isUuid ? { id: slugOrId } : { slug: slugOrId },
      include: {
        modules: {
          orderBy: { sort_order: "asc" },
          include: {
            lessons: {
              orderBy: { sort_order: "asc" },
            },
          },
        },
      },
    });

    if (!course) {
      throw new Error("Course not found");
    }

    const isAdmin = user.role === "ADMIN";

    let isEnrolled = false;
    if (isAdmin) {
      isEnrolled = true;
    } else {
      const enrollment = await prisma.enrollment.findUnique({
        where: {
          user_id_course_id: {
            user_id: user.id,
            course_id: course.id,
          },
        },
      });
      isEnrolled = enrollment && enrollment.status === "ACTIVE";
    }

    // Fetch user progress for this course
    const progressRecords = await prisma.lessonProgress.findMany({
      where: {
        user_id: user.id,
        course_id: course.id,
      },
    });

    const progressMap = new Map(progressRecords.map((p) => [p.lesson_id, p]));

    // Sanitize lessons based on enrollment status
    const securedModules = await Promise.all(
      course.modules.map(async (m) => {
        const securedLessons = await Promise.all(
          m.lessons.map(async (l) => {
            const canAccessVideo = isEnrolled || l.is_free;
            const progress = progressMap.get(l.id);

            let resolvedVideoUrl = null;
            let resolvedHlsUrl = null;
            let resolvedPdfUrl = null;

            if (canAccessVideo) {
              const rawVideo = l.video_url || l.video_path;
              if (rawVideo) {
                if (rawVideo.startsWith("http://") || rawVideo.startsWith("https://")) {
                  resolvedVideoUrl = rawVideo;
                } else if (r2Service.isConfigured()) {
                  const cleanFilename = path.basename(rawVideo.split("?")[0]);
                  try {
                    resolvedVideoUrl = await r2Service.getPresignedDownloadUrl({
                      key: "videos/" + cleanFilename,
                      expiresIn: 14400,
                    });
                  } catch (_) {
                    resolvedVideoUrl = l.video_url;
                  }
                } else {
                  resolvedVideoUrl = l.video_url;
                }
              }

              // Include HLS URL if processed or fallback to standard video stream
              if (l.hls_url) {
                resolvedHlsUrl = l.hls_url;
              }

              const rawPdf = l.pdf_url || l.pdf_path;
              if (rawPdf) {
                if (rawPdf.startsWith("http://") || rawPdf.startsWith("https://")) {
                  resolvedPdfUrl = rawPdf;
                } else if (r2Service.isConfigured()) {
                  const cleanFilename = path.basename(rawPdf.split("?")[0]);
                  try {
                    resolvedPdfUrl = await r2Service.getPresignedDownloadUrl({
                      key: "documents/" + cleanFilename,
                      expiresIn: 14400,
                    });
                  } catch (_) {
                    resolvedPdfUrl = l.pdf_url;
                  }
                } else {
                  resolvedPdfUrl = l.pdf_url;
                }
              }
            }

            return {
              id: l.id,
              module_id: l.module_id,
              title: l.title,
              description: l.description,
              duration: l.duration,
              sort_order: l.sort_order,
              is_free: l.is_free,
              can_access: canAccessVideo,
              video_url: resolvedVideoUrl,
              video_path: resolvedVideoUrl,
              hls_url: resolvedHlsUrl,
              hls_path: l.hls_path || null,
              pdf_url: resolvedPdfUrl,
              pdf_path: resolvedPdfUrl,
              progress_seconds: progress ? progress.progress_seconds : 0,
              completed: progress ? progress.completed : false,
              last_watched_at: progress ? progress.last_watched_at : null,
            };
          })
        );

        return {
          ...m,
          lessons: securedLessons,
        };
      })
    );

    return {
      course: {
        ...course,
        modules: securedModules,
      },
      isEnrolled,
      isAdmin,
      progress: progressRecords,
    };
  }

  static async saveLessonProgress(userId, courseId, lessonId, { progress_seconds = 0, completed = true }) {
    const existing = await prisma.lessonProgress.findUnique({
      where: {
        user_id_lesson_id: {
          user_id: userId,
          lesson_id: lessonId,
        },
      },
    });

    if (existing) {
      return await prisma.lessonProgress.update({
        where: { id: existing.id },
        data: {
          progress_seconds: Number(progress_seconds) || 0,
          completed: Boolean(completed),
          last_watched_at: new Date(),
        },
      });
    }

    return await prisma.lessonProgress.create({
      data: {
        user_id: userId,
        course_id: courseId,
        lesson_id: lessonId,
        progress_seconds: Number(progress_seconds) || 0,
        completed: Boolean(completed),
        last_watched_at: new Date(),
      },
    });
  }

  static async removeLessonProgress(userId, lessonId) {
    const existing = await prisma.lessonProgress.findUnique({
      where: {
        user_id_lesson_id: {
          user_id: userId,
          lesson_id: lessonId,
        },
      },
    });

    if (existing) {
      await prisma.lessonProgress.delete({
        where: { id: existing.id },
      });
    }

    return { message: "Progress reset successfully" };
  }
}
