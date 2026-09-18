import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(requireAuth);

router.get("/courses", DashboardController.getMyCourses);
router.get("/purchases", DashboardController.getMyPurchases);

export default router;
