import { prisma } from "../config/db.js";
import { formatMediaUrl } from "../utils/media.js";

export class DashboardService {
  static async getMyCourses(userId) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        user_id: userId,
        status: "ACTIVE",
      },
      include: {
        course: {
          include: {
            modules: {
              include: {
                lessons: true,
              },
            },
          },
        },
      },
      orderBy: { enrolled_at: "desc" },
    });

    const userProgress = await prisma.lessonProgress.findMany({
      where: { user_id: userId },
      include: {
        lesson: {
          select: { id: true, title: true },
        },
      },
      orderBy: { last_watched_at: "desc" },
    });

    const progressByCourse = new Map();
    for (const prog of userProgress) {
      if (!progressByCourse.has(prog.course_id)) {
        progressByCourse.set(prog.course_id, {
          completedCount: 0,
          lastWatchedLessonId: prog.lesson_id,
          lastWatchedLessonTitle: prog.lesson?.title || null,
        });
      }
      if (prog.completed) {
        const entry = progressByCourse.get(prog.course_id);
        entry.completedCount += 1;
      }
    }

    return enrollments.map((e) => {
      const c = e.course;
      const prog = progressByCourse.get(c.id) || {
        completedCount: 0,
        lastWatchedLessonId: null,
        lastWatchedLessonTitle: null,
      };

      const totalLessons = c.modules.reduce((sum, m) => sum + m.lessons.length, 0);

      return {
        course_id: c.id,
        slug: c.slug,
        title: c.title,
        tagline: c.tagline,
        cover_url: formatMediaUrl(c.cover_url),
        total_lessons: totalLessons || c.total_lessons,
        total_duration: c.total_duration,
        level: c.level,
        currency: c.currency,
        price: c.price,
        progress_count: prog.completedCount,
        last_watched_lesson_id: prog.lastWatchedLessonId,
        last_watched_lesson_title: prog.lastWatchedLessonTitle,
        enrolled_at: e.enrolled_at,
      };
    });
  }

  static async getMyPurchases(userId) {
    const payments = await prisma.payment.findMany({
      where: { user_id: userId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            cover_url: true,
            price: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return payments.map((p) => ({
      id: p.id,
      user_id: p.user_id,
      course_id: p.course_id,
      course_title: p.course?.title || "Course Access",
      course_slug: p.course?.slug || "",
      cover_url: formatMediaUrl(p.course?.cover_url || ""),
      amount: p.amount,
      currency: p.currency || "₹",
      gateway: p.gateway || "razorpay",
      gateway_order_id: p.gateway_order_id,
      gateway_payment_id: p.gateway_payment_id,
      status: p.status.toLowerCase(),
      paid_at: p.paid_at || p.created_at,
      created_at: p.created_at,
    }));
  }
}
