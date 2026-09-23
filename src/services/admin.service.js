import crypto from "crypto";
import path from "path";
import { prisma } from "../config/db.js";
import { r2Service } from "./r2.service.js";

/**
 * Extracts the canonical Cloudflare R2 object key from any media URL or database path.
 */
function getR2Key(urlOrPath, defaultFolder = "videos") {
  if (!urlOrPath || typeof urlOrPath !== "string") return null;

  // Do not delete third-party external URLs (YouTube, Vimeo, etc.)
  if (
    urlOrPath.includes("youtube.com") ||
    urlOrPath.includes("youtu.be") ||
    urlOrPath.includes("vimeo.com") ||
    urlOrPath.includes("google.com") ||
    urlOrPath.includes("cloudinary.com")
  ) {
    return null;
  }

  // Extract clean filename without query string parameters
  const cleanFilename = path.basename(urlOrPath.split("?")[0]);
  if (!cleanFilename || cleanFilename === "." || cleanFilename.length < 3) return null;

  // Preserve folder hierarchy or categorize by file extension
  if (
    cleanFilename.endsWith(".mp4") ||
    cleanFilename.endsWith(".webm") ||
    cleanFilename.endsWith(".mov") ||
    cleanFilename.endsWith(".mkv") ||
    cleanFilename.endsWith(".m4v")
  ) {
    return `videos/${cleanFilename}`;
  }

  if (
    cleanFilename.endsWith(".pdf") ||
    cleanFilename.endsWith(".psd") ||
    cleanFilename.endsWith(".dwg") ||
    cleanFilename.endsWith(".mp3") ||
    cleanFilename.endsWith(".wav") ||
    cleanFilename.endsWith(".zip") ||
    cleanFilename.endsWith(".rar")
  ) {
    return `documents/${cleanFilename}`;
  }

  if (
    cleanFilename.endsWith(".png") ||
    cleanFilename.endsWith(".jpg") ||
    cleanFilename.endsWith(".jpeg") ||
    cleanFilename.endsWith(".webp") ||
    cleanFilename.endsWith(".svg")
  ) {
    return `images/${cleanFilename}`;
  }

  return `${defaultFolder}/${cleanFilename}`;
}

/**
 * Safely deletes an object from Cloudflare R2 if configured.
 */
async function safeDeleteR2Media(urlOrPath, defaultFolder = "videos") {
  if (!urlOrPath) return;
  const key = getR2Key(urlOrPath, defaultFolder);
  if (!key) return;

  if (r2Service.isConfigured()) {
    try {
      console.log(`[Cloudflare R2 Auto-Cleanup] Deleting replaced/deleted file: ${key}`);
      await r2Service.deleteObject({ key });
    } catch (err) {
      console.warn(`[Cloudflare R2 Auto-Cleanup Warning] Could not delete ${key}:`, err.message);
    }
  }
}

export class AdminService {
  static async getOverviewStats() {
    const [
      totalUsers,
      totalStudents,
      totalCourses,
      publishedCourses,
      totalEnrollments,
      payments,
      recentUsers,
      recentEnrollments,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.course.count(),
      prisma.course.count({ where: { published: true } }),
      prisma.enrollment.count({ where: { status: "ACTIVE" } }),
      prisma.payment.findMany({
        where: { status: "CAPTURED" },
        select: { amount: true },
      }),
      prisma.user.findMany({
        take: 5,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          email: true,
          full_name: true,
          first_name: true,
          last_name: true,
          role: true,
          created_at: true,
          avatar_url: true,
        },
      }),
      prisma.enrollment.findMany({
        take: 5,
        orderBy: { enrolled_at: "desc" },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              full_name: true,
              first_name: true,
              last_name: true,
              avatar_url: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              price: true,
              cover_url: true,
            },
          },
        },
      }),
    ]);

    const totalRevenue = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return {
      stats: {
        totalUsers,
        totalStudents,
        totalCourses,
        publishedCourses,
        totalEnrollments,
        totalRevenue,
      },
      recentUsers,
      recentEnrollments,
    };
  }

  static async getAllCourses({ page, limit } = {}) {
    const total = await prisma.course.count();

    const query = {
      include: {
        modules: {
          orderBy: { sort_order: "asc" },
          include: {
            lessons: {
              orderBy: { sort_order: "asc" },
            },
          },
        },
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    };

    if (page && limit) {
      query.skip = (page - 1) * limit;
      query.take = limit;
    }

    const courses = await prisma.course.findMany(query);
    return { courses, total };
  }

  static async upsertCourse({ courseData, modulesData }) {
    const courseId = courseData.id || crypto.randomUUID();
    const courseSlug =
      courseData.slug ||
      (courseData.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    return await prisma.$transaction(async (tx) => {
      // 1. Upsert course record
      const course = await tx.course.upsert({
        where: { id: courseId },
        create: {
          id: courseId,
          slug: courseSlug,
          title: courseData.title,
          tagline: courseData.tagline || "",
          description: courseData.description || "",
          cover_url: courseData.coverUrl || courseData.cover_url || "/course-cover.jpeg",
          thumbnail_url: courseData.coverUrl || courseData.thumbnail_url || courseData.cover_url || "/course-cover.jpeg",
          price: Number(courseData.price) || 0,
          original_price: Number(courseData.originalPrice) || Number(courseData.original_price) || 0,
          currency: courseData.currency || "₹",
          total_duration: courseData.totalDuration || courseData.total_duration || "2h 30m",
          level: courseData.level || "Beginner",
          language: courseData.language || "Malayalam",
          preview_video_url: courseData.previewVideoUrl || courseData.preview_video_url || "",
          what_you_will_learn: Array.isArray(courseData.what_you_will_learn) ? courseData.what_you_will_learn : [],
          tools_covered: Array.isArray(courseData.tools_covered) ? courseData.tools_covered : [],
          highlights: Array.isArray(courseData.highlights) ? courseData.highlights : [],
          requirements: Array.isArray(courseData.requirements) ? courseData.requirements : [],
          target_audience: Array.isArray(courseData.target_audience) ? courseData.target_audience : [],
          published: courseData.status === "published" || courseData.status === "PUBLISHED" || Boolean(courseData.published),
          status: (courseData.status || "draft").toUpperCase(),
        },
        update: {
          slug: courseSlug,
          title: courseData.title,
          tagline: courseData.tagline || "",
          description: courseData.description || "",
          cover_url: courseData.coverUrl || courseData.cover_url,
          thumbnail_url: courseData.coverUrl || courseData.thumbnail_url || courseData.cover_url,
          price: Number(courseData.price) || 0,
          original_price: Number(courseData.originalPrice) || Number(courseData.original_price) || 0,
          currency: courseData.currency || "₹",
          total_duration: courseData.totalDuration || courseData.total_duration,
          level: courseData.level || "Beginner",
          language: courseData.language || "Malayalam",
          preview_video_url: courseData.previewVideoUrl || courseData.preview_video_url || "",
          what_you_will_learn: Array.isArray(courseData.what_you_will_learn) ? courseData.what_you_will_learn : [],
          tools_covered: Array.isArray(courseData.tools_covered) ? courseData.tools_covered : [],
          highlights: Array.isArray(courseData.highlights) ? courseData.highlights : [],
          requirements: Array.isArray(courseData.requirements) ? courseData.requirements : [],
          target_audience: Array.isArray(courseData.target_audience) ? courseData.target_audience : [],
          published: courseData.status === "published" || courseData.status === "PUBLISHED" || Boolean(courseData.published),
          status: (courseData.status || "draft").toUpperCase(),
        },
      });

      // 2. Sync modules and lessons if provided
      if (Array.isArray(modulesData)) {
        const incomingModuleIds = [];
        let totalLessonCount = 0;

        for (let mIdx = 0; mIdx < modulesData.length; mIdx++) {
          const m = modulesData[mIdx];
          const moduleId = m.id && !m.id.startsWith("m-") ? m.id : crypto.randomUUID();
          incomingModuleIds.push(moduleId);

          await tx.courseModule.upsert({
            where: { id: moduleId },
            create: {
              id: moduleId,
              course_id: course.id,
              title: m.title,
              description: m.description || "",
              sort_order: mIdx,
            },
            update: {
              title: m.title,
              description: m.description || "",
              sort_order: mIdx,
            },
          });

          if (Array.isArray(m.lessons)) {
            const incomingLessonIds = [];
            for (let lIdx = 0; lIdx < m.lessons.length; lIdx++) {
              const l = m.lessons[lIdx];
              const lessonId = l.id && !l.id.startsWith("l-") ? l.id : crypto.randomUUID();
              incomingLessonIds.push(lessonId);
              totalLessonCount += 1;

              // Check existing lesson to detect if video or document is being replaced
              const existingLesson = await tx.courseLesson.findUnique({
                where: { id: lessonId },
                select: { video_url: true, video_path: true, pdf_url: true, pdf_path: true },
              });

              if (existingLesson) {
                const oldVideo = existingLesson.video_url || existingLesson.video_path;
                const newVideo = l.video_url || l.video_path;
                if (oldVideo && newVideo && getR2Key(oldVideo, "videos") !== getR2Key(newVideo, "videos")) {
                  safeDeleteR2Media(oldVideo, "videos");
                }

                const oldPdf = existingLesson.pdf_url || existingLesson.pdf_path;
                const newPdf = l.pdf_url || l.pdf_path;
                if (oldPdf && newPdf && getR2Key(oldPdf, "documents") !== getR2Key(newPdf, "documents")) {
                  safeDeleteR2Media(oldPdf, "documents");
                }
              }

              await tx.courseLesson.upsert({
                where: { id: lessonId },
                create: {
                  id: lessonId,
                  module_id: moduleId,
                  title: l.title,
                  description: l.description || "",
                  duration: l.duration || "15:00",
                  video_url: l.video_url || null,
                  video_path: l.video_path || null,
                  pdf_url: l.pdf_url || null,
                  pdf_path: l.pdf_path || null,
                  is_free: Boolean(l.is_free),
                  sort_order: lIdx,
                },
                update: {
                  title: l.title,
                  description: l.description || "",
                  duration: l.duration || "15:00",
                  video_url: l.video_url || null,
                  video_path: l.video_path || null,
                  pdf_url: l.pdf_url || null,
                  pdf_path: l.pdf_path || null,
                  is_free: Boolean(l.is_free),
                  sort_order: lIdx,
                },
              });
            }

            // Find and automatically delete media files of removed lessons from Cloudflare R2
            const removedLessons = await tx.courseLesson.findMany({
              where: {
                module_id: moduleId,
                id: { notIn: incomingLessonIds },
              },
              select: { video_url: true, video_path: true, pdf_url: true, pdf_path: true },
            });

            for (const rLesson of removedLessons) {
              if (rLesson.video_url || rLesson.video_path) {
                safeDeleteR2Media(rLesson.video_url || rLesson.video_path, "videos");
              }
              if (rLesson.pdf_url || rLesson.pdf_path) {
                safeDeleteR2Media(rLesson.pdf_url || rLesson.pdf_path, "documents");
              }
            }

            // Delete removed lessons from database
            await tx.courseLesson.deleteMany({
              where: {
                module_id: moduleId,
                id: { notIn: incomingLessonIds },
              },
            });
          }
        }

        // Find and automatically delete media files of removed modules from Cloudflare R2
        const removedModules = await tx.courseModule.findMany({
          where: {
            course_id: course.id,
            id: { notIn: incomingModuleIds },
          },
          include: {
            lessons: {
              select: { video_url: true, video_path: true, pdf_url: true, pdf_path: true },
            },
          },
        });

        for (const rModule of removedModules) {
          for (const rLesson of rModule.lessons) {
            if (rLesson.video_url || rLesson.video_path) {
              safeDeleteR2Media(rLesson.video_url || rLesson.video_path, "videos");
            }
            if (rLesson.pdf_url || rLesson.pdf_path) {
              safeDeleteR2Media(rLesson.pdf_url || rLesson.pdf_path, "documents");
            }
          }
        }

        // Remove deleted modules from database
        await tx.courseModule.deleteMany({
          where: {
            course_id: course.id,
            id: { notIn: incomingModuleIds },
          },
        });

        // Update total lessons count on course
        await tx.course.update({
          where: { id: course.id },
          data: { total_lessons: totalLessonCount },
        });
      }

      return course;
    });
  }

  static async deleteCourse(courseId) {
    // 1. Fetch all lessons and attachments in this course to clean up from Cloudflare R2
    const lessonsInCourse = await prisma.courseLesson.findMany({
      where: {
        module: {
          course_id: courseId,
        },
      },
      select: {
        video_url: true,
        video_path: true,
        pdf_url: true,
        pdf_path: true,
      },
    });

    for (const l of lessonsInCourse) {
      if (l.video_url || l.video_path) {
        safeDeleteR2Media(l.video_url || l.video_path, "videos");
      }
      if (l.pdf_url || l.pdf_path) {
        safeDeleteR2Media(l.pdf_url || l.pdf_path, "documents");
      }
    }

    // 2. Delete course and cascading records from database
    return await prisma.course.delete({
      where: { id: courseId },
    });
  }

  static async getAllStudents({ page, limit } = {}) {
    const total = await prisma.user.count();

    const query = {
      include: {
        enrollments: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
                price: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
    };

    if (page && limit) {
      query.skip = (page - 1) * limit;
      query.take = limit;
    }

    const users = await prisma.user.findMany(query);

    const students = users.map((u) => ({
      id: u.id,
      email: u.email,
      first_name: u.first_name,
      last_name: u.last_name,
      full_name: u.full_name || u.email,
      username: u.username,
      phone: u.phone,
      goal: u.goal,
      role: u.role.toLowerCase(),
      onboarded: u.onboarded,
      avatar_url: u.avatar_url,
      created_at: u.created_at,
      updated_at: u.updated_at,
      enrollments: u.enrollments,
      coursesCount: u.enrollments.length,
    }));

    return { students, total };
  }

  static async manualEnrollStudent({ userId, courseId }) {
    const enrollment = await prisma.enrollment.upsert({
      where: {
        user_id_course_id: {
          user_id: userId,
          course_id: courseId,
        },
      },
      create: {
        user_id: userId,
        course_id: courseId,
        status: "ACTIVE",
        enrolled_at: new Date(),
      },
      update: {
        status: "ACTIVE",
        enrolled_at: new Date(),
      },
      include: {
        course: true,
      },
    });

    return enrollment;
  }

  static async updateStudentRole(userId, role) {
    const validRole = role.toUpperCase();
    if (!["ADMIN", "STUDENT"].includes(validRole)) {
      throw new Error("Invalid role. Role must be 'admin' or 'student'.");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: validRole },
      select: {
        id: true,
        email: true,
        role: true,
        full_name: true,
      },
    });

    return updated;
  }

  static async getAllPayments({ page, limit } = {}) {
    const total = await prisma.payment.count();

    const query = {
      include: {
        user: {
          select: {
            id: true,
            full_name: true,
            email: true,
            phone: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            price: true,
            currency: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    };

    if (page && limit) {
      query.skip = (page - 1) * limit;
      query.take = limit;
    }

    const payments = await prisma.payment.findMany(query);

    const formatted = payments.map((p) => ({
      id: p.id,
      user_id: p.user_id,
      course_id: p.course_id,
      amount: p.amount,
      currency: p.currency || "₹",
      gateway: p.gateway || "razorpay",
      gateway_order_id: p.gateway_order_id,
      gateway_payment_id: p.gateway_payment_id,
      status: p.status.toLowerCase(),
      paid_at: p.paid_at || p.created_at,
      created_at: p.created_at,
      studentName: p.user?.full_name || p.user?.email || "Learner",
      studentEmail: p.user?.email || "No email",
      studentPhone: p.user?.phone || "",
      courseTitle: p.course?.title || "Course Access",
      orderId: p.gateway_order_id || p.id.substring(0, 12),
      paymentId: p.gateway_payment_id || "",
    }));

    return { payments: formatted, total };
  }
}
