import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { prisma } from "../src/config/db.js";
import { hlsService } from "../src/services/hls.service.js";
import { r2Service } from "../src/services/r2.service.js";
import { config } from "../src/config/env.js";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, "../uploads");
const videoDir = path.join(uploadDir, "videos");
const hlsDir = path.join(uploadDir, "hls");

let s3Client = null;
if (r2Service.isConfigured()) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: config.r2.endpoint || `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
  });
}

async function uploadHlsDirToR2(lessonId, localLessonDir) {
  if (!s3Client || !config.r2.bucketName) {
    console.log(`[R2] Skipping R2 upload for lesson ${lessonId} (R2 not configured).`);
    return;
  }

  const files = fs.readdirSync(localLessonDir);
  console.log(`    [R2] Uploading ${files.length} HLS files (.m3u8 & .ts) to Cloudflare R2...`);

  for (const file of files) {
    const filePath = path.join(localLessonDir, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    const r2Key = `hls/${lessonId}/${file}`;
    const ext = path.extname(file).toLowerCase();
    const contentType = ext === ".m3u8" ? "application/vnd.apple.mpegurl" : "video/mp2t";

    const fileStream = fs.createReadStream(filePath);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: r2Key,
        Body: fileStream,
        ContentType: contentType,
        ContentLength: stat.size,
        CacheControl: ext === ".m3u8" ? "no-cache, no-store, must-revalidate" : "public, max-age=31536000, immutable",
      })
    );
  }
  console.log(`    [R2] Successfully uploaded all HLS segments for lesson ${lessonId} to R2.`);
}

async function runHlsMigration() {
  console.log("=== Starting HLS Video Reprocessing & R2 Upload Script ===");

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
      const lessonHlsDir = path.join(hlsDir, lesson.id);
      if (fs.existsSync(lessonHlsDir)) {
        await uploadHlsDirToR2(lesson.id, lessonHlsDir);
      }
      convertedCount++;
      console.log(`    [SUCCESS] Transcoded & uploaded lesson ${lesson.id}`);
    } catch (err) {
      console.error(`    [ERROR] Failed to transcode/upload lesson ${lesson.id}:`, err.message);
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