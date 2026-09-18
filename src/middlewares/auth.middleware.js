import crypto from "crypto";
import { verifyToken } from "../utils/jwt.js";
import { prisma } from "../config/db.js";
import { errorResponse } from "../utils/response.js";

export async function requireAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query && typeof req.query.token === "string") {
      token = req.query.token;
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return errorResponse(res, "Unauthorized: Authentication token is missing", 401);
    }

    const tokenHash = crypto.createHash("sha256").update(String(token).trim()).digest("hex");
    const isBlacklisted = await prisma.tokenBlacklist.findUnique({
      where: { token_hash: tokenHash },
    });

    if (isBlacklisted) {
      return errorResponse(res, "Unauthorized: Token has been revoked", 401);
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return errorResponse(res, "Unauthorized: Invalid or expired token", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
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
        onboarded: true,
        avatar_url: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      return errorResponse(res, "Unauthorized: User account no longer exists", 401);
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    return errorResponse(res, "Authentication verification failed", 401);
  }
}

export async function optionalAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query && typeof req.query.token === "string") {
      token = req.query.token;
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      const decoded = verifyToken(token);
      if (decoded && decoded.userId) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
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
            onboarded: true,
            avatar_url: true,
          },
        });
        if (user) req.user = user;
      }
    }
    next();
  } catch (err) {
    next();
  }
}
