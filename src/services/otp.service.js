import crypto from "crypto";
import { prisma } from "../config/db.js";

export const OTP_CONSTANTS = {
  OTP_LENGTH: 6,
  OTP_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
  RESET_TOKEN_EXPIRY_MS: 10 * 60 * 1000, // 10 minutes
  MAX_ATTEMPTS: 5,
  RESEND_COOLDOWN_MS: 30 * 1000, // 30 seconds rate limit for resend
};

export class OtpService {
  /**
   * Hashes plain OTP using SHA-256
   */
  static hashOtp(otp) {
    return crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
  }

  /**
   * Hashes token using SHA-256
   */
  static hashToken(token) {
    return crypto.createHash("sha256").update(String(token).trim()).digest("hex");
  }

  /**
   * Generates a cryptographically random 6-digit numeric OTP
   */
  static generateNumericOtp() {
    return String(crypto.randomInt(100000, 1000000));
  }

  /**
   * Creates a new purpose-scoped OTP for a user, invalidating prior active OTPs
   */
  static async createOtp(userId, purpose) {
    // 1. Rate-limit check: Ensure at least 30s since last active OTP created
    const recentOtp = await prisma.otp.findFirst({
      where: {
        user_id: userId,
        purpose,
        created_at: { gt: new Date(Date.now() - OTP_CONSTANTS.RESEND_COOLDOWN_MS) },
      },
      orderBy: { created_at: "desc" },
    });

    if (recentOtp) {
      const waitSeconds = Math.ceil(
        (OTP_CONSTANTS.RESEND_COOLDOWN_MS - (Date.now() - new Date(recentOtp.created_at).getTime())) / 1000
      );
      const err = new Error(`Please wait ${waitSeconds}s before requesting a new verification code.`);
      err.statusCode = 429;
      throw err;
    }

    // 2. Invalidate / delete old unconsumed OTPs for this user & purpose
    await prisma.otp.deleteMany({
      where: {
        user_id: userId,
        purpose,
      },
    });

    // 3. Generate new cryptographic numeric OTP
    const rawOtp = this.generateNumericOtp();
    const otpHash = this.hashOtp(rawOtp);
    const expiresAt = new Date(Date.now() + OTP_CONSTANTS.OTP_EXPIRY_MS);

    // 4. Store in database
    await prisma.otp.create({
      data: {
        user_id: userId,
        otp_hash: otpHash,
        purpose,
        attempts: 0,
        expires_at: expiresAt,
      },
    });

    return { rawOtp, expiresAt };
  }

  /**
   * Verifies an OTP for a user and purpose
   */
  static async verifyOtp(userId, rawOtp, purpose) {
    if (!rawOtp || typeof rawOtp !== "string") {
      const err = new Error("Invalid verification code provided.");
      err.statusCode = 400;
      throw err;
    }

    const otpRecord = await prisma.otp.findFirst({
      where: {
        user_id: userId,
        purpose,
      },
      orderBy: { created_at: "desc" },
    });

    if (!otpRecord) {
      const err = new Error("No active verification code found. Please request a new code.");
      err.statusCode = 400;
      throw err;
    }

    // Check expiration
    if (new Date() > new Date(otpRecord.expires_at)) {
      await prisma.otp.delete({ where: { id: otpRecord.id } }).catch(() => {});
      const err = new Error("This verification code has expired. Please request a new one.");
      err.statusCode = 400;
      throw err;
    }

    // Check maximum verification attempts
    if (otpRecord.attempts >= OTP_CONSTANTS.MAX_ATTEMPTS) {
      await prisma.otp.delete({ where: { id: otpRecord.id } }).catch(() => {});
      const err = new Error("Maximum attempts exceeded. This code has been invalidated. Please request a new code.");
      err.statusCode = 400;
      throw err;
    }

    const providedHash = this.hashOtp(rawOtp);

    // Timing-safe comparison to prevent timing attacks
    const isMatch =
      providedHash.length === otpRecord.otp_hash.length &&
      crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(otpRecord.otp_hash));

    if (!isMatch) {
      // Increment attempt counter
      const updated = await prisma.otp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });

      const remainingAttempts = OTP_CONSTANTS.MAX_ATTEMPTS - updated.attempts;
      if (remainingAttempts <= 0) {
        await prisma.otp.delete({ where: { id: otpRecord.id } }).catch(() => {});
        const err = new Error("Too many incorrect attempts. This code is now invalidated.");
        err.statusCode = 400;
        throw err;
      }

      const err = new Error(`Incorrect verification code. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining.`);
      err.statusCode = 400;
      throw err;
    }

    // Code matched! Delete consumed OTP immediately
    await prisma.otp.delete({ where: { id: otpRecord.id } });

    return { verified: true };
  }

  /**
   * Issues a separate short-lived single-use password reset authorization token
   */
  static async createPasswordResetToken(userId) {
    // Invalidate previous reset tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { user_id: userId },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + OTP_CONSTANTS.RESET_TOKEN_EXPIRY_MS);

    await prisma.passwordResetToken.create({
      data: {
        user_id: userId,
        token_hash: tokenHash,
        consumed: false,
        expires_at: expiresAt,
      },
    });

    return { resetToken: rawToken, expiresAt };
  }

  /**
   * Validates and consumes a password reset authorization token
   */
  static async consumePasswordResetToken(rawToken) {
    if (!rawToken || typeof rawToken !== "string") {
      throw new Error("Password reset token is required.");
    }

    const tokenHash = this.hashToken(rawToken);

    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!tokenRecord || tokenRecord.consumed) {
      throw new Error("Invalid or already used password reset token.");
    }

    if (new Date() > new Date(tokenRecord.expires_at)) {
      await prisma.passwordResetToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
      throw new Error("Password reset token has expired. Please restart the forgot password process.");
    }

    // Mark as consumed immediately
    await prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { consumed: true },
    });

    return { userId: tokenRecord.user_id };
  }
}
