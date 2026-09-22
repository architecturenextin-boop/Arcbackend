import { prisma } from "../config/db.js";

export const testimonialService = {
  /**
   * Fetch approved public testimonials (read-only, sanitized)
   */
  async getPublicTestimonials({ courseId, limit = 50 } = {}) {
    const where = {
      status: "APPROVED",
    };

    if (courseId) {
      where.course = {
        OR: [{ id: courseId }, { slug: courseId }],
      };
    }

    const testimonials = await prisma.testimonial.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            full_name: true,
            first_name: true,
            last_name: true,
            role: true,
            avatar_url: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: Number(limit) || 50,
    });

    return testimonials.map((t) => {
      const name =
        t.user.full_name ||
        (t.user.first_name ? `${t.user.first_name} ${t.user.last_name || ""}`.trim() : "Architecture Learner");

      return {
        id: t.id,
        name,
        role: t.user.role === "STUDENT" ? "Architecture Learner" : "ArchitectureNext Alumnus",
        quote: t.quote,
        rating: t.rating,
        course: t.course ? t.course.title : null,
        courseSlug: t.course ? t.course.slug : null,
        avatarUrl: t.user.avatar_url,
        createdAt: t.created_at,
      };
    });
  },

  /**
   * Fetch testimonials submitted by current authenticated student
   */
  async getMyTestimonials(userId) {
    if (!userId) throw new Error("Unauthorized");

    const testimonials = await prisma.testimonial.findMany({
      where: { user_id: userId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return testimonials.map((t) => ({
      id: t.id,
      quote: t.quote,
      rating: t.rating,
      status: t.status,
      adminNote: t.admin_note,
      courseId: t.course_id,
      courseTitle: t.course ? t.course.title : null,
      courseSlug: t.course ? t.course.slug : null,
      createdAt: t.created_at,
      approvedAt: t.approved_at,
      rejectedAt: t.rejected_at,
    }));
  },

  /**
   * Student submits a testimonial
   */
  async submitTestimonial(userId, { quote, rating, courseId }) {
    if (!userId) throw new Error("Unauthorized");

    // 1. Validation
    const cleanQuote = (quote || "").trim();
    if (!cleanQuote || cleanQuote.length < 10) {
      const err = new Error("Testimonial must be at least 10 characters long");
      err.statusCode = 400;
      throw err;
    }
    if (cleanQuote.length > 2000) {
      const err = new Error("Testimonial must not exceed 2000 characters");
      err.statusCode = 400;
      throw err;
    }

    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      const err = new Error("Rating must be an integer between 1 and 5");
      err.statusCode = 400;
      throw err;
    }

    let validCourseId = null;
    if (courseId) {
      // Verify enrollment
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          user_id: userId,
          status: "ACTIVE",
          OR: [{ course_id: courseId }, { course: { slug: courseId } }],
        },
        include: { course: true },
      });

      if (!enrollment) {
        const err = new Error("You can only review courses you are actively enrolled in");
        err.statusCode = 403;
        throw err;
      }
      validCourseId = enrollment.course_id;
    }

    // 2. Spam / Duplicate Protection
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentSubmission = await prisma.testimonial.findFirst({
      where: {
        user_id: userId,
        created_at: { gte: oneMinuteAgo },
      },
    });

    if (recentSubmission) {
      const err = new Error("Please wait a minute before submitting another testimonial");
      err.statusCode = 429;
      throw err;
    }

    // Check duplicate pending quote
    const duplicatePending = await prisma.testimonial.findFirst({
      where: {
        user_id: userId,
        quote: cleanQuote,
        status: "PENDING",
      },
    });

    if (duplicatePending) {
      const err = new Error("You already have an identical pending testimonial under review");
      err.statusCode = 409;
      throw err;
    }

    // 3. Create
    const created = await prisma.testimonial.create({
      data: {
        user_id: userId,
        course_id: validCourseId,
        quote: cleanQuote,
        rating: numRating,
        status: "PENDING",
      },
      include: {
        course: {
          select: { id: true, title: true, slug: true },
        },
      },
    });

    return {
      id: created.id,
      quote: created.quote,
      rating: created.rating,
      status: created.status,
      courseTitle: created.course?.title || null,
      createdAt: created.created_at,
    };
  },

  /**
   * Student deletes their own pending/rejected testimonial
   */
  async deleteMyTestimonial(testimonialId, userId) {
    const existing = await prisma.testimonial.findUnique({
      where: { id: testimonialId },
    });

    if (!existing || existing.user_id !== userId) {
      const err = new Error("Testimonial not found or not owned by you");
      err.statusCode = 404;
      throw err;
    }

    await prisma.testimonial.delete({
      where: { id: testimonialId },
    });

    return { message: "Testimonial deleted successfully" };
  },

  /**
   * Admin: List testimonials with filters, search, and metrics
   */
  async getAdminTestimonials({ status, search } = {}) {
    const where = {};

    if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
    }

    if (search && search.trim()) {
      const query = search.trim();
      where.OR = [
        { quote: { contains: query, mode: "insensitive" } },
        { user: { full_name: { contains: query, mode: "insensitive" } } },
        { user: { email: { contains: query, mode: "insensitive" } } },
        { course: { title: { contains: query, mode: "insensitive" } } },
      ];
    }

    const [items, totalCount, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.testimonial.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              full_name: true,
              first_name: true,
              last_name: true,
              email: true,
              avatar_url: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.testimonial.count(),
      prisma.testimonial.count({ where: { status: "PENDING" } }),
      prisma.testimonial.count({ where: { status: "APPROVED" } }),
      prisma.testimonial.count({ where: { status: "REJECTED" } }),
    ]);

    const formatted = items.map((t) => ({
      id: t.id,
      quote: t.quote,
      rating: t.rating,
      status: t.status,
      adminNote: t.admin_note,
      createdAt: t.created_at,
      approvedAt: t.approved_at,
      rejectedAt: t.rejected_at,
      user: {
        id: t.user.id,
        name: t.user.full_name || `${t.user.first_name || ""} ${t.user.last_name || ""}`.trim() || "Student",
        email: t.user.email,
        avatarUrl: t.user.avatar_url,
      },
      course: t.course
        ? {
            id: t.course.id,
            title: t.course.title,
            slug: t.course.slug,
          }
        : null,
    }));

    return {
      items: formatted,
      counts: {
        all: totalCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    };
  },

  /**
   * Admin: Approve testimonial
   */
  async approveTestimonial(testimonialId) {
    const existing = await prisma.testimonial.findUnique({
      where: { id: testimonialId },
    });
    if (!existing) {
      const err = new Error("Testimonial not found");
      err.statusCode = 404;
      throw err;
    }

    const updated = await prisma.testimonial.update({
      where: { id: testimonialId },
      data: {
        status: "APPROVED",
        approved_at: new Date(),
        rejected_at: null,
      },
    });

    return updated;
  },

  /**
   * Admin: Reject testimonial
   */
  async rejectTestimonial(testimonialId, adminNote) {
    const existing = await prisma.testimonial.findUnique({
      where: { id: testimonialId },
    });
    if (!existing) {
      const err = new Error("Testimonial not found");
      err.statusCode = 404;
      throw err;
    }

    const updated = await prisma.testimonial.update({
      where: { id: testimonialId },
      data: {
        status: "REJECTED",
        rejected_at: new Date(),
        approved_at: null,
        admin_note: adminNote || null,
      },
    });

    return updated;
  },

  /**
   * Admin: Delete testimonial
   */
  async deleteAdminTestimonial(testimonialId) {
    const existing = await prisma.testimonial.findUnique({
      where: { id: testimonialId },
    });
    if (!existing) {
      const err = new Error("Testimonial not found");
      err.statusCode = 404;
      throw err;
    }

    await prisma.testimonial.delete({
      where: { id: testimonialId },
    });

    return { message: "Testimonial deleted successfully" };
  },
};
