import bcrypt from "bcryptjs";
import { prisma } from "../config/db.js";
import { signToken } from "../utils/jwt.js";
import { OtpService } from "./otp.service.js";
import { EmailService } from "./email.service.js";

export class AuthService {
  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  /**
   * Flow A1: Register new user (Unverified until OTP is confirmed)
   */
  static async register({ email, password, firstName, lastName, fullName, username, phone }) {
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username ? username.toLowerCase().trim() : null;

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          ...(normalizedUsername ? [{ username: normalizedUsername }] : []),
        ],
      },
    });

    const password_hash = await AuthService.hashPassword(password);
    const calculatedFullName = fullName || `${firstName || ""} ${lastName || ""}`.trim() || null;

    let user;

    if (existing) {
      if (existing.email.toLowerCase() === normalizedEmail) {
        // If account already exists and is verified
        if (existing.is_verified) {
          const err = new Error("An account with this email address already exists. Please log in.");
          err.statusCode = 409;
          throw err;
        }

        // Account exists but not verified yet — update details and resend fresh OTP
        user = await prisma.user.update({
          where: { id: existing.id },
          data: {
            password_hash,
            first_name: firstName || existing.first_name,
            last_name: lastName || existing.last_name,
            full_name: calculatedFullName || existing.full_name,
            username: normalizedUsername || existing.username,
            phone: phone || existing.phone,
          },
        });
      } else if (normalizedUsername && existing.username?.toLowerCase() === normalizedUsername) {
        const err = new Error("This username is already taken. Please choose another.");
        err.statusCode = 409;
        throw err;
      }
    } else {
      // Determine role: The very first user or if no admin exists becomes ADMIN automatically
      const totalUsers = await prisma.user.count();
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      const isFirstUser = totalUsers === 0 || adminCount === 0;
      const role = isFirstUser ? "ADMIN" : "STUDENT";

      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          password_hash,
          first_name: firstName || null,
          last_name: lastName || null,
          full_name: calculatedFullName,
          username: normalizedUsername,
          phone: phone || null,
          role,
          is_verified: false,
          onboarded: isFirstUser,
        },
      });
    }

    // Generate purpose-scoped signup OTP
    const { rawOtp } = await OtpService.createOtp(user.id, "SIGNUP_VERIFY");

    // Send asynchronous fire-and-forget verification email
    EmailService.sendSignupOtpEmail(
      user.email,
      rawOtp,
      user.first_name || user.full_name || "Learner"
    );

    return {
      message: "Verification code sent to your email.",
      email: user.email,
      requiresVerification: true,
    };
  }

  /**
   * Flow A2: Verify Signup OTP and activate account
   */
  static async verifySignupOtp({ email, otp }) {
    if (!email || !otp) {
      const err = new Error("Email and 6-digit verification code are required.");
      err.statusCode = 400;
      throw err;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });

    if (!user) {
      const err = new Error("Account not found. Please register first.");
      err.statusCode = 404;
      throw err;
    }

    if (user.is_verified) {
      // Already verified, issue token directly
      const token = signToken({ userId: user.id, role: user.role });
      return {
        user: { ...user, role: user.role.toLowerCase() },
        token,
        message: "Account already verified.",
      };
    }

    // Verify purpose-scoped OTP
    await OtpService.verifyOtp(user.id, String(otp).trim(), "SIGNUP_VERIFY");

    // Mark user as verified
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { is_verified: true },
      select: {
        id: true,
        email: true,
        role: true,
        first_name: true,
        last_name: true,
        full_name: true,
        username: true,
        phone: true,
        goal: true,
        is_verified: true,
        onboarded: true,
        avatar_url: true,
        created_at: true,
      },
    });

    // Issue JWT session token
    const token = signToken({ userId: updatedUser.id, role: updatedUser.role });

    return {
      user: {
        ...updatedUser,
        role: updatedUser.role.toLowerCase(),
      },
      token,
      message: "Email successfully verified. Welcome to ArchitectureNext!",
    };
  }

  /**
   * Flow A3 & B2: Resend OTP for either SIGNUP_VERIFY or PASSWORD_RESET
   */
  static async resendOtp({ email, purpose = "SIGNUP_VERIFY" }) {
    if (!email) {
      const err = new Error("Email is required.");
      err.statusCode = 400;
      throw err;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });

    if (!user) {
      // Return success anyway to avoid user enumeration
      return { message: "If this email is registered, a new verification code has been sent." };
    }

    if (purpose === "SIGNUP_VERIFY" && user.is_verified) {
      return { message: "Account is already verified. Please sign in." };
    }

    const { rawOtp } = await OtpService.createOtp(user.id, purpose);

    if (purpose === "SIGNUP_VERIFY") {
      EmailService.sendSignupOtpEmail(
        user.email,
        rawOtp,
        user.first_name || user.full_name || "Learner"
      );
    } else if (purpose === "PASSWORD_RESET") {
      EmailService.sendPasswordResetOtpEmail(
        user.email,
        rawOtp,
        user.first_name || user.full_name || "Learner"
      );
    }

    return { message: "A new verification code has been sent to your email." };
  }

  /**
   * Flow B1: Request Forgot Password OTP (Zero user enumeration)
   */
  static async forgotPassword(email) {
    if (!email) {
      const err = new Error("Email address is required.");
      err.statusCode = 400;
      throw err;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });

    if (user) {
      try {
        const { rawOtp } = await OtpService.createOtp(user.id, "PASSWORD_RESET");
        EmailService.sendPasswordResetOtpEmail(
          user.email,
          rawOtp,
          user.first_name || user.full_name || "Learner"
        );
      } catch (err) {
        // If rate limit error, throw message
        if (err.message.includes("wait")) throw err;
      }
    } else {
      // Fake work to maintain constant timing
      await bcrypt.genSalt(10);
    }

    return {
      message: "If this email is registered, a 6-digit verification code has been sent.",
      email: normalizedEmail,
    };
  }

  /**
   * Flow B2: Verify Reset OTP and generate single-use Reset Token
   */
  static async verifyResetOtp({ email, otp }) {
    if (!email || !otp) {
      const err = new Error("Email and 6-digit verification code are required.");
      err.statusCode = 400;
      throw err;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });

    if (!user) {
      const err = new Error("Invalid verification code or account not found.");
      err.statusCode = 400;
      throw err;
    }

    // Verify OTP with PASSWORD_RESET purpose
    await OtpService.verifyOtp(user.id, String(otp).trim(), "PASSWORD_RESET");

    // Generate single-use password reset authorization token
    const { resetToken } = await OtpService.createPasswordResetToken(user.id);

    return {
      message: "Code verified successfully. Please enter your new password.",
      resetToken,
    };
  }

  /**
   * Flow B3: Reset Password using single-use Reset Token
   */
  static async resetPassword({ resetToken, newPassword }) {
    if (!resetToken || !newPassword) {
      const err = new Error("Reset authorization token and new password are required.");
      err.statusCode = 400;
      throw err;
    }

    if (newPassword.length < 6) {
      const err = new Error("Password must be at least 6 characters long.");
      err.statusCode = 400;
      throw err;
    }

    // Validate and consume the reset token
    const { userId } = await OtpService.consumePasswordResetToken(resetToken);

    const password_hash = await AuthService.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        password_hash,
        reset_password_token: null,
        reset_password_expires: null,
      },
    });

    return { message: "Password has been successfully updated. Please log in with your new password." };
  }

  /**
   * Standard User Login
   */
  static async login({ email, password }) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });

    if (!user) {
      const err = new Error("Invalid email or password.");
      err.statusCode = 401;
      throw err;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const err = new Error("Invalid email or password.");
      err.statusCode = 401;
      throw err;
    }

    // If user is not verified, generate and send fresh OTP and require verification
    if (!user.is_verified) {
      try {
        const { rawOtp } = await OtpService.createOtp(user.id, "SIGNUP_VERIFY");
        EmailService.sendSignupOtpEmail(
          user.email,
          rawOtp,
          user.first_name || user.full_name || "Learner"
        );
      } catch (_) {}

      const error = new Error("Your email address is not verified yet. A new verification code has been sent to your email.");
      error.code = "UNVERIFIED_EMAIL";
      error.email = user.email;
      throw error;
    }

    const token = signToken({ userId: user.id, role: user.role });

    const sanitizedUser = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase(),
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: user.full_name,
      username: user.username,
      phone: user.phone,
      goal: user.goal,
      is_verified: user.is_verified,
      onboarded: user.onboarded,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    };

    return { user: sanitizedUser, token };
  }

  static async getMe(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        first_name: true,
        last_name: true,
        full_name: true,
        username: true,
        phone: true,
        goal: true,
        is_verified: true,
        onboarded: true,
        avatar_url: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      throw new Error("User not found.");
    }

    return {
      ...user,
      role: user.role.toLowerCase(),
    };
  }

  static async updateProfile(userId, updates) {
    const allowed = {};
    if (updates.first_name !== undefined) allowed.first_name = updates.first_name;
    if (updates.last_name !== undefined) allowed.last_name = updates.last_name;
    if (updates.full_name !== undefined) allowed.full_name = updates.full_name;
    if (updates.username !== undefined) allowed.username = updates.username ? updates.username.toLowerCase().trim() : null;
    if (updates.phone !== undefined) allowed.phone = updates.phone;
    if (updates.goal !== undefined) allowed.goal = updates.goal;
    if (updates.onboarded !== undefined) allowed.onboarded = Boolean(updates.onboarded);
    if (updates.avatar_url !== undefined) allowed.avatar_url = updates.avatar_url;

    if ((updates.first_name || updates.last_name) && !updates.full_name) {
      allowed.full_name = `${updates.first_name || ""} ${updates.last_name || ""}`.trim() || null;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: allowed,
      select: {
        id: true,
        email: true,
        role: true,
        first_name: true,
        last_name: true,
        full_name: true,
        username: true,
        phone: true,
        goal: true,
        is_verified: true,
        onboarded: true,
        avatar_url: true,
        created_at: true,
        updated_at: true,
      },
    });

    return {
      ...updated,
      role: updated.role.toLowerCase(),
    };
  }

  static async changePassword(userId, { currentPassword, newPassword }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found.");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new Error("Current password does not match.");
    }

    const password_hash = await AuthService.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password_hash },
    });

    return { message: "Password updated successfully." };
  }
}
