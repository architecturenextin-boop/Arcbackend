import { Router } from "express";
import { MediaController } from "../controllers/media.controller.js";
import { optionalAuth } from "../middlewares/auth.middleware.js";

const router = Router();

// Media endpoints support token via header, cookie, or ?token= query parameter, and free preview
router.get("/video/:filename", optionalAuth, MediaController.streamVideo);
router.get("/document/:filename", optionalAuth, MediaController.streamDocument);

export default router;
