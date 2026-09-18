import { errorResponse } from "../utils/response.js";
import { ZodError } from "zod";
import { config } from "../config/env.js";

// Helper to sanitize sensitive data from error logs
function sanitizePayload(data) {
  if (!data || typeof data !== "object") return data;
  const sanitized = { ...data };
  const sensitiveKeys = ["password", "token", "jwt", "secret", "otp", "otp_hash", "credit_card", "razorpay_signature"];
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof sanitized[key] === "object") {
      sanitized[key] = sanitizePayload(sanitized[key]);
    }
  }
  return sanitized;
}

export function errorHandler(err, req, res, next) {
  const isProduction = config.nodeEnv === "production";
  const statusCode = err.statusCode || (err.status && typeof err.status === "number" ? err.status : 500);

  // Structured server log without leaking sensitive credentials
  const logContext = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.headers["x-forwarded-for"],
    statusCode,
    errorName: err.name,
    message: err.message,
    body: sanitizePayload(req.body),
    stack: isProduction ? undefined : err.stack,
  };

  console.error(`[API ERROR ${logContext.timestamp}] ${req.method} ${req.originalUrl}:`, err.message);
  if (!isProduction && err.stack) {
    console.error(err.stack);
  }

  if (err instanceof ZodError) {
    const errorMessages = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    return errorResponse(res, `Validation error: ${errorMessages}`, 400, err.errors);
  }

  if (err.name === "JsonWebTokenError") {
    return errorResponse(res, "Invalid authentication token", 401);
  }

  if (err.name === "TokenExpiredError") {
    return errorResponse(res, "Authentication token has expired", 401);
  }

  // Mask internal database details or Prisma client errors in production
  let message = err.message || "An unexpected internal server error occurred";
  if (isProduction && (statusCode === 500 || err.name?.includes("Prisma") || err.message?.includes("prisma") || err.code?.startsWith("P20"))) {
    message = "An unexpected internal server error occurred. Please contact support.";
  }

  return errorResponse(res, message, statusCode);
}
