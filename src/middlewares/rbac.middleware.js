import { errorResponse } from "../utils/response.js";

export function requireRole(allowedRoles = ["ADMIN"]) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, "Unauthorized: Authentication required", 401);
    }

    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole)) {
      return errorResponse(res, "Forbidden: You do not have permission to perform this action", 403);
    }

    next();
  };
}

export const requireAdmin = requireRole(["ADMIN"]);
