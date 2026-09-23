import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { prisma } from "../config/db.js";
import { r2Service } from "../services/r2.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = Boolean(process.env.VERCEL);
const uploadBaseDir = isVercel 
  ? path.join(os.tmpdir(), "uploads")
  : path.resolve(__dirname, "../../uploads");

const videoDir = path.join(uploadBaseDir, "videos");
const docDir = path.join(uploadBaseDir, "documents");

const MIME_MAP = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".m4v": "video/x-m4v",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".psd": "image/vnd.adobe.photoshop",
  ".dwg": "application/acad",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain",
};

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

function streamFile(req, res, filePath, contentType) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || (parts[1] && isNaN(end)) || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
      return res.end();
    }

    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": contentType,
    });

    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

export class MediaController {
  static async streamVideo(req, res, next) {
    try {
      const rawFilename = req.params.filename;
      if (!rawFilename) {
        return res.status(400).json({ success: false, message: "Filename is required." });
      }

      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required." });
      }

      // 1. Prevent path traversal
      const cleanFilename = path.basename(rawFilename);
      const filePath = path.resolve(videoDir, cleanFilename);
      const isLocal = filePath.startsWith(videoDir) && fs.existsSync(filePath);

      const isAdmin = user.role === "ADMIN";

      // 2. Identify the owning lesson if not authorized purely by admin role
      let authorized = isAdmin;

      if (!authorized) {
        const lesson = await prisma.courseLesson.findFirst({
          where: {
            OR: [
              { video_path: { contains: cleanFilename } },
              { video_url: { contains: cleanFilename } },
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

        if (lesson) {
          if (lesson.is_free) {
            authorized = true;
          } else {
            const enrollment = await prisma.enrollment.findUnique({
              where: {
                user_id_course_id: {
                  user_id: user.id,
                  course_id: lesson.module.course_id,
                },
              },
            });
            if (enrollment && enrollment.status === "ACTIVE") {
              authorized = true;
            }
          }
        }
      }

      if (!authorized) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You must be actively enrolled in this course to access this video.",
        });
      }

      // 3. Serve from Cloudflare R2 if configured
      if (r2Service.isConfigured()) {
        const possibleKeys = [
          `videos/${cleanFilename}`,
          cleanFilename,
          `uploads/videos/${cleanFilename}`,
        ];

        for (const key of possibleKeys) {
          const exists = await r2Service.objectExists(key);
          if (exists) {
            const presignedUrl = await r2Service.getPresignedDownloadUrl({ key, expiresIn: 14400 });
            return res.redirect(302, presignedUrl);
          }
        }

        // Try direct key if filename matches
        try {
          const presignedUrl = await r2Service.getPresignedDownloadUrl({ key: `videos/${cleanFilename}`, expiresIn: 14400 });
          return res.redirect(302, presignedUrl);
        } catch (_) {}
      }

      // 4. Fallback to local storage if available
      if (isLocal) {
        return streamFile(req, res, filePath, getContentType(cleanFilename));
      }

      return res.status(404).json({
        success: false,
        message: "Video file not found in storage. If using Cloudflare R2, ensure the file is uploaded to the R2 bucket.",
      });
    } catch (err) {
      next(err);
    }
  }

  static async streamDocument(req, res, next) {
    try {
      const rawFilename = req.params.filename;
      if (!rawFilename) {
        return res.status(400).json({ success: false, message: "Filename is required." });
      }

      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required." });
      }

      // 1. Prevent path traversal
      const cleanFilename = path.basename(rawFilename);
      const filePath = path.resolve(docDir, cleanFilename);
      const isLocal = filePath.startsWith(docDir) && fs.existsSync(filePath);

      const isAdmin = user.role === "ADMIN";

      // 2. Identify the owning lesson if not authorized purely by admin role
      let authorized = isAdmin;

      if (!authorized) {
        const lesson = await prisma.courseLesson.findFirst({
          where: {
            OR: [
              { pdf_path: { contains: cleanFilename } },
              { pdf_url: { contains: cleanFilename } },
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

        if (lesson) {
          if (lesson.is_free) {
            authorized = true;
          } else {
            const enrollment = await prisma.enrollment.findUnique({
              where: {
                user_id_course_id: {
                  user_id: user.id,
                  course_id: lesson.module.course_id,
                },
              },
            });
            if (enrollment && enrollment.status === "ACTIVE") {
              authorized = true;
            }
          }
        }
      }

      if (!authorized) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You must be actively enrolled in this course to access this document.",
        });
      }

      // 3. Serve from Cloudflare R2 if configured
      if (r2Service.isConfigured()) {
        const possibleKeys = [
          `documents/${cleanFilename}`,
          cleanFilename,
          `uploads/documents/${cleanFilename}`,
        ];

        for (const key of possibleKeys) {
          const exists = await r2Service.objectExists(key);
          if (exists) {
            const presignedUrl = await r2Service.getPresignedDownloadUrl({ key, expiresIn: 14400 });
            return res.redirect(302, presignedUrl);
          }
        }

        try {
          const presignedUrl = await r2Service.getPresignedDownloadUrl({ key: `documents/${cleanFilename}`, expiresIn: 14400 });
          return res.redirect(302, presignedUrl);
        } catch (_) {}
      }

      // 4. Fallback to local storage if available
      if (isLocal) {
        return streamFile(req, res, filePath, getContentType(cleanFilename));
      }

      return res.status(404).json({
        success: false,
        message: "Document file not found in storage.",
      });
    } catch (err) {
      next(err);
    }
  }
}
