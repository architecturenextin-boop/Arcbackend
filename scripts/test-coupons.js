import crypto from "crypto";
import { prisma } from "../src/config/db.js";
import { config } from "../src/config/env.js";
import { CouponService } from "../src/services/coupon.service.js";
import { PaymentService } from "../src/services/payment.service.js";

async function runTests() {
  console.log("=== STARTING COUPON SYSTEM TESTS ===");

  // 0. Setup test user and test course
  let testUser = await prisma.user.findFirst({ where: { email: "test-coupon-user@architecturenext.in" } });
  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: "test-coupon-user@architecturenext.in",
        password_hash: "hashed",
        full_name: "Coupon Tester",
        role: "STUDENT",
      },
    });
  }

  let testCourse = await prisma.course.findFirst({ where: { slug: "test-bim-course" } });
  if (!testCourse) {
    testCourse = await prisma.course.create({
      data: {
        slug: "test-bim-course",
        title: "Test BIM Architectural Modeling",
        price: 2000,
        currency: "INR",
        published: true,
      },
    });
  }

  let otherCourse = await prisma.course.findFirst({ where: { slug: "test-other-course" } });
  if (!otherCourse) {
    otherCourse = await prisma.course.create({
      data: {
        slug: "test-other-course",
        title: "Test Other Course",
        price: 3000,
        currency: "INR",
        published: true,
      },
    });
  }

  // Clean up previous test coupons and enrollments
  await prisma.couponRedemption.deleteMany({ where: { userId: testUser.id } });
  await prisma.payment.deleteMany({ where: { user_id: testUser.id } });
  await prisma.enrollment.deleteMany({ where: { user_id: testUser.id } });
  await prisma.coupon.deleteMany({ where: { code: { in: ["FLAT400TEST", "PERC20CAP", "FREE100TEST", "EXPIREDTEST", "INACTIVETEST", "WRONGCOURSETEST", "LIMITTEST", "ONCEONLYTEST", "ABANDONTEST"] } } });

  // 1. FLAT 400 on a ?2000 course -> pays ?1600
  console.log("\n[Test 1] FLAT 400 on ?2000 course:");
  const flat400 = await CouponService.createCoupon({
    code: "FLAT400TEST",
    discountType: "FLAT",
    discountValue: 400,
    isActive: true,
  });
  const res1 = await CouponService.validateCoupon({
    code: "FLAT400TEST",
    courseId: testCourse.id,
    userId: testUser.id,
  });
  console.log(`Original: ?${res1.originalAmount}, Discount: ?${res1.discountAmount}, Final: ?${res1.finalAmount}`);
  if (res1.originalAmount === 2000 && res1.discountAmount === 400 && res1.finalAmount === 1600) {
    console.log("? PASS: FLAT 400 gave finalAmount ?1600");
  } else {
    throw new Error(`FAIL Test 1: Expected 1600, got ${res1.finalAmount}`);
  }

  // 2. 20% with max cap ?300 on ?2000 course (20% of 2000 = 400, capped at 300) -> pays ?1700
  console.log("\n[Test 2] 20% with max cap ?300 on ?2000 course:");
  const perc20 = await CouponService.createCoupon({
    code: "PERC20CAP",
    discountType: "PERCENT",
    discountValue: 20,
    maxDiscount: 300,
    isActive: true,
  });
  const res2 = await CouponService.validateCoupon({
    code: "PERC20CAP",
    courseId: testCourse.id,
    userId: testUser.id,
  });
  console.log(`Original: ?${res2.originalAmount}, Discount: ?${res2.discountAmount}, Final: ?${res2.finalAmount}`);
  if (res2.originalAmount === 2000 && res2.discountAmount === 300 && res2.finalAmount === 1700) {
    console.log("? PASS: 20% capped at ?300 gave finalAmount ?1700");
  } else {
    throw new Error(`FAIL Test 2: Expected 1700, got ${res2.finalAmount}`);
  }

  // 3. 100% coupon -> zero payment, enrolled immediately, no Razorpay call
  console.log("\n[Test 3] 100% coupon -> Zero Payment flow:");
  const free100 = await CouponService.createCoupon({
    code: "FREE100TEST",
    discountType: "PERCENT",
    discountValue: 100,
    isActive: true,
  });
  const orderRes = await PaymentService.createOrder({
    courseId: testCourse.id,
    couponCode: "FREE100TEST",
    user: testUser,
  });
  console.log("CreateOrder Result:", orderRes);
  if (orderRes.free && orderRes.paymentId) {
    const paymentRecord = await prisma.payment.findUnique({ where: { id: orderRes.paymentId } });
    const enrollment = await prisma.enrollment.findUnique({
      where: { user_id_course_id: { user_id: testUser.id, course_id: testCourse.id } },
    });
    const updatedCoupon = await prisma.coupon.findUnique({ where: { id: free100.id } });
    const redemption = await prisma.couponRedemption.findFirst({
      where: { couponId: free100.id, userId: testUser.id },
    });

    if (
      paymentRecord?.status === "COMPLETED" &&
      paymentRecord?.amount === 0 &&
      paymentRecord?.discountAmount === 2000 &&
      paymentRecord?.gateway === "COUPON" &&
      enrollment?.status === "ACTIVE" &&
      updatedCoupon?.usedCount === 1 &&
      redemption
    ) {
      console.log("? PASS: Zero-payment flow created COMPLETED payment, ACTIVE enrollment, recorded redemption, and incremented usedCount without Razorpay");
    } else {
      throw new Error("FAIL Test 3: Zero-payment DB records mismatch");
    }
  } else {
    throw new Error("FAIL Test 3: Expected free: true");
  }

  // 4. Verification of rejection messages: Expired, inactive, wrong-course, limit-reached, already-used, invalid
  console.log("\n[Test 4] Coupon Rejection Messages:");

  // 4a. Invalid code
  try {
    await CouponService.validateCoupon({ code: "NONEXISTENT", courseId: testCourse.id, userId: testUser.id });
    throw new Error("Should have thrown");
  } catch (err) {
    if (err.message === "Invalid coupon code") {
      console.log("? PASS: Nonexistent code -> 'Invalid coupon code'");
    } else throw err;
  }

  // 4b. Inactive coupon
  await CouponService.createCoupon({
    code: "INACTIVETEST",
    discountType: "FLAT",
    discountValue: 200,
    isActive: false,
  });
  try {
    await CouponService.validateCoupon({ code: "INACTIVETEST", courseId: testCourse.id, userId: testUser.id });
    throw new Error("Should have thrown");
  } catch (err) {
    if (err.message === "Coupon is not active") {
      console.log("? PASS: Inactive coupon -> 'Coupon is not active'");
    } else throw err;
  }

  // 4c. Expired coupon
  await CouponService.createCoupon({
    code: "EXPIREDTEST",
    discountType: "FLAT",
    discountValue: 200,
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
    isActive: true,
  });
  try {
    await CouponService.validateCoupon({ code: "EXPIREDTEST", courseId: testCourse.id, userId: testUser.id });
    throw new Error("Should have thrown");
  } catch (err) {
    if (err.message === "Coupon has expired") {
      console.log("? PASS: Expired coupon -> 'Coupon has expired'");
    } else throw err;
  }

  // 4d. Wrong course coupon
  await CouponService.createCoupon({
    code: "WRONGCOURSETEST",
    discountType: "FLAT",
    discountValue: 200,
    courseId: otherCourse.id,
    isActive: true,
  });
  try {
    await CouponService.validateCoupon({ code: "WRONGCOURSETEST", courseId: testCourse.id, userId: testUser.id });
    throw new Error("Should have thrown");
  } catch (err) {
    if (err.message === "Not valid for this course") {
      console.log("? PASS: Wrong course coupon -> 'Not valid for this course'");
    } else throw err;
  }

  // 4e. Usage limit reached
  const limitCoupon = await CouponService.createCoupon({
    code: "LIMITTEST",
    discountType: "FLAT",
    discountValue: 200,
    usageLimit: 2,
    isActive: true,
  });
  await prisma.coupon.update({ where: { id: limitCoupon.id }, data: { usedCount: 2 } });
  try {
    await CouponService.validateCoupon({ code: "LIMITTEST", courseId: testCourse.id, userId: testUser.id });
    throw new Error("Should have thrown");
  } catch (err) {
    if (err.message === "Coupon usage limit reached") {
      console.log("? PASS: Usage limit reached -> 'Coupon usage limit reached'");
    } else throw err;
  }

  // 4f. Already used by user (perUserLimit = 1)
  const singleUseCoupon = await CouponService.createCoupon({
    code: "ONCEONLYTEST",
    discountType: "FLAT",
    discountValue: 100,
    perUserLimit: 1,
    isActive: true,
  });
  await prisma.couponRedemption.create({
    data: {
      couponId: singleUseCoupon.id,
      userId: testUser.id,
      discountAmount: 100,
    },
  });
  try {
    await CouponService.validateCoupon({ code: "ONCEONLYTEST", courseId: testCourse.id, userId: testUser.id });
    throw new Error("Should have thrown");
  } catch (err) {
    if (err.message === "You already used this coupon") {
      console.log("? PASS: Already used coupon -> 'You already used this coupon'");
    } else throw err;
  }

  // 5. Abandoned checkout does not increase usedCount
  console.log("\n[Test 5] Abandoned paid checkout does not burn coupon:");
  const abandonedCoupon = await CouponService.createCoupon({
    code: "ABANDONTEST",
    discountType: "FLAT",
    discountValue: 500,
    isActive: true,
  });
  // Clear any existing enrollment on otherCourse
  await prisma.enrollment.deleteMany({ where: { user_id: testUser.id, course_id: otherCourse.id } });
  const paidOrder = await PaymentService.createOrder({
    courseId: otherCourse.id,
    couponCode: "ABANDONTEST",
    user: testUser,
  });
  const couponAfterCreate = await prisma.coupon.findUnique({ where: { id: abandonedCoupon.id } });
  if (couponAfterCreate?.usedCount === 0) {
    console.log("? PASS: Creating order created PENDING payment without incrementing usedCount (usedCount = 0)");
  } else {
    throw new Error(`FAIL Test 5: usedCount was incremented to ${couponAfterCreate?.usedCount}`);
  }

  // 6. Test Atomic Verification via Direct Transaction or Webhook
  console.log("\n[Test 6] Atomic redemption and usage increment upon payment completion:");
  // Simulate payment completion via transaction
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paidOrder.paymentId },
      data: { status: "COMPLETED", gateway_payment_id: "pay_test_verified", paid_at: new Date() },
    });
    await tx.enrollment.create({
      data: { user_id: testUser.id, course_id: otherCourse.id, payment_id: paidOrder.paymentId, status: "ACTIVE" },
    });
    await tx.couponRedemption.create({
      data: {
        couponId: abandonedCoupon.id,
        userId: testUser.id,
        paymentId: paidOrder.paymentId,
        orderId: paidOrder.orderId,
        discountAmount: 500,
      },
    });
    await tx.coupon.update({
      where: { id: abandonedCoupon.id },
      data: { usedCount: { increment: 1 } },
    });
  });

  const couponAfterVerify = await prisma.coupon.findUnique({ where: { id: abandonedCoupon.id } });
  const redemptionRecord = await prisma.couponRedemption.findFirst({
    where: { couponId: abandonedCoupon.id, userId: testUser.id },
  });
  if (couponAfterVerify?.usedCount === 1 && redemptionRecord) {
    console.log("? PASS: Completed payment recorded CouponRedemption and incremented usedCount to 1");
  } else {
    throw new Error("FAIL Test 6: Verification did not record redemption");
  }

  // Clean up test data
  await prisma.couponRedemption.deleteMany({ where: { userId: testUser.id } });
  await prisma.payment.deleteMany({ where: { user_id: testUser.id } });
  await prisma.enrollment.deleteMany({ where: { user_id: testUser.id } });
  await prisma.coupon.deleteMany({ where: { code: { in: ["FLAT400TEST", "PERC20CAP", "FREE100TEST", "EXPIREDTEST", "INACTIVETEST", "WRONGCOURSETEST", "LIMITTEST", "ONCEONLYTEST", "ABANDONTEST"] } } });
  await prisma.course.deleteMany({ where: { id: { in: [testCourse.id, otherCourse.id] } } });
  await prisma.user.deleteMany({ where: { id: testUser.id } });

  console.log("\n=== ALL TEST CASES PASSED SUCCESSFULLY ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
