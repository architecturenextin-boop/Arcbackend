import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../src/config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const videoDir = path.resolve(__dirname, "../uploads/videos");
const imageDir = path.resolve(__dirname, "../uploads/images");
const docDir = path.resolve(__dirname, "../uploads/documents");

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

async function uploadFolder(dirPath, folderName, contentTypeDefault) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  console.log(`\n📂 Syncing ${files.length} files from ${folderName} to Cloudflare R2...`);

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const fullPath = path.join(dirPath, filename);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;

    const key = `${folderName}/${filename}`;

    // Check if already in R2
    let alreadyExists = false;
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: config.r2.bucketName, Key: key }));
      alreadyExists = true;
    } catch (_) {}

    if (alreadyExists) {
      console.log(`  [${i + 1}/${files.length}] ⏭️ Already exists in R2: ${key}`);
      continue;
    }

    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
    console.log(`  [${i + 1}/${files.length}] ⬆️ Uploading (${sizeMb} MB): ${key}...`);

    const fileStream = fs.createReadStream(fullPath);
    const ext = path.extname(filename).toLowerCase();
    let contentType = contentTypeDefault;
    if (ext === ".mp4") contentType = "video/mp4";
    if (ext === ".pdf") contentType = "application/pdf";
    if (ext === ".png") contentType = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";

    await s3Client.send(new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
      ContentLength: stat.size,
    }));

    console.log(`  [${i + 1}/${files.length}] ✅ Uploaded: ${key}`);
  }
}

async function runSync() {
  console.log("=== CLOUDFLARE R2 MEDIA SYNC TOOL ===");
  console.log(`Target Bucket: ${config.r2.bucketName}`);
  console.log(`Account ID: ${config.r2.accountId}`);

  try {
    await uploadFolder(videoDir, "videos", "video/mp4");
    await uploadFolder(imageDir, "images", "image/png");
    await uploadFolder(docDir, "documents", "application/pdf");
    console.log("\n🎉 ALL LOCAL MEDIA FILES ARE NOW SYNCHRONIZED TO CLOUDFLARE R2!");
  } catch (err) {
    console.error("❌ Sync Error:", err);
  }
}

runSync();
