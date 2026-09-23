import { config } from "../config/env.js";

/**
 * Formats a media path (e.g. /uploads/images/img-xxx.jpeg) into a fully-qualified URL
 * using APP_URL, Cloudflare R2 public URL, or dynamically configured backend host.
 */
export function formatMediaUrl(urlOrPath, req = null) {
  if (!urlOrPath) return urlOrPath;
  const trimmed = String(urlOrPath).trim();
  if (!trimmed) return trimmed;

  // External or absolute URLs (YouTube, Cloudflare R2, Vimeo, Cloudinary, AWS S3, etc.)
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // If R2 public URL is configured and this is an R2 key (e.g. videos/xxx.mp4 or images/xxx.png)
  if (config.r2?.publicUrl && (trimmed.startsWith("videos/") || trimmed.startsWith("images/") || trimmed.startsWith("documents/"))) {
    const base = config.r2.publicUrl.replace(/\/$/, "");
    return `${base}/${trimmed}`;
  }

  let baseUrl = (config.appUrl || "").replace(/\/$/, "");
  if (!baseUrl && req) {
    baseUrl = `${req.protocol}://${req.get("host")}`;
  }

  if (trimmed.startsWith("/uploads/")) {
    return baseUrl ? `${baseUrl}${trimmed}` : trimmed;
  }

  if (trimmed.startsWith("/api/v1/media/")) {
    return baseUrl ? `${baseUrl}${trimmed}` : trimmed;
  }

  return trimmed;
}

/**
 * Applies formatMediaUrl on a course object's cover_url and thumbnail_url
 */
export function formatCourseMedia(course, req = null) {
  if (!course) return course;
  return {
    ...course,
    cover_url: formatMediaUrl(course.cover_url, req),
    thumbnail_url: formatMediaUrl(course.thumbnail_url || course.cover_url, req),
    preview_video_url: formatMediaUrl(course.preview_video_url, req),
  };
}
