import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { prisma } from "../src/config/db.js";
import { hlsService } from "../src/services/hls.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, "../uploads");
const videoDir = path.join(uploadDir, "videos");

async function runHlsMigration() {
  console.log("=== Starting HLS Video Reprocessing Script ===");

  const lessons = await prisma.courseLesson.findMany({
    where: {
      OR: [
        { video_path: { not: null } },
        { video_url: { not: null } },
      ],
    },
    include: {
      module: {
        include: {
          course: true,
        },
      },
    },
  });

  console.log(`Found ${lessons.length} lessons with attached videos.`);

  let convertedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const lesson of lessons) {
    const rawVideo = lesson.video_path || lesson.video_url;
    if (!rawVideo) continue;

    // If already has HLS master playlist and files exist, skip
    if (lesson.hls_url && hlsService.hasHls(lesson.id)) {
      console.log(`[SKIPPED] Lesson "${lesson.title}" (${lesson.id}) already has valid HLS.`);
      skippedCount++;
      continue;
    }

    // Check if video is external (YouTube/Vimeo)
    if (rawVideo.includes("youtube.com") || rawVideo.includes("youtu.be") || rawVideo.includes("vimeo.com")) {
      console.log(`[SKIPPED] Lesson "${lesson.title}" uses external stream (${rawVideo}).`);
      skippedCount++;
      continue;
    }

    // Resolve local file path
    const fileName = path.basename(rawVideo.split("?")[0]);
    let localFilePath = path.join(videoDir, fileName);

    if (!fs.existsSync(localFilePath)) {
      // Check direct uploads directory or variations
      const altPath = path.join(uploadDir, fileName);
      if (fs.existsSync(altPath)) {
        localFilePath = altPath;
      }
    }

    if (!fs.existsSync(localFilePath)) {
      console.warn(`[NOT FOUND] Local video file "${fileName}" for lesson "${lesson.title}" not found at ${localFilePath}. Skipping.`);
      skippedCount++;
      continue;
    }

    console.log(`\n--> Converting: "${lesson.title}" (${lesson.module?.course?.title})`);
    console.log(`    Input: ${localFilePath}`);

    try {
      await hlsService.processLessonVideo(lesson.id, localFilePath);
      convertedCount++;
      console.log(`    [SUCCESS] Transcoded lesson ${lesson.id}`);
    } catch (err) {
      console.error(`    [ERROR] Failed to transcode lesson ${lesson.id}:`, err.message);
      errorCount++;
    }
  }

  console.log("\n=== HLS Reprocessing Summary ===");
  console.log(`Total processed: ${lessons.length}`);
  console.log(`Successfully converted: ${convertedCount}`);
  console.log(`Skipped (already converted / external): ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log("=================================\n");

  await prisma.$disconnect();
}

runHlsMigration().catch((err) => {
  console.error("Migration fatal error:", err);
  process.exit(1);
});
