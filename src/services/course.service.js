import { prisma } from "../config/db.js";
import { r2Service } from "./r2.service.js";
import { config } from "../config/env.js";
import { signStreamToken } from "../utils/stream-token.js";
import path from "path";

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
                video_url: true,
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
        hls_url: l.is_free && l.video_url ? `/api/v1/media/hls/${l.id}/master.m3u8` : null,
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
              select: {
                id: true,
                module_id: true,
                title: true,
                description: true,
                duration: true,
                sort_order: true,
                is_free: true,
                video_url: true,
                video_path: true,
                pdf_url: true,
                pdf_path: true,
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
    const workerBase = config.streamWorkerUrl || "";

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
                const isExternal = rawVideo.includes("youtube.com") || rawVideo.includes("youtu.be") || rawVideo.includes("vimeo.com");
                const isExplicitHls = rawVideo.includes(".m3u8") || rawVideo.includes("/manifest/") || rawVideo.includes("/hls/");
                const isDirectHttp = rawVideo.startsWith("http://") || rawVideo.startsWith("https://");

                if (isExternal) {
                  resolvedVideoUrl = rawVideo;
                } else if (isExplicitHls && config.streamWorkerUrl) {
                  const streamToken = signStreamToken(
                    { lessonId: l.id, userId: user.id, expiresInSeconds: 14400 },
                    config.streamSigningSecret
                  );
                  resolvedHlsUrl = `${config.streamWorkerUrl}/hls/${l.id}/master.m3u8?token=${encodeURIComponent(streamToken)}`;
                  resolvedVideoUrl = resolvedHlsUrl;
                } else if (isDirectHttp) {
                  resolvedVideoUrl = rawVideo;
                } else if (r2Service.isConfigured()) {
                  const cleanFilename = path.basename(rawVideo.split("?")[0]);
                  const cdnUrl = r2Service.getPublicUrl("videos/" + cleanFilename);
                  if (cdnUrl) {
                    resolvedVideoUrl = cdnUrl;
                  } else {
                    try {
                      resolvedVideoUrl = await r2Service.getPresignedDownloadUrl({
                        key: "videos/" + cleanFilename,
                        expiresIn: 14400,
                      });
                    } catch (_) {
                      resolvedVideoUrl = rawVideo;
                    }
                  }
                } else {
                  resolvedVideoUrl = rawVideo;
                }
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

            const lastPosition = progress ? Number(progress.last_position || progress.progress_seconds || 0) : 0;
            const progressSeconds = progress ? Number(progress.progress_seconds || Math.floor(lastPosition)) : 0;

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
              pdf_url: resolvedPdfUrl,
              pdf_path: resolvedPdfUrl,
              last_position: lastPosition,
              lastPosition: lastPosition,
              progress_seconds: progressSeconds,
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
      progress: progressRecords.map((p) => ({
        ...p,
        last_position: Number(p.last_position || p.progress_seconds || 0),
        lastPosition: Number(p.last_position || p.progress_seconds || 0),
      })),
    };
  }

  static async getLessonProgress(userId, lessonId) {
    const record = await prisma.lessonProgress.findUnique({
      where: {
        user_id_lesson_id: {
          user_id: userId,
          lesson_id: lessonId,
        },
      },
    });

    if (!record) {
      return {
        lesson_id: lessonId,
        last_position: 0,
        lastPosition: 0,
        progress_seconds: 0,
        completed: false,
        last_watched_at: null,
      };
    }

    const lastPosition = Number(record.last_position || record.progress_seconds || 0);

    return {
      id: record.id,
      lesson_id: record.lesson_id,
      course_id: record.course_id,
      last_position: lastPosition,
      lastPosition: lastPosition,
      progress_seconds: record.progress_seconds || Math.floor(lastPosition),
      completed: record.completed,
      last_watched_at: record.last_watched_at,
    };
  }

  static async saveLessonProgress(userId, courseId, lessonId, payload = {}) {
    const {
      progress_seconds,
      last_position,
      lastPosition,
      completed,
      duration,
    } = payload;

    // Resolve target course_id if not supplied directly
    let resolvedCourseId = courseId;
    if (!resolvedCourseId) {
      const lesson = await prisma.courseLesson.findUnique({
        where: { id: lessonId },
        include: { module: true },
      });
      if (!lesson || !lesson.module) {
        throw new Error("Lesson or parent course module not found");
      }
      resolvedCourseId = lesson.module.course_id;
    }

    const rawPos = last_position !== undefined 
      ? Number(last_position) 
      : (lastPosition !== undefined ? Number(lastPosition) : (progress_seconds !== undefined ? Number(progress_seconds) : 0));
    const safeLastPosition = Math.max(0, isNaN(rawPos) ? 0 : rawPos);
    const safeProgressSeconds = Math.floor(safeLastPosition);

    const existing = await prisma.lessonProgress.findUnique({
      where: {
        user_id_lesson_id: {
          user_id: userId,
          lesson_id: lessonId,
        },
      },
    });

    // Auto mark completed at 90%+ duration
    let isCompleted = completed !== undefined ? Boolean(completed) : (existing ? existing.completed : false);
    if (!isCompleted && duration && Number(duration) > 0) {
      if (safeLastPosition / Number(duration) >= 0.90) {
        isCompleted = true;
      }
    } else if (existing && existing.completed) {
      if (completed === undefined) {
        isCompleted = true;
      }
    }

    if (existing) {
      return await prisma.lessonProgress.update({
        where: { id: existing.id },
        data: {
          last_position: safeLastPosition,
          progress_seconds: safeProgressSeconds,
          completed: isCompleted,
          last_watched_at: new Date(),
        },
      });
    }

    return await prisma.lessonProgress.create({
      data: {
        user_id: userId,
        course_id: resolvedCourseId,
        lesson_id: lessonId,
        last_position: safeLastPosition,
        progress_seconds: safeProgressSeconds,
        completed: isCompleted,
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