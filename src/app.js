import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import apiRoutes from "./routes/index.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { config } from "./config/env.js";
import { apiLimiter } from "./middlewares/rate-limit.middleware.js";

import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Razorpay & SMTP configuration active
const app = express();

// Ensure upload directories exist safely in both local and serverless environments
const isVercel = Boolean(process.env.VERCEL);
const uploadDir = isVercel 
  ? path.join(os.tmpdir(), "uploads")
  : path.resolve(__dirname, "../uploads");
const videoUploadDir = path.join(uploadDir, "videos");
const imageUploadDir = path.join(uploadDir, "images");
const docUploadDir = path.join(uploadDir, "documents");
const hlsUploadDir = path.join(uploadDir, "hls");

try {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  if (!fs.existsSync(videoUploadDir)) fs.mkdirSync(videoUploadDir, { recursive: true });
  if (!fs.existsSync(imageUploadDir)) fs.mkdirSync(imageUploadDir, { recursive: true });
  if (!fs.existsSync(docUploadDir)) fs.mkdirSync(docUploadDir, { recursive: true });
  if (!fs.existsSync(hlsUploadDir)) fs.mkdirSync(hlsUploadDir, { recursive: true });
} catch (_) {}

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "*"],
      mediaSrc: ["'self'", "blob:", "*"],
      connectSrc: ["'self'", "*"],
    }
  },
  frameguard: { action: "sameorigin" },
}));

// Restrict static uploads: Only public images (covers, avatars) are served directly.
app.use("/uploads/images", express.static(imageUploadDir));

// Block direct unauthenticated access to private video and document uploads
app.use("/uploads/videos", (req, res) => {
  res.status(403).json({
    success: false,
    message: "Direct access to private videos is prohibited. Access via authenticated /api/v1/media/video/:filename",
  });
});

app.use("/uploads/hls", (req, res) => {
  res.status(403).json({
    success: false,
    message: "Direct access to HLS streams is prohibited. Access via authenticated /api/v1/media/hls/:lessonId/master.m3u8",
  });
});

app.use("/uploads/documents", (req, res) => {
  res.status(403).json({
    success: false,
    message: "Direct access to private documents is prohibited. Access via authenticated /api/v1/media/document/:filename",
  });
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    // Allow architecturenext.in, vercel preview deployments, and local development
    if (
      origin.includes("architecturenext.in") ||
      origin.includes("vercel.app") ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin === config.frontendUrl
    ) {
      return callback(null, true);
    }
    // Fallback allow
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  optionsSuccessStatus: 200,
}));

// Enable pre-flight for all routes
app.options("*", cors());

app.use(morgan("dev"));

// Webhook raw body parser MUST be mounted BEFORE global express.json()
app.use("/api/v1/payments/webhook", express.raw({ type: "application/json" }), (req, res, next) => {
  req.rawBody = req.body; // Save the raw Buffer
  next();
});

// Capture raw body for verification (Razorpay webhook, etc.)
app.use(express.json({
  limit: "10mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Apply rate limiting
app.use("/api/v1", apiLimiter);

// Health-check endpoint for container orchestrators/monitoring
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

// Mount API v1 routes
app.use("/api/v1", apiRoutes);

// Catch 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Centralized error handling
app.use(errorHandler);

export default app;


