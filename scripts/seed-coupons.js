import { prisma } from "../src/config/db.js";

async function seedCoupons() {
  console.log("Seeding sample test coupons...");

  const sampleCoupons = [
    {
      code: "SAVE400",
      discountType: "FLAT",
      discountValue: 400,
      usageLimit: 100,
      perUserLimit: 1,
      isActive: true,
    },
    {
      code: "LAUNCH50",
      discountType: "PERCENT",
      discountValue: 50,
      maxDiscount: 1500,
      usageLimit: 50,
      perUserLimit: 1,
      isActive: true,
    },
    {
      code: "FREE100",
      discountType: "PERCENT",
      discountValue: 100,
      usageLimit: 20,
      perUserLimit: 1,
      isActive: true,
    },
    {
      code: "SPECIAL20",
      discountType: "PERCENT",
      discountValue: 20,
      maxDiscount: 500,
      usageLimit: 200,
      perUserLimit: 2,
      isActive: true,
    },
    {
      code: "EXPIRED50",
      discountType: "PERCENT",
      discountValue: 50,
      expiresAt: new Date("2024-01-01"),
      isActive: true,
    },
    {
      code: "INACTIVE30",
      discountType: "PERCENT",
      discountValue: 30,
      isActive: false,
    },
  ];

  for (const coupon of sampleCoupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      create: coupon,
      update: coupon,
    });
    console.log(`? Seeded coupon: ${coupon.code}`);
  }

  console.log("Sample coupons seeded successfully!");
}

seedCoupons().catch((err) => {
  console.error("Failed to seed coupons:", err);
  process.exit(1);
});
