import { Router } from "express";
import authRoutes from "./auth.routes.js";
import courseRoutes from "./course.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import paymentRoutes from "./payment.routes.js";
import adminRoutes from "./admin.routes.js";
import mediaRoutes from "./media.routes.js";
import testimonialRoutes from "./testimonial.routes.js";
import couponRoutes from "./coupon.routes.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.use("/auth", authRoutes);
router.use("/courses", courseRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/users/me", dashboardRoutes); // Aliased for REST convention
router.use("/payments", paymentRoutes);
router.use("/admin", adminRoutes);
router.use("/media", mediaRoutes);
router.use("/testimonials", testimonialRoutes);
router.use("/coupons", couponRoutes);

export default router;
