import { Router } from "express";
import { CouponController } from "../controllers/coupon.controller.js";
import { optionalAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/validate", optionalAuth, CouponController.validate);

export default router;
