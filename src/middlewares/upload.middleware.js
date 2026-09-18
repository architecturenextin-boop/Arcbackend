import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = Boolean(process.env.VERCEL);
const uploadBaseDir = isVercel 
  ? path.join(os.tmpdir(), "uploads")
  : path.resolve(__dirname, "../../uploads");

const videoDir = path.join(uploadBaseDir, "videos");
const imageDir = path.join(uploadBaseDir, "images");
const documentDir = path.join(uploadBaseDir, "documents");

// Ensure directories exist safely without throwing on read-only serverless environments
try {
  if (!fs.existsSync(uploadBaseDir)) fs.mkdirSync(uploadBaseDir, { recursive: true });
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
  if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
  if (!fs.existsSync(documentDir)) fs.mkdirSync(documentDir, { recursive: true });
} catch (_) {}

// Video Storage Engine
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videoDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    cb(null, `lesson-video-${uniqueSuffix}${ext}`);
  },
});

// Image Storage Engine
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imageDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    cb(null, `img-${uniqueSuffix}${ext}`);
  },
});

// Document/PDF Storage Engine
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, documentDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

// Video upload filter
const videoFileFilter = (req, file, cb) => {
  const allowedExts = [".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext) || file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new Error("Only video files (.mp4, .webm, .mov, .mkv) are allowed."), false);
  }
};

// Image upload filter
const imageFileFilter = (req, file, cb) => {
  const allowedExts = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext) || file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (.png, .jpg, .jpeg, .webp) are allowed."), false);
  }
};

// Document/PDF upload filter
const documentFileFilter = (req, file, cb) => {
  const allowedExts = [
    ".pdf", ".zip", ".rar", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt",
    ".psd", ".dwg", ".mp3", ".wav",
    ".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  if (
    allowedExts.includes(ext) ||
    file.mimetype.includes("pdf") ||
    file.mimetype.includes("document") ||
    file.mimetype.includes("zip") ||
    file.mimetype.startsWith("audio/") ||
    file.mimetype.startsWith("image/") ||
    ext === ".dwg" ||
    ext === ".psd"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only documents, images, and resource files (.pdf, .zip, .rar, .psd, .dwg, .mp3, .wav, .png, .jpg, .jpeg, .webp, office docs) are allowed."), false);
  }
};

export const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1 GB max video size
  },
});

export const uploadImage = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max image size
  },
});

export const uploadDocument = multer({
  storage: documentStorage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max document size
  },
});

// Magic bytes checking function
function checkMagicBytes(filePath, rules) {
  try {
    const buffer = Buffer.alloc(32);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buffer, 0, 32, 0);
    fs.closeSync(fd);

    return rules.some(({ offset, bytes }) => {
      return bytes.every((val, index) => {
        return buffer[offset + index] === val;
      });
    });
  } catch (err) {
    console.error("Magic bytes check failed:", err);
    return false;
  }
}

export function verifyVideoSignature(req, res, next) {
  if (!req.file) return next();

  const isValid = checkMagicBytes(req.file.path, [
    { offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] }, // webm/mkv
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }  // mp4/mov
  ]);

  if (!isValid) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return next(new Error("Security validation failed: File signature does not match video format."));
  }
  next();
}

export function verifyImageSignature(req, res, next) {
  if (!req.file) return next();

  const isValid = checkMagicBytes(req.file.path, [
    { offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] }, // png
    { offset: 0, bytes: [0xFF, 0xD8, 0xFF] },       // jpeg
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // gif
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }  // webp
  ]);

  if (!isValid) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return next(new Error("Security validation failed: File signature does not match image format."));
  }
  next();
}

export function verifyDocumentSignature(req, res, next) {
  if (!req.file) return next();

  // Allow txt files (printable ascii) or binary signatures
  const isTxt = path.extname(req.file.originalname).toLowerCase() === ".txt";
  if (isTxt) {
    return next();
  }

  const isValid = checkMagicBytes(req.file.path, [
    { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // pdf
    { offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] }  // zip / docx / xlsx / pptx
  ]);

  if (!isValid) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return next(new Error("Security validation failed: File signature does not match expected document format."));
  }
  next();
}
