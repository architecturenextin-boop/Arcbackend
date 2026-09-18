import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();

async function importAll() {
  let jsonPath = path.resolve(__dirname, "../backups/latest_backup.json");
  if (!fs.existsSync(jsonPath)) {
    jsonPath = path.resolve(__dirname, "../backups/export-data.json");
  }
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Backup file not found in backups directory.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, "utf8");
  const { data } = JSON.parse(raw);

  console.log("🚀 Starting database import into target database...");

  try {
    // 1. Users
    if (data.users?.length) {
      console.log(`Importing ${data.users.length} users...`);
      for (const u of data.users) {
        await prisma.user.upsert({
          where: { id: u.id },
          update: u,
          create: u,
        });
      }
    }

    // 2. Courses
    if (data.courses?.length) {
      console.log(`Importing ${data.courses.length} courses...`);
      for (const c of data.courses) {
        await prisma.course.upsert({
          where: { id: c.id },
          update: c,
          create: c,
        });
      }
    }

    // 3. Modules
    const modules = data.courseModules || data.course_modules || [];
    if (modules.length) {
      console.log(`Importing ${modules.length} modules...`);
      for (const m of modules) {
        await prisma.courseModule.upsert({
          where: { id: m.id },
          update: m,
          create: m,
        });
      }
    }

    // 4. Lessons
    const lessons = data.courseLessons || data.course_lessons || [];
    if (lessons.length) {
      console.log(`Importing ${lessons.length} lessons...`);
      for (const l of lessons) {
        await prisma.courseLesson.upsert({
          where: { id: l.id },
          update: l,
          create: l,
        });
      }
    }

    // 5. Payments
    if (data.payments?.length) {
      console.log(`Importing ${data.payments.length} payments...`);
      for (const p of data.payments) {
        await prisma.payment.upsert({
          where: { id: p.id },
          update: p,
          create: p,
        });
      }
    }

    // 6. Enrollments
    if (data.enrollments?.length) {
      console.log(`Importing ${data.enrollments.length} enrollments...`);
      for (const e of data.enrollments) {
        await prisma.enrollment.upsert({
          where: { id: e.id },
          update: e,
          create: e,
        });
      }
    }

    // 7. Lesson Progress
    const progress = data.lessonProgress || data.lesson_progress || [];
    if (progress.length) {
      console.log(`Importing ${progress.length} progress records...`);
      for (const lp of progress) {
        await prisma.lessonProgress.upsert({
          where: { id: lp.id },
          update: lp,
          create: lp,
        });
      }
    }

    console.log("✅ All data successfully imported into target database!");
  } catch (err) {
    console.error("❌ Import failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importAll();
