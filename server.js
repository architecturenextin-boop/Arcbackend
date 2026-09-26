import app from "./src/app.js";
import { config } from "./src/config/env.js";
import { prisma } from "./src/config/db.js";

const PORT = config.port;

let activeServer = null;

async function cleanExpiredTokens() {
  try {
    const deleted = await prisma.tokenBlacklist.deleteMany({
      where: {
        expires_at: { lt: new Date() },
      },
    });
    if (deleted.count > 0) {
      console.log(`[Blacklist Cleanup] Purged ${deleted.count} expired blacklisted tokens.`);
    }
  } catch (err) {
    console.error("[Blacklist Cleanup Error]:", err.message);
  }
}

async function ensureSchemaMigration() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "course_lessons" ADD COLUMN IF NOT EXISTS "hls_url" TEXT;
      ALTER TABLE "course_lessons" ADD COLUMN IF NOT EXISTS "hls_path" TEXT;
    `);
    console.log(" [DB Migration] Verified course_lessons schema columns (hls_url, hls_path).");
  } catch (err) {
    console.warn(" [DB Migration Warning]:", err.message);
  }
}

function listenWithRetry(port, maxRetries = 5) {
  let attempts = 0;

  function attemptListen() {
    attempts++;
    const server = app.listen(port, () => {
      console.log(` SkillSpring Backend REST API running on http://localhost:${port}`);
      console.log(` Health check: http://localhost:${port}/api/v1/health`);
    });

    activeServer = server;

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && attempts <= maxRetries) {
        console.warn(`[Port ${port} Busy] Port in use, retrying in 1.5s... (Attempt ${attempts}/${maxRetries})`);
        setTimeout(attemptListen, 1500);
      } else {
        console.error(" Server startup error:", err.message);
      }
    });
  }

  attemptListen();
}

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log(" Connected to PostgreSQL Database successfully via Prisma ORM.");

    // Auto-migrate newly added columns safely
    await ensureSchemaMigration();

    // Run cleanup on startup
    await cleanExpiredTokens();

    // Schedule cleanup to run every 24 hours
    setInterval(cleanExpiredTokens, 24 * 60 * 60 * 1000);

    listenWithRetry(PORT);
  } catch (err) {
    console.error(" Failed to connect to PostgreSQL database:", err.message);
    console.log(" Starting server in fallback mode (ensure PostgreSQL is running and DATABASE_URL is configured in backend/.env)");
    listenWithRetry(PORT);
  }
}

const gracefulShutdown = async () => {
  if (activeServer) {
    activeServer.close();
  }
  try {
    await prisma.$disconnect();
  } catch (_) {}
  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

startServer();
