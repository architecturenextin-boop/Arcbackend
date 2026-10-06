import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/db.js";
import { signToken } from "../utils/jwt.js";
import { OtpService } from "./otp.service.js";
import { EmailService } from "./email.service.js";
import { config } from "../config/env.js";

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

        // Account exists but not verified yet � update details and resend fresh OTP
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
          role: role,
          is_verified: false,
          onboarded: false,
          auth_provider: "EMAIL",
        },
      });
    }

    // Generate and send 6-digit OTP
    const { rawOtp } = await OtpService.createOtp(user.id, "SIGNUP_VERIFY");
    await EmailService.sendSignupOtpEmail(
      user.email,
      rawOtp,
      user.first_name || user.full_name || "Learner"
    );

    return {
      message: "A 6-digit verification code has been sent to your email address.",
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
      const err = new Error("User with this email was not found.");
      err.statusCode = 404;
      throw err;
    }

    if (user.is_verified) {
      const token = signToken({ userId: user.id, role: user.role });
      return {
        message: "Email is already verified. You can proceed.",
        user: {
          id: user.id,
          email: user.email,
          role: user.role.toLowerCase(),
          first_name: user.first_name,
          last_name: user.last_name,
          full_name: user.full_name,
          username: user.username,
          phone: user.phone,
          goal: user.goal,
          is_verified: true,
          onboarded: user.onboarded,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
        },
        token,
      };
    }

    // Verify the OTP
    await OtpService.verifyOtp(user.id, String(otp).trim(), "SIGNUP_VERIFY");

    // Activate the user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { is_verified: true },
    });

    // Send welcome email (non-blocking / error-safe)
    try {
      if (typeof EmailService?.sendWelcomeEmail === "function") {
        await EmailService.sendWelcomeEmail(
          updatedUser.email,
          updatedUser.first_name || updatedUser.full_name || "Learner"
        );
      }
    } catch (emailErr) {
      console.error("[EMAIL NON-CRITICAL] Failed to send welcome email on signup verification:", emailErr?.message);
    }

    const token = signToken({ userId: updatedUser.id, role: updatedUser.role });

    return {
      message: "Email verified successfully! Welcome to ArchitectureNext.",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role.toLowerCase(),
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        full_name: updatedUser.full_name,
        username: updatedUser.username,
        phone: updatedUser.phone,
        goal: updatedUser.goal,
        is_verified: true,
        onboarded: updatedUser.onboarded,
        avatar_url: updatedUser.avatar_url,
        created_at: updatedUser.created_at,
      },
      token,
    };
  }

  /**
   * Resend OTP for either SIGNUP_VERIFY or PASSWORD_RESET
   */
  static async resendOtp({ email, purpose = "SIGNUP_VERIFY" }) {
    if (!email) {
      const err = new Error("Email address is required.");
      err.statusCode = 400;
      throw err;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });

    if (!user) {
      return { message: "If the email is registered, a new code has been sent." };
    }

    const { rawOtp } = await OtpService.createOtp(user.id, purpose);

    if (purpose === "SIGNUP_VERIFY") {
      await EmailService.sendSignupOtpEmail(
        user.email,
        rawOtp,
        user.first_name || user.full_name || "Learner"
      );
    } else if (purpose === "PASSWORD_RESET") {
      await EmailService.sendPasswordResetOtpEmail(
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
        await EmailService.sendPasswordResetOtpEmail(
          user.email,
          rawOtp,
          user.first_name || user.full_name || "Learner"
        );
      } catch (err) {
        if (err.message.includes("wait")) throw err;
      }
    } else {
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

    await OtpService.verifyOtp(user.id, String(otp).trim(), "PASSWORD_RESET");
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
   * Standard User Login (Email + Password)
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

    if (!user.password_hash) {
      const err = new Error("This account was created with Google Sign-In. Please click 'Continue with Google' to sign in.");
      err.statusCode = 400;
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
        await EmailService.sendSignupOtpEmail(
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

  /**
   * Google OAuth 2.0 / GIS Authentication
   */
  static async googleAuth({ credential }) {
    if (!credential) {
      const err = new Error("Google credential token is required.");
      err.statusCode = 400;
      throw err;
    }

    const clientId = config.googleClientId;
    const client = new OAuth2Client(clientId);

    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
    } catch (error) {
      const err = new Error("Invalid or expired Google credential token.");
      err.statusCode = 401;
      throw err;
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      const err = new Error("Unable to retrieve email from Google profile.");
      err.statusCode = 400;
      throw err;
    }

    if (!payload.email_verified) {
      const err = new Error("Your Google email is not verified by Google.");
      err.statusCode = 400;
      throw err;
    }

    const normalizedEmail = payload.email.toLowerCase().trim();
    const googleId = payload.sub;
    const givenName = payload.given_name || payload.name?.split(" ")[0] || "Learner";
    const familyName = payload.family_name || (payload.name ? payload.name.split(" ").slice(1).join(" ") : "") || "";
    const fullName = payload.name || `${givenName} ${familyName}`.trim() || "Learner";
    const avatarUrl = payload.picture || null;

    // 1. Find user by google_id or email
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { google_id: googleId },
          { email: { equals: normalizedEmail, mode: "insensitive" } },
        ],
      },
    });

    let isNewUser = false;

    if (user) {
      // If user exists, link google_id if not present & ensure verified
      const updateData = {};
      if (!user.google_id) {
        updateData.google_id = googleId;
        updateData.auth_provider = "GOOGLE";
      }
      if (!user.is_verified) {
        updateData.is_verified = true;
      }
      if (!user.avatar_url && avatarUrl) {
        updateData.avatar_url = avatarUrl;
      }
      if (!user.first_name && givenName) {
        updateData.first_name = givenName;
      }
      if (!user.last_name && familyName) {
        updateData.last_name = familyName;
      }
      if (!user.full_name && fullName) {
        updateData.full_name = fullName;
      }

      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      }
    } else {
      // 2. Create new user
      isNewUser = true;

      // Generate unique username
      let baseUsername = normalizedEmail.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "learner";
      let candidateUsername = baseUsername;
      let counter = 1;
      while (await prisma.user.findUnique({ where: { username: candidateUsername } })) {
        candidateUsername = `${baseUsername}${counter}`;
        counter++;
      }

      // Check if this is the first user in system
      const totalUsers = await prisma.user.count();
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      const isFirstUser = totalUsers === 0 || adminCount === 0;
      const role = isFirstUser ? "ADMIN" : "STUDENT";

      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          google_id: googleId,
          auth_provider: "GOOGLE",
          first_name: givenName,
          last_name: familyName,
          full_name: fullName,
          username: candidateUsername,
          avatar_url: avatarUrl,
          is_verified: true,
          onboarded: false,
          role: role,
        },
      });

      // Send welcome email in background (error-safe)
      try {
        if (typeof EmailService?.sendWelcomeEmail === "function") {
          EmailService.sendWelcomeEmail(
            user.email,
            user.first_name || user.full_name || "Learner"
          ).catch((emailErr) => {
            console.error("[EMAIL NON-CRITICAL] Failed to send welcome email on Google OAuth:", emailErr?.message);
          });
        }
      } catch (emailErr) {
        console.error("[EMAIL NON-CRITICAL] Failed to trigger welcome email on Google OAuth:", emailErr?.message);
      }
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

    return { user: sanitizedUser, token, isNewUser };
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

    if (!user.password_hash) {
      throw new Error("This account uses Google Sign-In and does not have a local password set.");
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
