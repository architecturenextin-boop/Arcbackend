import crypto from "crypto";
import { config } from "../config/env.js";

const DEFAULT_SECRET = config.streamSigningSecret || config.jwtSecret || "architecturenext-hls-stream-signing-secret-2026";

/**
 * Generates a standard HMAC-SHA256 token containing lessonId, userId, and expiration.
 * Format: base64url(header).base64url(payload).base64url(signature)
 */
export function signStreamToken({ lessonId, userId, expiresInSeconds = 14400 }, secret = DEFAULT_SECRET) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { sub: lessonId, uid: userId, exp };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

/**
 * Validates the HMAC-SHA256 signature and validates expiration and lessonId match.
 */
export function verifyStreamToken(token, expectedLessonId = null, secret = DEFAULT_SECRET) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto.createHmac("sha256", secret).update(data).digest("base64url");

  if (signature.length !== expectedSignature.length) return null;

  try {
    const isSignatureValid = crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(expectedSignature, "utf8")
    );
    if (!isSignatureValid) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null;
    }

    if (expectedLessonId && payload.sub !== expectedLessonId) {
      return null;
    }

    return payload;
  } catch (_) {
    return null;
  }
}