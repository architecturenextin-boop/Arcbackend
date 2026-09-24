import { prisma } from "../config/db.js";

export class CouponService {
  /**
   * Validate coupon and calculate discount according to strict server rules.
   */
  static async validateCoupon({ code, courseId, userId }) {
    if (!code || typeof code !== "string") {
      throw new Error("Invalid coupon code");
    }

    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      throw new Error("Invalid coupon code");
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new Error("Course not found");
    }

    const coursePrice = Number(course.price);

    // 1. Code exists (case-insensitive)
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: {
          equals: trimmedCode,
          mode: "insensitive",
        },
      },
      include: {
        course: {
          select: { id: true, title: true, slug: true },
        },
      },
    });

    if (!coupon) {
      throw new Error("Invalid coupon code");
    }

    // 2. isActive
    if (!coupon.isActive) {
      throw new Error("Coupon is not active");
    }

    // 3. Not expired
    if (coupon.expiresAt && new Date() > new Date(coupon.expiresAt)) {
      throw new Error("Coupon has expired");
    }

    // 4. courseId matches, or coupon has no course
    if (coupon.courseId && coupon.courseId !== courseId) {
      throw new Error("Not valid for this course");
    }

    // 5. usedCount < usageLimit
    if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
      throw new Error("Coupon usage limit reached");
    }

    // 6. User's redemptions of this coupon < perUserLimit
    if (userId) {
      const userRedemptionsCount = await prisma.couponRedemption.count({
        where: {
          couponId: coupon.id,
          userId: userId,
        },
      });

      if (userRedemptionsCount >= (coupon.perUserLimit || 1)) {
        throw new Error("You already used this coupon");
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === "FLAT") {
      discountAmount = Math.min(coupon.discountValue, coursePrice);
    } else if (coupon.discountType === "PERCENT") {
      let calc = Math.round((coursePrice * coupon.discountValue) / 100);
      if (coupon.maxDiscount !== null && coupon.maxDiscount !== undefined) {
        calc = Math.min(calc, coupon.maxDiscount);
      }
      discountAmount = Math.min(calc, coursePrice);
    }

    const finalAmount = Math.max(0, coursePrice - discountAmount);

    return {
      valid: true,
      message: "Coupon applied successfully",
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscount,
        courseId: coupon.courseId,
      },
      originalAmount: coursePrice,
      discountAmount,
      finalAmount,
    };
  }

  // Admin CRUD
  static async getAllCoupons() {
    return prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        course: {
          select: { id: true, title: true, slug: true },
        },
        _count: {
          select: { redemptions: true },
        },
      },
    });
  }

  static async createCoupon(data) {
    const code = (data.code || "").trim().toUpperCase();
    if (!code || code.length < 4 || code.length > 20 || !/^[A-Z0-9_-]+$/i.test(code)) {
      throw new Error("Coupon code must be 4-20 alphanumeric characters");
    }

    const discountType = data.discountType;
    if (discountType !== "FLAT" && discountType !== "PERCENT") {
      throw new Error("Discount type must be FLAT or PERCENT");
    }

    const discountValue = Number(data.discountValue);
    if (isNaN(discountValue) || discountValue <= 0) {
      throw new Error("Discount value must be greater than 0");
    }
    if (discountType === "PERCENT" && (discountValue < 1 || discountValue > 100)) {
      throw new Error("Percentage discount must be between 1 and 100");
    }

    const maxDiscount = data.maxDiscount !== undefined && data.maxDiscount !== null && data.maxDiscount !== ""
      ? Number(data.maxDiscount)
      : null;

    const courseId = data.courseId && data.courseId !== "ALL" && data.courseId !== "" ? data.courseId : null;
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    const usageLimit = data.usageLimit !== undefined && data.usageLimit !== null && data.usageLimit !== ""
      ? Number(data.usageLimit)
      : null;
    const perUserLimit = data.perUserLimit ? Number(data.perUserLimit) : 1;
    const isActive = data.isActive !== undefined ? Boolean(data.isActive) : true;

    return prisma.coupon.create({
      data: {
        code,
        discountType,
        discountValue,
        maxDiscount,
        courseId,
        expiresAt,
        usageLimit,
        perUserLimit,
        isActive,
      },
      include: {
        course: {
          select: { id: true, title: true, slug: true },
        },
      },
    });
  }

  static async updateCoupon(id, data) {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new Error("Coupon not found");

    const updateData = {};

    if (data.code) {
      const code = data.code.trim().toUpperCase();
      if (code.length < 4 || code.length > 20 || !/^[A-Z0-9_-]+$/i.test(code)) {
        throw new Error("Coupon code must be 4-20 alphanumeric characters");
      }
      updateData.code = code;
    }

    if (data.discountType) {
      if (data.discountType !== "FLAT" && data.discountType !== "PERCENT") {
        throw new Error("Discount type must be FLAT or PERCENT");
      }
      updateData.discountType = data.discountType;
    }

    if (data.discountValue !== undefined) {
      const discountValue = Number(data.discountValue);
      if (isNaN(discountValue) || discountValue <= 0) {
        throw new Error("Discount value must be greater than 0");
      }
      const type = data.discountType || existing.discountType;
      if (type === "PERCENT" && (discountValue < 1 || discountValue > 100)) {
        throw new Error("Percentage discount must be between 1 and 100");
      }
      updateData.discountValue = discountValue;
    }

    if (data.maxDiscount !== undefined) {
      updateData.maxDiscount = data.maxDiscount !== null && data.maxDiscount !== ""
        ? Number(data.maxDiscount)
        : null;
    }

    if (data.courseId !== undefined) {
      updateData.courseId = data.courseId && data.courseId !== "ALL" && data.courseId !== "" ? data.courseId : null;
    }

    if (data.expiresAt !== undefined) {
      updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    }

    if (data.usageLimit !== undefined) {
      updateData.usageLimit = data.usageLimit !== null && data.usageLimit !== ""
        ? Number(data.usageLimit)
        : null;
    }

    if (data.perUserLimit !== undefined) {
      updateData.perUserLimit = Number(data.perUserLimit) || 1;
    }

    if (data.isActive !== undefined) {
      updateData.isActive = Boolean(data.isActive);
    }

    return prisma.coupon.update({
      where: { id },
      data: updateData,
      include: {
        course: {
          select: { id: true, title: true, slug: true },
        },
      },
    });
  }

  static async toggleCoupon(id) {
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new Error("Coupon not found");

    return prisma.coupon.update({
      where: { id },
      data: { isActive: !coupon.isActive },
      include: {
        course: {
          select: { id: true, title: true, slug: true },
        },
      },
    });
  }

  static async deleteCoupon(id) {
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: {
        _count: {
          select: { redemptions: true },
        },
      },
    });

    if (!coupon) throw new Error("Coupon not found");

    // If it has redemptions, only deactivate it
    if (coupon._count.redemptions > 0 || coupon.usedCount > 0) {
      await prisma.coupon.update({
        where: { id },
        data: { isActive: false },
      });
      return { deactivated: true, message: "Coupon has existing redemptions and was deactivated instead of deleted." };
    }

    await prisma.coupon.delete({ where: { id } });
    return { deleted: true, message: "Coupon deleted successfully." };
  }
}
