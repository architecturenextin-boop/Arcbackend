import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { prisma } from "../config/db.js";
import { r2Service } from "../services/r2.service.js";
import { config } from "../config/env.js";
import { signStreamToken } from "../utils/stream-token.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = Boolean(process.env.VERCEL);
const uploadDir = isVercel 
  ? path.join(os.tmpdir(), "uploads")
  : path.resolve(__dirname, "../../uploads");

const videoDir = path.join(uploadDir, "videos");
const docDir = path.join(uploadDir, "documents");
const hlsDir = path.join(uploadDir, "hls");

const MIME_TYPES = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function streamFile(req, res, filePath, contentType) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Accept-Ranges", "bytes");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
      return res.end();
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Content-Length": chunksize,
      "Content-Type": contentType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
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

      const cleanFilename = path.basename(rawFilename);
      const filePath = path.resolve(videoDir, cleanFilename);
      const isLocal = filePath.startsWith(videoDir) && fs.existsSync(filePath);

      const isAdmin = user.role === "ADMIN";

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

        try {
          const presignedUrl = await r2Service.getPresignedDownloadUrl({ key: `videos/${cleanFilename}`, expiresIn: 14400 });
          return res.redirect(302, presignedUrl);
        } catch (_) {}
      }

      if (isLocal && !isVercel) {
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

  /**
   * Serverless HLS Token Issuer & Edge Router
   * Never streams video chunks (.ts/.m3u8) through Vercel functions.
   * Validates enrollment and returns signed Worker URL + token, or redirects.
   */
  static async streamHls(req, res, next) {
    try {
      const { lessonId } = req.params;
      const requestedFile = req.params[0] || req.params.file || "";

      if (!lessonId) {
        return res.status(400).json({ success: false, message: "Lesson ID is required." });
      }

      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required." });
      }

      const isAdmin = user.role === "ADMIN";

      // 1. Authorize user against lesson enrollment / free preview
      let authorized = isAdmin;

      if (!authorized) {
        const lesson = await prisma.courseLesson.findUnique({
          where: { id: lessonId },
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
          message: "Forbidden: You must be actively enrolled in this course to stream this lesson.",
        });
      }

      // 2. Issue signed HMAC token with 4-hour TTL
      const streamToken = signStreamToken(
        { lessonId, userId: user.id, expiresInSeconds: 14400 },
        config.streamSigningSecret
      );

      // Set signed cookie for parent domain .architecturenext.in
      const isProd = config.nodeEnv === "production" || isVercel;
      const cookieOptions = {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "lax" : "lax",
        maxAge: 14400 * 1000,
        path: "/",
        ...(isProd ? { domain: ".architecturenext.in" } : {}),
      };

      try {
        res.cookie("stream_token", streamToken, cookieOptions);
      } catch (_) {}

      const workerBase = config.streamWorkerUrl || "";
      const targetFileName = requestedFile ? path.basename(requestedFile) : "master.m3u8";
      const workerUrl = `${workerBase}/hls/${lessonId}/${targetFileName}?token=${encodeURIComponent(streamToken)}`;

      // 3. If direct media file is requested by browser (.m3u8 / .ts), 302 redirect to Edge Worker
      if (targetFileName.endsWith(".m3u8") || targetFileName.endsWith(".ts")) {
        if (!isVercel && config.nodeEnv === "development" && !r2Service.isConfigured()) {
          const filePath = path.resolve(hlsDir, lessonId, targetFileName);
          if (fs.existsSync(filePath)) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.setHeader("Accept-Ranges", "bytes");

            if (targetFileName.endsWith(".m3u8")) {
              res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
              res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            } else if (targetFileName.endsWith(".ts")) {
              res.setHeader("Content-Type", "video/mp2t");
              res.setHeader("Cache-Control", "public, max-age=86400, immutable");
            }
            return fs.createReadStream(filePath).pipe(res);
          }
        }

        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.redirect(302, workerUrl);
      }

      // 4. Return token & Worker URL JSON payload
      return res.json({
        success: true,
        data: {
          lesson_id: lessonId,
          token: streamToken,
          master_url: `${workerBase}/hls/${lessonId}/master.m3u8?token=${encodeURIComponent(streamToken)}`,
          stream_worker_url: workerBase,
          expires_in: 14400,
          expires_at: Math.floor(Date.now() / 1000) + 14400,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Generates a per-user, per-lesson AES-256 encryption key for offline PWA storage.
   * Default validity: 7 days.
   */
  static async createOfflineLicense(req, res, next) {
    try {
      const { lessonId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required." });
      }

      const isAdmin = user.role === "ADMIN";

      // 1. Verify lesson and access rights
      const lesson = await prisma.courseLesson.findUnique({
        where: { id: lessonId },
        include: { module: { include: { course: true } } },
      });

      if (!lesson) {
        return res.status(404).json({ success: false, message: "Lesson not found." });
      }

      let authorized = isAdmin;
      if (!authorized) {
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

      if (!authorized) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: Active enrollment required to download lesson for offline playback.",
        });
      }

      // 2. Download limit check (Max 10 active downloads per user)
      const MAX_DOWNLOADS = parseInt(process.env.MAX_OFFLINE_DOWNLOADS || "10", 10);
      const activeLicensesCount = await prisma.offlineLicense.count({
        where: {
          user_id: user.id,
          revoked: false,
          expires_at: { gt: new Date() },
        },
      });

      const existingLicense = await prisma.offlineLicense.findFirst({
        where: {
          user_id: user.id,
          lesson_id: lessonId,
          revoked: false,
        },
      });

      if (!existingLicense && activeLicensesCount >= MAX_DOWNLOADS) {
        return res.status(400).json({
          success: false,
          message: `Download limit reached (${MAX_DOWNLOADS} lessons). Please delete an older offline lesson before downloading a new one.`,
        });
      }

      // 3. Issue AES-256 license key (expires in 7 days)
      const keyId = crypto.randomUUID();
      const rawKey = crypto.randomBytes(32).toString("base64");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const license = await prisma.offlineLicense.create({
        data: {
          id: crypto.randomUUID(),
          user_id: user.id,
          lesson_id: lessonId,
          course_id: lesson.module.course_id,
          key_id: keyId,
          encrypted_key: rawKey,
          expires_at: expiresAt,
          revoked: false,
        },
      });

      // 4. Audit Log
      await prisma.downloadAuditLog.create({
        data: {
          id: crypto.randomUUID(),
          user_id: user.id,
          lesson_id: lessonId,
          action: "LICENSE_ISSUED",
          device_info: (req.headers["user-agent"] || "").slice(0, 500),
          ip_address: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
        },
      });

      return res.json({
        success: true,
        data: {
          license_id: license.id,
          key_id: keyId,
          key: rawKey,
          algorithm: "AES-GCM",
          expires_at: expiresAt.toISOString(),
          lesson_id: lessonId,
          max_downloads: MAX_DOWNLOADS,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Batch license revalidation endpoint for online synchronization.
   */
  static async revalidateOfflineLicenses(req, res, next) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required." });
      }

      const { licenses = [] } = req.body;
      const isAdmin = user.role === "ADMIN";

      const results = {
        valid: [],
        revoked: [],
        expired: [],
      };

      for (const item of licenses) {
        const { lesson_id, key_id } = item;
        const license = await prisma.offlineLicense.findFirst({
          where: {
            user_id: user.id,
            lesson_id,
            key_id,
          },
          include: {
            lesson: {
              include: { module: true },
            },
          },
        });

        if (!license) {
          results.revoked.push(lesson_id);
          continue;
        }

        if (license.revoked) {
          results.revoked.push(lesson_id);
          continue;
        }

        if (new Date(license.expires_at) < new Date()) {
          results.expired.push(lesson_id);
          continue;
        }

        // Verify active enrollment
        if (!isAdmin && !license.lesson?.is_free) {
          const enrollment = await prisma.enrollment.findUnique({
            where: {
              user_id_course_id: {
                user_id: user.id,
                course_id: license.course_id,
              },
            },
          });

          if (!enrollment || enrollment.status !== "ACTIVE") {
            await prisma.offlineLicense.update({
              where: { id: license.id },
              data: { revoked: true },
            });
            results.revoked.push(lesson_id);
            continue;
          }
        }

        results.valid.push(lesson_id);
      }

      return res.json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Log offline download actions (DOWNLOAD_START, DOWNLOAD_COMPLETE, DOWNLOAD_DELETE)
   */
  static async logDownloadAudit(req, res, next) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required." });
      }

      const { lesson_id, action, device_info } = req.body;
      if (!lesson_id || !action) {
        return res.status(400).json({ success: false, message: "lesson_id and action are required." });
      }

      await prisma.downloadAuditLog.create({
        data: {
          id: crypto.randomUUID(),
          user_id: user.id,
          lesson_id,
          action: String(action).slice(0, 50),
          device_info: (device_info || req.headers["user-agent"] || "").slice(0, 500),
          ip_address: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
        },
      });

      return res.json({ success: true, message: "Audit log recorded." });
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

      const cleanFilename = path.basename(rawFilename);
      const filePath = path.resolve(docDir, cleanFilename);
      const isLocal = filePath.startsWith(docDir) && fs.existsSync(filePath);

      const isAdmin = user.role === "ADMIN";

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

      if (isLocal && !isVercel) {
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