import { Router } from "express";
import { MediaController } from "../controllers/media.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

// HLS adaptive streaming endpoint for video master playlists, variant playlists, and .ts segments
router.get("/hls/:lessonId/*", requireAuth, MediaController.streamHls);
router.get("/hls/:lessonId", requireAuth, MediaController.streamHls);

// Offline Download Protection & License Issuance
router.post("/offline-license/:lessonId", requireAuth, MediaController.createOfflineLicense);
router.post("/offline-revalidate", requireAuth, MediaController.revalidateOfflineLicenses);
router.post("/download-audit", requireAuth, MediaController.logDownloadAudit);

// Legacy direct video and document endpoints
router.get("/video/:filename", requireAuth, MediaController.streamVideo);
router.get("/document/:filename", requireAuth, MediaController.streamDocument);

export default router;