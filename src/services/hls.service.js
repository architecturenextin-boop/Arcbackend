import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { prisma } from "../config/db.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = Boolean(process.env.VERCEL);
const uploadDir = isVercel
  ? path.join(os.tmpdir(), "uploads")
  : path.resolve(__dirname, "../../uploads");
const hlsBaseDir = path.join(uploadDir, "hls");

if (!fs.existsSync(hlsBaseDir)) {
  try {
    fs.mkdirSync(hlsBaseDir, { recursive: true });
  } catch (_) {}
}

/**
 * Generates an HLS rendition (playlist + .ts segments) for a specific resolution/bitrate
 */
function transcodeRendition(inputPath, outputDir, rendition) {
  return new Promise((resolve, reject) => {
    const { name, resolution, videoBitrate, audioBitrate } = rendition;
    const outputPlaylist = path.join(outputDir, `${name}.m3u8`);
    const segmentPattern = path.join(outputDir, `${name}_%03d.ts`);

    ffmpeg(inputPath)
      .outputOptions([
        "-profile:v main",
        "-sc_threshold 0",
        "-g 48",
        "-keyint_min 48",
        "-hls_time 6",
        "-hls_playlist_type vod",
        `-hls_segment_filename ${segmentPattern}`,
        `-b:v ${videoBitrate}`,
        `-maxrate ${videoBitrate}`,
        `-bufsize ${parseInt(videoBitrate) * 2}k`,
        `-b:a ${audioBitrate}`,
        "-ar 44100",
        `-vf scale=w=${resolution.w}:h=${resolution.h}:force_original_aspect_ratio=decrease,pad=${resolution.w}:${resolution.h}:(ow-iw)/2:(oh-ih)/2`,
      ])
      .output(outputPlaylist)
      .on("start", (cmd) => {
        console.log(`[HLS] Starting rendition ${name}: ${cmd}`);
      })
      .on("end", () => {
        console.log(`[HLS] Finished rendition ${name}`);
        resolve(outputPlaylist);
      })
      .on("error", (err) => {
        console.error(`[HLS] Error in rendition ${name}:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Creates the master.m3u8 playlist file referencing the 3 renditions
 */
function createMasterPlaylist(outputDir) {
  const masterContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=464000,RESOLUTION=426x240,NAME="240p"
240p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1096000,RESOLUTION=854x480,NAME="480p"
480p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2628000,RESOLUTION=1280x720,NAME="720p"
720p.m3u8
`;
  const masterPath = path.join(outputDir, "master.m3u8");
  fs.writeFileSync(masterPath, masterContent, "utf8");
  return masterPath;
}

export const hlsService = {
  getHlsBaseDir: () => hlsBaseDir,

  /**
   * Transcodes an MP4 video into 3-tier HLS (240p, 480p, 720p) + master.m3u8
   * and updates the CourseLesson record with hls_path and hls_url
   */
  processLessonVideo: async (lessonId, inputFilePath) => {
    try {
      if (!fs.existsSync(inputFilePath)) {
        throw new Error(`Source video file not found at: ${inputFilePath}`);
      }

      const lessonHlsDir = path.join(hlsBaseDir, lessonId);
      if (!fs.existsSync(lessonHlsDir)) {
        fs.mkdirSync(lessonHlsDir, { recursive: true });
      }

      const renditions = [
        { name: "240p", resolution: { w: 426, h: 240 }, videoBitrate: "400k", audioBitrate: "64k" },
        { name: "480p", resolution: { w: 854, h: 480 }, videoBitrate: "1000k", audioBitrate: "96k" },
        { name: "720p", resolution: { w: 1280, h: 720 }, videoBitrate: "2500k", audioBitrate: "128k" },
      ];

      console.log(`[HLS] Processing lesson ${lessonId} into HLS renditions...`);

      for (const rendition of renditions) {
        await transcodeRendition(inputFilePath, lessonHlsDir, rendition);
      }

      createMasterPlaylist(lessonHlsDir);

      const relativeHlsPath = `/uploads/hls/${lessonId}/master.m3u8`;
      const streamHlsUrl = `/api/v1/media/hls/${lessonId}/master.m3u8`;

      // Update database record
      await prisma.courseLesson.update({
        where: { id: lessonId },
        data: {
          hls_path: relativeHlsPath,
          hls_url: streamHlsUrl,
        },
      });

      console.log(`[HLS] Successfully converted lesson ${lessonId} to HLS: ${streamHlsUrl}`);
      return { success: true, hlsPath: relativeHlsPath, hlsUrl: streamHlsUrl };
    } catch (err) {
      console.error(`[HLS] Failed to process lesson ${lessonId}:`, err);
      throw err;
    }
  },

  /**
   * Checks if an HLS master playlist exists for a given lesson
   */
  hasHls: (lessonId) => {
    const masterPath = path.join(hlsBaseDir, lessonId, "master.m3u8");
    return fs.existsSync(masterPath);
  },

  /**
   * Gets absolute file path for an HLS asset (.m3u8 or .ts)
   */
  getHlsFilePath: (lessonId, fileName) => {
    const cleanFileName = path.basename(fileName);
    return path.join(hlsBaseDir, lessonId, cleanFileName);
  },
};
