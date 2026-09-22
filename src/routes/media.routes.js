import { Router } from "express";
import { MediaController } from "../controllers/media.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

// Both video and document endpoints require valid authentication token
router.get("/video/:filename", requireAuth, MediaController.streamVideo);
router.get("/document/:filename", requireAuth, MediaController.streamDocument);

export default router;
