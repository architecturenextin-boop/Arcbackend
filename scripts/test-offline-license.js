import { prisma } from "../src/config/db.js";
import assert from "assert";

async function runOfflineLicenseTests() {
  console.log("=== Running Offline License & Audit Security Tests ===");

  const user = await prisma.user.findFirst();
  assert(user, "User must exist");

  const lesson = await prisma.courseLesson.findFirst({
    include: { module: true },
  });
  assert(lesson, "Lesson must exist");

  const keyId = "test-key-" + Date.now();
  const rawKey = "dGVzdC1hZXMtMjU2LWtleS1leGFtcGxlLWtleS0xMjM=";
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Test 1: Insert license record
  const license = await prisma.offlineLicense.create({
    data: {
      user_id: user.id,
      lesson_id: lesson.id,
      course_id: lesson.module.course_id,
      key_id: keyId,
      encrypted_key: rawKey,
      expires_at: expiresAt,
      revoked: false,
    },
  });
  assert(license.id, "License record must be created");
  console.log("✔ Test 1 Passed: Offline license created with 7-day expiry");

  // Test 2: Insert download audit log
  const audit = await prisma.downloadAuditLog.create({
    data: {
      user_id: user.id,
      lesson_id: lesson.id,
      action: "LICENSE_ISSUED",
      device_info: "PWA Chrome MacOS",
      ip_address: "127.0.0.1",
    },
  });
  assert(audit.id, "Audit log must be created");
  console.log("✔ Test 2 Passed: Download audit log inserted");

  // Cleanup test record
  await prisma.offlineLicense.delete({ where: { id: license.id } });
  await prisma.downloadAuditLog.delete({ where: { id: audit.id } });

  console.log("\nAll Offline License & Audit Security Tests Passed Successfully!\n");
  await prisma.$disconnect();
}

runOfflineLicenseTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});