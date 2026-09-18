import { prisma } from "../config/db.js";
import { formatCourseMedia } from "../utils/media.js";

export class AdminService {
  static async getOverviewStats() {
    const [
      totalUsers,
      activeEnrollmentsGroup,
      revenueResult,
      completedPaymentsCount,
      totalCourses,
      recentPayments
    ] = await Promise.all([
      prisma.user.count(),
      prisma.enrollment.groupBy({
        by: ["user_id"],
        where: { status: "ACTIVE" },
      }),
      prisma.payment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
      }),
      prisma.payment.count({
        where: { status: "COMPLETED" },
      }),
      prisma.course.count(),
      prisma.payment.findMany({
        take: 5,
        orderBy: { created_at: "desc" },
        include: {
          user: {
            select: { id: true, full_name: true, email: true },
          },
          course: {
            select: { id: true, title: true },
          },
        },
      }),
    ]);

    const enrolledStudentsCount = activeEnrollmentsGroup.length;

    const totalRevenue = revenueResult._sum.amount ?? 0;

    const formattedRecent = recentPayments.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status.toLowerCase(),
      studentName: p.user?.full_name || p.user?.email || "Learner",
      courseTitle: p.course?.title || "Course Access",
      orderId: p.gateway_order_id || p.id.substring(0, 10),
      created_at: p.created_at,
    }));

    return {
      profileCount: totalUsers,
      enrolledStudentsCount,
      totalPaymentsCount: completedPaymentsCount,
      totalRevenue,
      courseCount: totalCourses,
      recent: formattedRecent,
    };
  }

  static async getAllCourses() {
    const courses = await prisma.course.findMany({
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
      orderBy: { created_at: "desc" },
    });
    return courses.map((c) => formatCourseMedia(c));
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

            // Remove lessons deleted from this module
            await tx.courseLesson.deleteMany({
              where: {
                module_id: moduleId,
                id: { notIn: incomingLessonIds },
              },
            });
          }
        }

        // Remove modules deleted from this course
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
