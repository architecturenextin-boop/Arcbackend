import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();

const backupDir = path.resolve(__dirname, "../backups");
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

function escapeSqlValue(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return val;
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Array.isArray(val)) {
    if (val.length === 0) return "ARRAY[]::TEXT[]";
    const arrayElements = val.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",");
    return `'{${arrayElements}}'`;
  }
  if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function generateTableSql(tableName, rows) {
  if (!rows || rows.length === 0) return `-- No data for table ${tableName}\n\n`;
  const columns = Object.keys(rows[0]);
  const sqlLines = [];
  sqlLines.push(`-- Data for table: ${tableName} (${rows.length} rows)`);

  for (const row of rows) {
    const values = columns.map((col) => escapeSqlValue(row[col])).join(", ");
    sqlLines.push(`INSERT INTO "${tableName}" ("${columns.join('", "')}") VALUES (${values}) ON CONFLICT DO NOTHING;`);
  }
  sqlLines.push("\n");
  return sqlLines.join("\n");
}

async function exportAll() {
  console.log("🚀 Starting complete database export...");

  try {
    const [
      users,
      courses,
      courseModules,
      courseLessons,
      payments,
      enrollments,
      lessonProgress,
      otps,
      passwordResetTokens,
      tokenBlacklist,
    ] = await Promise.all([
      prisma.user.findMany({ orderBy: { created_at: "asc" } }),
      prisma.course.findMany({ orderBy: { created_at: "asc" } }),
      prisma.courseModule.findMany({ orderBy: { sort_order: "asc" } }),
      prisma.courseLesson.findMany({ orderBy: { sort_order: "asc" } }),
      prisma.payment.findMany({ orderBy: { created_at: "asc" } }),
      prisma.enrollment.findMany({ orderBy: { created_at: "asc" } }),
      prisma.lessonProgress.findMany({ orderBy: { created_at: "asc" } }),
      prisma.otp.findMany({ orderBy: { created_at: "asc" } }),
      prisma.passwordResetToken.findMany({ orderBy: { created_at: "asc" } }),
      prisma.tokenBlacklist.findMany({ orderBy: { created_at: "asc" } }),
    ]);

    const dumpData = {
      metadata: {
        exported_at: new Date().toISOString(),
        total_tables: 10,
        counts: {
          users: users.length,
          courses: courses.length,
          course_modules: courseModules.length,
          course_lessons: courseLessons.length,
          payments: payments.length,
          enrollments: enrollments.length,
          lesson_progress: lessonProgress.length,
          otps: otps.length,
          password_reset_tokens: passwordResetTokens.length,
          token_blacklist: tokenBlacklist.length,
        },
      },
      data: {
        users,
        courses,
        course_modules: courseModules,
        course_lessons: courseLessons,
        payments,
        enrollments,
        lesson_progress: lessonProgress,
        otps,
        password_reset_tokens: passwordResetTokens,
        token_blacklist: tokenBlacklist,
      },
    };

    // 1. Save JSON dump
    const jsonPath = path.join(backupDir, "export-data.json");
    fs.writeFileSync(jsonPath, JSON.stringify(dumpData, null, 2), "utf8");
    console.log(`✅ JSON export saved to: ${jsonPath}`);

    // 2. Data-only SQL inserts
    let dataSql = `-- ========================================================\n`;
    dataSql += `-- ArchitectureNext Database Data-Only Export\n`;
    dataSql += `-- Generated: ${dumpData.metadata.exported_at}\n`;
    dataSql += `-- ========================================================\n\n`;
    dataSql += `BEGIN;\n\n`;
    dataSql += generateTableSql("users", users);
    dataSql += generateTableSql("courses", courses);
    dataSql += generateTableSql("course_modules", courseModules);
    dataSql += generateTableSql("course_lessons", courseLessons);
    dataSql += generateTableSql("payments", payments);
    dataSql += generateTableSql("enrollments", enrollments);
    dataSql += generateTableSql("lesson_progress", lessonProgress);
    dataSql += generateTableSql("otps", otps);
    dataSql += generateTableSql("password_reset_tokens", passwordResetTokens);
    dataSql += generateTableSql("token_blacklist", tokenBlacklist);
    dataSql += `COMMIT;\n`;

    const dataSqlPath = path.join(backupDir, "export-data.sql");
    fs.writeFileSync(dataSqlPath, dataSql, "utf8");
    console.log(`✅ Data SQL export saved to: ${dataSqlPath}`);

    // 3. Generate Complete All-in-One SQL for empty pgAdmin databases
    let ddlSchema = "";
    try {
      ddlSchema = execSync("npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script", {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8",
      });
    } catch (e) {
      console.warn("Could not generate DDL dynamically:", e.message);
    }

    let fullSql = `-- ========================================================\n`;
    fullSql += `-- ArchitectureNext Complete Database Script (DDL + Data)\n`;
    fullSql += `-- Generated: ${dumpData.metadata.exported_at}\n`;
    fullSql += `-- Paste directly into pgAdmin on an EMPTY database & execute\n`;
    fullSql += `-- ========================================================\n\n`;
    fullSql += `BEGIN;\n\n`;
    fullSql += `-- STEP 1: CREATE SCHEMA, TYPES & TABLES\n`;
    fullSql += ddlSchema + `\n\n`;
    fullSql += `-- STEP 2: INSERT ALL DATA\n\n`;
    fullSql += generateTableSql("users", users);
    fullSql += generateTableSql("courses", courses);
    fullSql += generateTableSql("course_modules", courseModules);
    fullSql += generateTableSql("course_lessons", courseLessons);
    fullSql += generateTableSql("payments", payments);
    fullSql += generateTableSql("enrollments", enrollments);
    fullSql += generateTableSql("lesson_progress", lessonProgress);
    fullSql += generateTableSql("otps", otps);
    fullSql += generateTableSql("password_reset_tokens", passwordResetTokens);
    fullSql += generateTableSql("token_blacklist", tokenBlacklist);
    fullSql += `COMMIT;\n`;

    const fullSqlPath = path.join(backupDir, "full-database-pgadmin.sql");
    fs.writeFileSync(fullSqlPath, fullSql, "utf8");
    console.log(`✅ All-in-one DDL + Data SQL for pgAdmin saved to: ${fullSqlPath}`);

    console.log("\n📊 Export Summary:");
    console.table(dumpData.metadata.counts);
  } catch (err) {
    console.error("❌ Export failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

exportAll();
