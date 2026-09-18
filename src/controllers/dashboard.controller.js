import { DashboardService } from "../services/dashboard.service.js";
import { successResponse } from "../utils/response.js";

export class DashboardController {
  static async getMyCourses(req, res, next) {
    try {
      const courses = await DashboardService.getMyCourses(req.user.id);
      return successResponse(res, courses);
    } catch (err) {
      next(err);
    }
  }

  static async getMyPurchases(req, res, next) {
    try {
      const purchases = await DashboardService.getMyPurchases(req.user.id);
      return successResponse(res, purchases);
    } catch (err) {
      next(err);
    }
  }
}
