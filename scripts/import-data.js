import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();

async function importAll() {
  const jsonPath = path.resolve(__dirname, "../backups/export-data.json");
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Export file not found at ${jsonPath}. Run 'npm run export:data' first.`);
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
    if (data.course_modules?.length) {
      console.log(`Importing ${data.course_modules.length} modules...`);
      for (const m of data.course_modules) {
        await prisma.courseModule.upsert({
          where: { id: m.id },
          update: m,
          create: m,
        });
      }
    }

    // 4. Lessons
    if (data.course_lessons?.length) {
      console.log(`Importing ${data.course_lessons.length} lessons...`);
      for (const l of data.course_lessons) {
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
    if (data.lesson_progress?.length) {
      console.log(`Importing ${data.lesson_progress.length} progress records...`);
      for (const lp of data.lesson_progress) {
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
