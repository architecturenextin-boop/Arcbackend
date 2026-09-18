-- ========================================================
-- ArchitectureNext Complete Database Script (DDL + Data)
-- Generated: 2026-09-17T12:46:53.314Z
-- Paste directly into pgAdmin on an EMPTY database & execute
-- ========================================================

BEGIN;

-- STEP 1: CREATE SCHEMA, TYPES & TABLES
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP_VERIFY', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "full_name" TEXT,
    "username" TEXT,
    "phone" TEXT,
    "goal" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "avatar_url" TEXT,
    "reset_password_token" TEXT,
    "reset_password_expires" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "cover_url" TEXT,
    "thumbnail_url" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "original_price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT '₹',
    "total_duration" TEXT,
    "total_lessons" INTEGER NOT NULL DEFAULT 0,
    "level" TEXT DEFAULT 'Beginner',
    "language" TEXT DEFAULT 'Malayalam',
    "rating" DOUBLE PRECISION DEFAULT 4.9,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "preview_video_url" TEXT,
    "what_you_will_learn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tools_covered" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_audience" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published" BOOLEAN NOT NULL DEFAULT false,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_modules" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_lessons" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration" TEXT DEFAULT '15:00',
    "video_url" TEXT,
    "video_path" TEXT,
    "pdf_url" TEXT,
    "pdf_path" TEXT,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gateway" TEXT DEFAULT 'razorpay',
    "gateway_order_id" TEXT,
    "gateway_payment_id" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "payment_id" UUID,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "progress_seconds" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "last_watched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otps" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_blacklist" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_slug_idx" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- CreateIndex
CREATE INDEX "courses_published_idx" ON "courses"("published");

-- CreateIndex
CREATE INDEX "course_modules_course_id_idx" ON "course_modules"("course_id");

-- CreateIndex
CREATE INDEX "course_modules_sort_order_idx" ON "course_modules"("sort_order");

-- CreateIndex
CREATE INDEX "course_lessons_module_id_idx" ON "course_lessons"("module_id");

-- CreateIndex
CREATE INDEX "course_lessons_sort_order_idx" ON "course_lessons"("sort_order");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_course_id_idx" ON "payments"("course_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_gateway_order_id_idx" ON "payments"("gateway_order_id");

-- CreateIndex
CREATE INDEX "enrollments_user_id_idx" ON "enrollments"("user_id");

-- CreateIndex
CREATE INDEX "enrollments_course_id_idx" ON "enrollments"("course_id");

-- CreateIndex
CREATE INDEX "enrollments_status_idx" ON "enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_user_id_course_id_key" ON "enrollments"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "lesson_progress_user_id_idx" ON "lesson_progress"("user_id");

-- CreateIndex
CREATE INDEX "lesson_progress_course_id_idx" ON "lesson_progress"("course_id");

-- CreateIndex
CREATE INDEX "lesson_progress_lesson_id_idx" ON "lesson_progress"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_user_id_lesson_id_key" ON "lesson_progress"("user_id", "lesson_id");

-- CreateIndex
CREATE INDEX "otps_user_id_purpose_idx" ON "otps"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "otps_expires_at_idx" ON "otps"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "token_blacklist_token_hash_key" ON "token_blacklist"("token_hash");

-- CreateIndex
CREATE INDEX "token_blacklist_expires_at_idx" ON "token_blacklist"("expires_at");

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otps" ADD CONSTRAINT "otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- STEP 2: INSERT ALL DATA

-- Data for table: users (9 rows)
INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "full_name", "username", "phone", "goal", "role", "is_verified", "onboarded", "avatar_url", "reset_password_token", "reset_password_expires", "created_at", "updated_at") VALUES ('235c749c-dcba-48f9-adec-f6f8d06b23f6', 'admin@architecturenext.in', '$2b$10$CUjplxFZ2kVyiceG.sVmt.PCWntgh4A7dvWUTFg6Q0AZAPukJfPkG', 'admin', 'master', 'admin master', 'admin', '9895854244', NULL, 'ADMIN', TRUE, TRUE, NULL, NULL, NULL, '2026-08-17T06:26:27.408Z', '2026-09-17T06:30:53.518Z') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "full_name", "username", "phone", "goal", "role", "is_verified", "onboarded", "avatar_url", "reset_password_token", "reset_password_expires", "created_at", "updated_at") VALUES ('e9ac8a95-867f-457a-89c3-92b8ddf0af7e', 'jasiljazz679@gmail.com', '$2b$10$ZHQ0q772Y.Ir.nfFw/rIe.S3lLeBIH7lvmkmTJ/ICz86DYxOPrCDu', 'jasil', 'verify', 'jasil verify', 'jsss', '9895854244', 'Switch careers', 'STUDENT', TRUE, TRUE, NULL, NULL, NULL, '2026-08-17T06:28:56.323Z', '2026-08-18T05:56:33.759Z') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "full_name", "username", "phone", "goal", "role", "is_verified", "onboarded", "avatar_url", "reset_password_token", "reset_password_expires", "created_at", "updated_at") VALUES ('7b1af759-2a22-4c1e-90d1-b39feca799f5', 'ppjasil2@gmail.com', '$2b$10$RcSXsGX5mkK/UkEl0IBkXOO5wsiTM4ltMkZQarJOPEdw738bsYjtC', 'user', 'qaskmc', 'jassilll', 'namw', '8954554545', 'Switch careers', 'STUDENT', TRUE, TRUE, NULL, NULL, NULL, '2026-08-18T05:05:07.486Z', '2026-08-18T05:05:59.539Z') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "full_name", "username", "phone", "goal", "role", "is_verified", "onboarded", "avatar_url", "reset_password_token", "reset_password_expires", "created_at", "updated_at") VALUES ('50e84c02-5aa1-4999-85fd-7bc556acaee5', 'learner@architecturenext.in', '$2b$10$CUjplxFZ2kVyiceG.sVmt..VsjUtN6yvyxcWu7pex.GQBm/2lTSdG', 'Rahul', 'Verma', 'Rahul Verma', 'rahul_bim', '+919812345678', 'Switch careers', 'STUDENT', TRUE, TRUE, '/hero-learner.jpeg', NULL, NULL, '2026-08-18T05:41:42.543Z', '2026-09-17T06:30:53.877Z') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "full_name", "username", "phone", "goal", "role", "is_verified", "onboarded", "avatar_url", "reset_password_token", "reset_password_expires", "created_at", "updated_at") VALUES ('6311e1aa-834d-464c-9250-80047a6b8ec9', 'm.jasilof@gmail.com', '$2b$10$xY6AjWFJIFCK5IMj471h4.WTigj3kRfSwqTY6U7EdUW2GHRkBHE/W', 'MOHAMED', 'jasi', 'jaisl', 'jassi', '9895854244', 'Switch careers', 'STUDENT', TRUE, TRUE, NULL, NULL, NULL, '2026-09-14T08:27:57.767Z', '2026-09-14T08:28:33.935Z') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "full_name", "username", "phone", "goal", "role", "is_verified", "onboarded", "avatar_url", "reset_password_token", "reset_password_expires", "created_at", "updated_at") VALUES ('8b63c9f3-480d-442d-bd39-9fa11beff17d', 'e2estudent@architecturenext.in', '$2b$10$Ydt8LawuvLrQvGDXm4NS5.Jc4yLP8y4pZ2uMeSUafd7qQnlAylL92', 'E2E', 'Student', 'E2E Student', 'e2estudent', '9876543219', 'Switch careers', 'STUDENT', TRUE, TRUE, NULL, NULL, NULL, '2026-09-17T08:54:45.147Z', '2026-09-17T08:58:37.887Z') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "full_name", "username", "phone", "goal", "role", "is_verified", "onboarded", "avatar_url", "reset_password_token", "reset_password_expires", "created_at", "updated_at") VALUES ('275e24fd-5e2b-4d09-a5d2-a25a9fee03b4', 'audit_student_a_1789637174237@architecturenext.in', '$2b$10$wa7RqVWmMiaiRTr5BpaNDe1luJFoukY1cvXYfP6Xg/bgRxDCgoBka', 'Audit', 'StudentA', 'Audit Student A', 'studenta_1789637174237', '+919876543210', NULL, 'STUDENT', TRUE, FALSE, NULL, NULL, NULL, '2026-09-17T09:26:14.711Z', '2026-09-17T09:26:17.147Z') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "full_name", "username", "phone", "goal", "role", "is_verified", "onboarded", "avatar_url", "reset_password_token", "reset_password_expires", "created_at", "updated_at") VALUES ('ecf2e2f6-40df-4397-82cf-23a0e1fa63c2', 'audit_student_b_1789637174237@architecturenext.in', '$2b$10$locYfyD/kNBf3eRBc/XWXu78KMVvsCDsstpNq/au6HbJrkxDaesH.', 'Audit', 'StudentB', 'Audit Student B', 'studentb_1789637174237', NULL, NULL, 'STUDENT', TRUE, FALSE, NULL, NULL, NULL, '2026-09-17T09:26:17.537Z', '2026-09-17T09:26:18.965Z') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "full_name", "username", "phone", "goal", "role", "is_verified", "onboarded", "avatar_url", "reset_password_token", "reset_password_expires", "created_at", "updated_at") VALUES ('5463cf40-d82e-4b74-ae2a-faed868f1999', 'jasiljazz79@gmail.com', '$2b$10$1J5XjQr3H4Nwy8kyqEwomeZWl2nDMl5zoOcUnRRDGH8FgT2wKSWKy', 'jasil', 'mohamed', 'jasil mohamed', 'jassssssssilll', '9895854244', NULL, 'STUDENT', FALSE, FALSE, NULL, NULL, NULL, '2026-09-17T09:38:46.749Z', '2026-09-17T09:38:46.749Z') ON CONFLICT DO NOTHING;

-- Data for table: courses (1 rows)
INSERT INTO "courses" ("id", "slug", "title", "tagline", "description", "cover_url", "thumbnail_url", "price", "original_price", "currency", "total_duration", "total_lessons", "level", "language", "rating", "review_count", "preview_video_url", "what_you_will_learn", "tools_covered", "highlights", "requirements", "target_audience", "published", "status", "created_at", "updated_at") VALUES ('059ac58b-4736-4ecc-8713-421f7112c5b0', 'architecture-plan-presentation-animation', 'Architecture Plan Presentation & Animation', 'Create Professional Architectural Presentations from CAD Drawings to Animated Visuals', 'Learn how to transform ordinary AutoCAD drawings into stunning architectural presentation sheets and professional animation presentations using industry-standard techniques. This course is designed for architecture students, civil engineering students, interior designers, and professionals who want to improve the quality of their project presentations. The programme is designed for beginners and aspiring professionals, with a clear focus on practical execution, production standards and portfolio-ready outcomes.', '/uploads/images/img-1786958890218-a32f5f983d2f.jpeg', '/uploads/images/img-1786958890218-a32f5f983d2f.jpeg', 999, 2499, '₹', '2h 30m', 25, 'Beginner', 'Malayalam', 4.9, 0, 'https://www.youtube.com/watch?v=PXXF3CJU2c4&t=3s', '{"Install and configure Adobe Photoshop for architectural presentation.","Understand the fundamentals of architectural plan presentation.","Set up AutoCAD drawings for Photoshop workflow.","Export high-quality CAD drawings for presentation.","Create professional floor plan presentations.","Apply colors, textures, shadows, and presentation effects.","Add furniture, landscape, people, vehicles, and presentation elements.","Create presentation boards suitable for client meetings and portfolios.","Produce animated architectural presentations from presentation boards.","Export presentation images and animation in high quality.","Download and use all course practice files and resources..","Build presentation skills used by architecture firms and design studios."}', '{"Architecture & Interior Design"}', '{"HD Video Lessons","Downloadable Project Files","AutoCAD Sample Drawings","Photoshop Resource Files","Working Materials & Assets","Practice Exercises Animation Project Files","Lifetime Access Mobile & Desktop Access Course Completion Certificate"}', '{"Basic knowledge of AutoCAD is recommended.","A Windows PC or Mac with Adobe Photoshop installed.","AutoCAD software for preparing architectural drawings.","No prior Photoshop experience is required.","Internet connection for downloading course materials.","Passion for creating professional architectural presentations.","Willingness to practice using the provided project files."}', '{"Architecture Students","Civil Engineering Students","Interior Design Students","Architects,","Interior Designers,","Draftsmen,","Freelance Designers,","Architecture Visualization Beginners,","Anyone interested in professional architectural presentation and animation."}', TRUE, 'PUBLISHED', '2026-08-17T09:27:54.881Z', '2026-08-18T05:47:11.743Z') ON CONFLICT DO NOTHING;

-- Data for table: course_modules (8 rows)
INSERT INTO "course_modules" ("id", "course_id", "title", "description", "sort_order", "created_at", "updated_at") VALUES ('67ebe750-ff1b-4fe8-b7d5-1c9768371c6f', '059ac58b-4736-4ecc-8713-421f7112c5b0', 'Module 1 – COURSE OVERVIEW', '', 0, '2026-08-17T09:27:55.017Z', '2026-08-17T13:00:35.212Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_modules" ("id", "course_id", "title", "description", "sort_order", "created_at", "updated_at") VALUES ('408afc3e-6a5d-448f-a91f-df4a5286a4c2', '059ac58b-4736-4ecc-8713-421f7112c5b0', 'INSTALLING PHOTOSHOP', '', 1, '2026-08-17T11:20:11.564Z', '2026-08-17T13:00:35.226Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_modules" ("id", "course_id", "title", "description", "sort_order", "created_at", "updated_at") VALUES ('936d6832-f221-4b69-97d5-5e2f7d9e36f1', '059ac58b-4736-4ecc-8713-421f7112c5b0', 'INTRODUCTION TO PHOTOSHOP', '', 2, '2026-08-17T11:20:11.630Z', '2026-08-17T13:00:35.234Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_modules" ("id", "course_id", "title", "description", "sort_order", "created_at", "updated_at") VALUES ('fd6a1d07-c156-4e93-bfad-c97fa9292489', '059ac58b-4736-4ecc-8713-421f7112c5b0', 'AUTOCAD DRAWINGS SETTINGS', '', 3, '2026-08-17T11:20:11.638Z', '2026-08-17T13:00:35.242Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_modules" ("id", "course_id", "title", "description", "sort_order", "created_at", "updated_at") VALUES ('5aad777d-0a82-4105-a756-bdb8bdf87216', '059ac58b-4736-4ecc-8713-421f7112c5b0', 'ARCHITECTURE PRESENTATION', '', 4, '2026-08-17T11:57:01.839Z', '2026-08-17T13:00:35.252Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_modules" ("id", "course_id", "title", "description", "sort_order", "created_at", "updated_at") VALUES ('f3befef0-13b9-4233-96f3-34b38d764814', '059ac58b-4736-4ecc-8713-421f7112c5b0', 'ARCHITECTURE PRESENTATION ANIMATION', '', 5, '2026-08-17T12:16:10.360Z', '2026-08-17T13:00:35.267Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_modules" ("id", "course_id", "title", "description", "sort_order", "created_at", "updated_at") VALUES ('2ebd77bc-3482-46ba-9b92-0989e07199f4', '059ac58b-4736-4ecc-8713-421f7112c5b0', 'MATERIALS', '', 6, '2026-08-17T12:20:59.143Z', '2026-08-17T13:00:35.286Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_modules" ("id", "course_id", "title", "description", "sort_order", "created_at", "updated_at") VALUES ('19e67a84-303c-48c1-b4e6-acc5325a97d8', '059ac58b-4736-4ecc-8713-421f7112c5b0', 'DOUBT CLEARING CLASS', '', 7, '2026-08-17T13:00:35.305Z', '2026-08-17T13:00:35.305Z') ON CONFLICT DO NOTHING;

-- Data for table: course_lessons (25 rows)
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('ddc50f44-0e15-4a48-a44c-89fa1d4bdff0', '2ebd77bc-3482-46ba-9b92-0989e07199f4', 'ARCHITECTURE NEXT-Model', '', 'PDF Document', NULL, NULL, '/uploads/documents/doc-1786969137576-e007a381d53d.pdf', '/uploads/documents/doc-1786969137576-e007a381d53d.pdf', FALSE, 0, '2026-08-17T12:20:59.151Z', '2026-08-17T13:00:35.288Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('2424102e-0911-455b-b50b-a14f59fa3057', 'f3befef0-13b9-4233-96f3-34b38d764814', 'Animation Class 1_Layer settings_Timeline settings', '', '09:09', '/uploads/videos/lesson-video-1786968814057-ad063017a62b.mp4', '/uploads/videos/lesson-video-1786968814057-ad063017a62b.mp4', NULL, NULL, FALSE, 0, '2026-08-17T12:16:10.408Z', '2026-08-17T13:00:35.269Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('638f8537-9069-485e-ae5b-6b5b443075b2', '19e67a84-303c-48c1-b4e6-acc5325a97d8', 'ARCHITECTURE PLAN PRESENTAION ANIMATION FIRST CUT', '', '06:42', '/uploads/videos/lesson-video-1786971577070-b2fe3a487d72.mp4', '/uploads/videos/lesson-video-1786971577070-b2fe3a487d72.mp4', NULL, NULL, FALSE, 0, '2026-08-17T13:00:35.310Z', '2026-08-17T13:00:35.310Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('64226b34-ab1c-4878-b754-4a0726d48cb0', '408afc3e-6a5d-448f-a91f-df4a5286a4c2', 'installing photoshop ', '', '02:40', '/uploads/videos/lesson-video-1786965150498-bd6e7ece6ac8.mp4', '/uploads/videos/lesson-video-1786965150498-bd6e7ece6ac8.mp4', NULL, NULL, FALSE, 0, '2026-08-17T11:20:11.578Z', '2026-08-17T13:00:35.229Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('566de8c2-1d27-4371-971b-e4111d915371', '936d6832-f221-4b69-97d5-5e2f7d9e36f1', 'Introduction to Architecture Plan Presentation Animation', '', '06:34', '/uploads/videos/lesson-video-1786965363167-39c0674d69bf.mp4', '/uploads/videos/lesson-video-1786965363167-39c0674d69bf.mp4', NULL, NULL, FALSE, 0, '2026-08-17T11:20:11.632Z', '2026-08-17T13:00:35.237Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('b598b7f2-12a6-472c-867b-dcc6e4d2de91', 'fd6a1d07-c156-4e93-bfad-c97fa9292489', 'Autocad Drawing to pdf layout settings', '', '15:39', '/uploads/videos/lesson-video-1786965429525-26a0e6a3e5e4.mp4', '/uploads/videos/lesson-video-1786965429525-26a0e6a3e5e4.mp4', NULL, NULL, FALSE, 0, '2026-08-17T11:20:11.640Z', '2026-08-17T13:00:35.246Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('58f51589-5ca8-43a3-a130-3b1d120c30d9', '5aad777d-0a82-4105-a756-bdb8bdf87216', 'Presentation Class 1_Interface_Tools_Page setting_Importing Images', '', '12:12', '/uploads/videos/lesson-video-1786967705676-76b3116ce0a5.mp4', '/uploads/videos/lesson-video-1786967705676-76b3116ce0a5.mp4', NULL, NULL, FALSE, 0, '2026-08-17T11:57:01.841Z', '2026-08-17T13:00:35.255Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('17d26431-a9b2-4481-a96b-67a800638273', '67ebe750-ff1b-4fe8-b7d5-1c9768371c6f', 'Course Overview', '', '06:42', '/api/v1/media/video/lesson-video-1786952486816-9e3a46b3286a.mp4', '/api/v1/media/video/lesson-video-1786952486816-9e3a46b3286a.mp4', NULL, NULL, FALSE, 0, '2026-08-17T10:40:55.599Z', '2026-09-17T09:19:22.711Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('61ba72d5-5bbb-4d12-9fb3-615b8179920c', 'f3befef0-13b9-4233-96f3-34b38d764814', 'Animation Class 2_Layer settings_Timeline settings', '', '14:25', '/uploads/videos/lesson-video-1786968844894-a0ccb9c035e8.mp4', '/uploads/videos/lesson-video-1786968844894-a0ccb9c035e8.mp4', NULL, NULL, FALSE, 1, '2026-08-17T12:16:10.412Z', '2026-08-17T13:00:35.272Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('dc1cce3d-9d3e-480d-aefa-c840a5e3940f', '5aad777d-0a82-4105-a756-bdb8bdf87216', 'Presentation Class 2_Layer_Colouring_Cutting', '', '11:05', '/uploads/videos/lesson-video-1786967734420-d43976d404a0.mp4', '/uploads/videos/lesson-video-1786967734420-d43976d404a0.mp4', NULL, NULL, FALSE, 1, '2026-08-17T11:57:02.055Z', '2026-08-17T13:00:35.257Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('5db6a686-b6c0-45cb-a17a-99f0602d0739', '67ebe750-ff1b-4fe8-b7d5-1c9768371c6f', 'Course Workflow', '', '02:24', '/uploads/videos/lesson-video-1786963129632-c11226502572.mp4', '/uploads/videos/lesson-video-1786963129632-c11226502572.mp4', NULL, NULL, FALSE, 1, '2026-08-17T10:40:55.673Z', '2026-08-17T13:00:35.218Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('fe7eb16a-81a2-4796-91c5-e7e1e5cf6f21', '2ebd77bc-3482-46ba-9b92-0989e07199f4', 'bird white', '', '15:00', '/uploads/videos/lesson-video-1786969179533-2e6435a7436f.mp4', '/uploads/videos/lesson-video-1786969179533-2e6435a7436f.mp4', NULL, NULL, FALSE, 1, '2026-08-17T12:20:59.159Z', '2026-08-17T13:00:35.290Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('e70419a5-5512-4e9e-a04f-75c7e79cdb8c', '5aad777d-0a82-4105-a756-bdb8bdf87216', 'Presentation Class 3_Layer_Tools_Cutting_Colouring', '', '11:19', '/uploads/videos/lesson-video-1786968680219-b0febd69c86d.mp4', '/uploads/videos/lesson-video-1786968680219-b0febd69c86d.mp4', NULL, NULL, FALSE, 2, '2026-08-17T11:57:02.056Z', '2026-08-17T13:00:35.258Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('02d88683-26b1-46ee-9517-7dd75ab4c526', '67ebe750-ff1b-4fe8-b7d5-1c9768371c6f', 'Workflow Presentation Pdf', '', 'PDF Document', NULL, NULL, '/uploads/documents/doc-1786964976104-a2c31d336252.pdf', '/uploads/documents/doc-1786964976104-a2c31d336252.pdf', FALSE, 2, '2026-08-17T11:20:11.504Z', '2026-08-17T13:00:35.221Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('2c616fed-2f34-437d-b6cb-0d69fadd756f', 'f3befef0-13b9-4233-96f3-34b38d764814', 'Animation Class 3_Layer settings_Timeline settings_basic animation', '', '17:53', '/uploads/videos/lesson-video-1786968873050-21ae9c02b75e.mp4', '/uploads/videos/lesson-video-1786968873050-21ae9c02b75e.mp4', NULL, NULL, FALSE, 2, '2026-08-17T12:16:10.415Z', '2026-08-17T13:00:35.274Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('627975b0-7f40-4261-837d-a0b20d14acd4', '2ebd77bc-3482-46ba-9b92-0989e07199f4', 'PLAN PRESENTATION ', '', 'PDF Document', NULL, NULL, '/uploads/documents/doc-1786969216272-8c718d80b414.pdf', '/uploads/documents/doc-1786969216272-8c718d80b414.pdf', FALSE, 2, '2026-08-17T12:20:59.195Z', '2026-08-17T13:00:35.291Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('ca2300e4-b613-4a4c-8032-69921b89c4d5', '5aad777d-0a82-4105-a756-bdb8bdf87216', 'Presentation Class 3_Layer_Tools_Cutting_Colouring.mp4', '', '10:16', '/uploads/videos/lesson-video-1786968727756-7c6cfec12944.mp4', '/uploads/videos/lesson-video-1786968727756-7c6cfec12944.mp4', NULL, NULL, FALSE, 3, '2026-08-17T12:16:10.302Z', '2026-08-17T13:00:35.260Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('633c11cf-d16e-46fe-bfa6-73f9b41072df', 'f3befef0-13b9-4233-96f3-34b38d764814', 'Animation Class 4_Layer settings_Timeline settings_basic animation ', '', '20:30', '/uploads/videos/lesson-video-1786968915188-c1f19ff67a88.mp4', '/uploads/videos/lesson-video-1786968915188-c1f19ff67a88.mp4', NULL, NULL, FALSE, 3, '2026-08-17T12:16:10.418Z', '2026-08-17T13:00:35.277Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('216d86ea-a0fb-4cc3-ab2e-d08d4156aace', '2ebd77bc-3482-46ba-9b92-0989e07199f4', 'PLAN PRESENTATION ', '', 'PDF Document', NULL, NULL, '/uploads/documents/doc-1786970990857-55f1f3c31c7d.psd', '/uploads/documents/doc-1786970990857-55f1f3c31c7d.psd', FALSE, 3, '2026-08-17T12:52:29.801Z', '2026-08-17T13:00:35.292Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('6830e47b-9945-4d03-aeab-b612850e3e17', '2ebd77bc-3482-46ba-9b92-0989e07199f4', 'PRESENTATION-Models', '', 'PDF Document', NULL, NULL, '/uploads/documents/doc-1786971035381-9fb984472d41.pdf', '/uploads/documents/doc-1786971035381-9fb984472d41.pdf', FALSE, 4, '2026-08-17T12:52:29.933Z', '2026-08-17T13:00:35.293Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('6c7a54bc-555a-473f-a3d2-26ab4d1ad643', '5aad777d-0a82-4105-a756-bdb8bdf87216', 'Presentation Class 5_Text_Layer setting_Exporting', '', '09:18', '/uploads/videos/lesson-video-1786968759975-a44388ec36b4.mp4', '/uploads/videos/lesson-video-1786968759975-a44388ec36b4.mp4', NULL, NULL, FALSE, 4, '2026-08-17T12:16:10.355Z', '2026-08-17T13:00:35.262Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('4b54adeb-a341-4e20-b7be-6be7e2d2321f', 'f3befef0-13b9-4233-96f3-34b38d764814', 'Animation Class 5_Layer settings_Timeline settings_Rendering Animation ', '', '11:53', '/uploads/videos/lesson-video-1786968953554-d1bf9693fad8.mp4', '/uploads/videos/lesson-video-1786968953554-d1bf9693fad8.mp4', NULL, NULL, FALSE, 4, '2026-08-17T12:16:10.423Z', '2026-08-17T13:00:35.281Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('09d788de-a653-46c7-a7af-59e1d13faaea', '2ebd77bc-3482-46ba-9b92-0989e07199f4', 'PRESENTATION ', '', 'PDF Document', NULL, NULL, '/uploads/documents/doc-1786971085602-88f433d831ca.dwg', '/uploads/documents/doc-1786971085602-88f433d831ca.dwg', FALSE, 5, '2026-08-17T12:52:29.934Z', '2026-08-17T13:00:35.296Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('76ada632-e4d2-4f60-ab53-135f9b1ffbdb', '2ebd77bc-3482-46ba-9b92-0989e07199f4', 'Ref ', '', 'PDF Document', NULL, NULL, '/uploads/documents/doc-1786971116580-11d890b1e155.jpg', '/uploads/documents/doc-1786971116580-11d890b1e155.jpg', FALSE, 6, '2026-08-17T12:52:29.936Z', '2026-08-17T13:00:35.298Z') ON CONFLICT DO NOTHING;
INSERT INTO "course_lessons" ("id", "module_id", "title", "description", "duration", "video_url", "video_path", "pdf_url", "pdf_path", "is_free", "sort_order", "created_at", "updated_at") VALUES ('66d9064b-c698-43c5-97d7-15087e10005b', '2ebd77bc-3482-46ba-9b92-0989e07199f4', 'YUNG DSA - YEDA YUNG  OFFICIAL MUSIC VIDEO  PROD BY YD @yeardown  2024 ', '', 'PDF Document', NULL, NULL, '/uploads/documents/doc-1786971138875-c6fb4fcecbc8.mp3', '/uploads/documents/doc-1786971138875-c6fb4fcecbc8.mp3', FALSE, 7, '2026-08-17T12:52:29.950Z', '2026-08-17T13:00:35.300Z') ON CONFLICT DO NOTHING;

-- Data for table: payments (15 rows)
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('d07b0e00-3ccd-4bef-be83-4d60db366304', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQonllIvFZXgnh', NULL, 'PENDING', NULL, '2026-08-17T11:20:57.974Z', '2026-08-17T11:20:58.824Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('1ad9d186-76b3-4eaa-9ea1-42a09c032698', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQooVbwDWHC8oc', NULL, 'PENDING', NULL, '2026-08-17T11:21:39.461Z', '2026-08-17T11:21:40.849Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('61255b41-2026-44cb-92c5-9bad4522a3f7', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQos7Ui2y6qx2Q', NULL, 'PENDING', NULL, '2026-08-17T11:25:05.638Z', '2026-08-17T11:25:05.932Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('53959e79-f6e8-43ae-9ffa-ba6065c4670d', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQot93DoZoiLwr', NULL, 'PENDING', NULL, '2026-08-17T11:26:03.883Z', '2026-08-17T11:26:04.147Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('a37d8c6d-4a01-490b-bbe5-e2f61d2eb81d', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQoyAvzwHcqJ6g', NULL, 'PENDING', NULL, '2026-08-17T11:30:47.523Z', '2026-08-17T11:30:49.889Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('90e676a8-6ca9-4332-ac24-da2c84ef38d9', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQp2lUr0OCEOUB', NULL, 'PENDING', NULL, '2026-08-17T11:35:10.261Z', '2026-08-17T11:35:10.573Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('a19b3bda-a33f-4d0f-979a-ef8741432076', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQp334TFoin9S8', NULL, 'PENDING', NULL, '2026-08-17T11:35:26.300Z', '2026-08-17T11:35:26.695Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('5e376017-1c36-4d90-a687-a8d4629181d3', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQp3wgYQqWQlDj', NULL, 'PENDING', NULL, '2026-08-17T11:36:17.269Z', '2026-08-17T11:36:17.618Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('e807fddf-9924-461b-8c81-2248cacb67be', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQp4FXLsXeGfVs', NULL, 'PENDING', NULL, '2026-08-17T11:36:34.599Z', '2026-08-17T11:36:34.894Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('ea1f4eba-5730-4390-913f-087076cfae74', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQp5ARsu9yvPVW', NULL, 'PENDING', NULL, '2026-08-17T11:37:26.797Z', '2026-08-17T11:37:27.026Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('b2324bb2-560e-4f4b-bd33-21acd2bb971e', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQp5MNwGAqFuKm', NULL, 'PENDING', NULL, '2026-08-17T11:37:37.695Z', '2026-08-17T11:37:37.961Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('bf805da9-a650-4bb0-9c63-d360eb8703d8', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TQpCAcmGmA8lOL', NULL, 'PENDING', NULL, '2026-08-17T11:44:04.206Z', '2026-08-17T11:44:04.787Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('c9ae4ccc-f5f0-46f3-b438-c5c16b02daee', '7b1af759-2a22-4c1e-90d1-b39feca799f5', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TR6xNsXfLFn5xD', NULL, 'PENDING', NULL, '2026-08-18T05:06:33.544Z', '2026-08-18T05:06:33.881Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('089dc2bb-f3e7-435b-94c7-e76d4241be86', '7b1af759-2a22-4c1e-90d1-b39feca799f5', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TR7m7kkqmvFY0V', NULL, 'PENDING', NULL, '2026-08-18T05:54:33.838Z', '2026-08-18T05:54:35.917Z') ON CONFLICT DO NOTHING;
INSERT INTO "payments" ("id", "user_id", "course_id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status", "paid_at", "created_at", "updated_at") VALUES ('f5bf3e87-8441-4632-b56e-81f8c93d3c95', '6311e1aa-834d-464c-9250-80047a6b8ec9', '059ac58b-4736-4ecc-8713-421f7112c5b0', 999, 'INR', 'razorpay', 'order_TbqpR5865uItA6', NULL, 'PENDING', NULL, '2026-09-14T08:28:57.595Z', '2026-09-14T08:28:58.345Z') ON CONFLICT DO NOTHING;

-- Data for table: enrollments (1 rows)
INSERT INTO "enrollments" ("id", "user_id", "course_id", "payment_id", "status", "enrolled_at", "expires_at", "created_at", "updated_at") VALUES ('d7c72fc8-8a9a-423e-be24-38dedf78a9e3', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', NULL, 'ACTIVE', '2026-08-17T11:47:33.105Z', NULL, '2026-08-17T11:47:33.105Z', '2026-08-17T11:47:33.105Z') ON CONFLICT DO NOTHING;

-- Data for table: lesson_progress (6 rows)
INSERT INTO "lesson_progress" ("id", "user_id", "course_id", "lesson_id", "progress_seconds", "completed", "last_watched_at", "created_at", "updated_at") VALUES ('e66c5d02-3520-4c0f-b208-5e13923d5a7c', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', '17d26431-a9b2-4481-a96b-67a800638273', 370, FALSE, '2026-08-17T12:09:55.316Z', '2026-08-17T11:48:24.006Z', '2026-08-17T12:09:55.317Z') ON CONFLICT DO NOTHING;
INSERT INTO "lesson_progress" ("id", "user_id", "course_id", "lesson_id", "progress_seconds", "completed", "last_watched_at", "created_at", "updated_at") VALUES ('88fbaa06-3e8c-4f65-a1eb-ceeacd2a59d9', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', '5db6a686-b6c0-45cb-a17a-99f0602d0739', 130, FALSE, '2026-08-17T13:01:02.039Z', '2026-08-17T11:48:37.841Z', '2026-08-17T13:01:02.040Z') ON CONFLICT DO NOTHING;
INSERT INTO "lesson_progress" ("id", "user_id", "course_id", "lesson_id", "progress_seconds", "completed", "last_watched_at", "created_at", "updated_at") VALUES ('094b97a6-f68d-4596-b6f2-dd25f6f21ab1', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', '64226b34-ab1c-4878-b754-4a0726d48cb0', 6, FALSE, '2026-08-17T11:49:01.076Z', '2026-08-17T11:48:59.896Z', '2026-08-17T11:49:01.077Z') ON CONFLICT DO NOTHING;
INSERT INTO "lesson_progress" ("id", "user_id", "course_id", "lesson_id", "progress_seconds", "completed", "last_watched_at", "created_at", "updated_at") VALUES ('49ff4364-c971-47b2-9205-6c082cb67fd1', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', '566de8c2-1d27-4371-971b-e4111d915371', 5, FALSE, '2026-08-17T11:49:09.032Z', '2026-08-17T11:49:07.827Z', '2026-08-17T11:49:09.033Z') ON CONFLICT DO NOTHING;
INSERT INTO "lesson_progress" ("id", "user_id", "course_id", "lesson_id", "progress_seconds", "completed", "last_watched_at", "created_at", "updated_at") VALUES ('60b281b9-9cb0-44a8-95b4-0270e61db75b', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 'b598b7f2-12a6-472c-867b-dcc6e4d2de91', 0, FALSE, '2026-08-17T11:50:58.751Z', '2026-08-17T11:49:12.449Z', '2026-08-17T11:50:58.753Z') ON CONFLICT DO NOTHING;
INSERT INTO "lesson_progress" ("id", "user_id", "course_id", "lesson_id", "progress_seconds", "completed", "last_watched_at", "created_at", "updated_at") VALUES ('4a314d0b-a10b-467e-964c-8c04865f0fc2', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '059ac58b-4736-4ecc-8713-421f7112c5b0', 'dc1cce3d-9d3e-480d-aefa-c840a5e3940f', 656, TRUE, '2026-08-17T13:00:57.921Z', '2026-08-17T13:00:49.530Z', '2026-08-17T13:00:57.922Z') ON CONFLICT DO NOTHING;

-- Data for table: otps (1 rows)
INSERT INTO "otps" ("id", "user_id", "otp_hash", "purpose", "attempts", "expires_at", "created_at") VALUES ('93487a26-4750-4f67-8adb-01d83d98096a', '5463cf40-d82e-4b74-ae2a-faed868f1999', '319cb62d2993f220009a681eb3337ab55a0a02afd3afc189db502c1d4cc247be', 'SIGNUP_VERIFY', 0, '2026-09-17T09:43:46.762Z', '2026-09-17T09:38:46.763Z') ON CONFLICT DO NOTHING;

-- Data for table: password_reset_tokens (2 rows)
INSERT INTO "password_reset_tokens" ("id", "user_id", "token_hash", "consumed", "expires_at", "created_at") VALUES ('a71b0782-9ef5-454e-80d9-c3765c96ec36', 'e9ac8a95-867f-457a-89c3-92b8ddf0af7e', '5c08e50b0562b5b07b9f34bdf3585d199419b47d9b6c14127c65aca35a4aa4e5', TRUE, '2026-08-18T06:06:12.231Z', '2026-08-18T05:56:12.232Z') ON CONFLICT DO NOTHING;
INSERT INTO "password_reset_tokens" ("id", "user_id", "token_hash", "consumed", "expires_at", "created_at") VALUES ('0ce9449e-60af-4938-b085-5b69d97c7eb2', '8b63c9f3-480d-442d-bd39-9fa11beff17d', 'f1a4961bae6caae27068daa7629fa0115f3be23333831cfbab06e34c317e51d6', TRUE, '2026-09-17T09:07:51.035Z', '2026-09-17T08:57:51.036Z') ON CONFLICT DO NOTHING;

-- Data for table: token_blacklist (2 rows)
INSERT INTO "token_blacklist" ("id", "token_hash", "expires_at", "created_at") VALUES ('5532e94a-5687-41f1-bf3b-f982b2febe87', 'd47e9875952bfb8581a46bac95d605442f0ff7dd20c54cc622389d4e87006d02', '2026-09-21T07:50:48.000Z', '2026-09-14T07:55:08.661Z') ON CONFLICT DO NOTHING;
INSERT INTO "token_blacklist" ("id", "token_hash", "expires_at", "created_at") VALUES ('cfae8fce-278d-47b0-a60b-42fba07dc9e4', '48257f6fd95f76e632ce861ee18fc1030813dbf901ddf74ef6d57e1dbde442c9', '2026-09-24T09:35:29.000Z', '2026-09-17T09:37:59.123Z') ON CONFLICT DO NOTHING;

COMMIT;
