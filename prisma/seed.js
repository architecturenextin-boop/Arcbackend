import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding SkillSpring LMS PostgreSQL Database...");

  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash("Admin@123456", salt);
  const studentPasswordHash = await bcrypt.hash("Student@123456", salt);

  // 1. Create Admin User
  const admin = await prisma.user.upsert({
    where: { email: "admin@architecturenext.in" },
    update: {
      role: "ADMIN",
      password_hash: adminPasswordHash,
      is_verified: true,
    },
    create: {
      email: "admin@architecturenext.in",
      password_hash: adminPasswordHash,
      first_name: "Master",
      last_name: "Admin",
      full_name: "Master Admin",
      username: "admin",
      phone: "+919876543210",
      role: "ADMIN",
      is_verified: true,
      onboarded: true,
      avatar_url: "/instructor.jpeg",
    },
  });
  console.log(" Admin created:", admin.email);

  // 2. Create Demo Student
  const student = await prisma.user.upsert({
    where: { email: "learner@architecturenext.in" },
    update: {
      password_hash: studentPasswordHash,
      is_verified: true,
    },
    create: {
      email: "learner@architecturenext.in",
      password_hash: studentPasswordHash,
      first_name: "Rahul",
      last_name: "Verma",
      full_name: "Rahul Verma",
      username: "rahul_bim",
      phone: "+919812345678",
      role: "STUDENT",
      is_verified: true,
      goal: "Switch careers",
      onboarded: true,
      avatar_url: "/hero-learner.jpeg",
    },
  });
  console.log(" Student created:", student.email);

  // 3. Create Sample Course: Revit Architecture Masterclass
  const revitCourse = await prisma.course.upsert({
    where: { slug: "revit-architecture-masterclass" },
    update: {},
    create: {
      slug: "revit-architecture-masterclass",
      title: "Revit Architecture & BIM Masterclass: Zero to Studio Ready",
      tagline: "Master Autodesk Revit, BIM coordination, parametric modeling, and presentation sheets from scratch in Malayalam.",
      description: "A comprehensive Malayalam masterclass designed by industry-leading architects. Build real-world residential and commercial BIM projects from scratch.",
      cover_url: "/course-cover.jpeg",
      thumbnail_url: "/course-cover.jpeg",
      price: 999,
      original_price: 2499,
      currency: "₹",
      total_duration: "18h 45m",
      total_lessons: 12,
      level: "Beginner → Studio-ready",
      language: "Malayalam",
      rating: 4.9,
      review_count: 142,
      preview_video_url: "https://youtu.be/dQw4w9WgXcQ",
      what_you_will_learn: [
        "Master Revit UI, Level & Grid System setup",
        "Design multi-storey architectural floor plans & elevations",
        "Create custom parametric families & schedule takeoffs",
        "Export professional CD sheets, PDFs & AutoCAD DWG files"
      ],
      tools_covered: ["Autodesk Revit 2026", "AutoCAD", "Enscape 3D", "Photoshop"],
      highlights: ["18+ Hours of HD Lessons", "Practice Project Files", "Verified Certificate", "Lifetime Access"],
      requirements: ["A laptop or PC capable of running Autodesk Revit", "No prior 3D modeling experience needed"],
      target_audience: ["Architecture Students", "Civil Engineers", "Interior Designers", "CAD Draftsmen"],
      published: true,
      status: "PUBLISHED",
    },
  });

  const architectureCourse = await prisma.course.upsert({
    where: { slug: "architecture-plan-presentation-animation" },
    update: {},
    create: {
      slug: "architecture-plan-presentation-animation",
      title: "Architecture Plan Presentation & Animation",
      tagline: "Create Professional Architectural Presentations from CAD Drawings to Animated Visuals",
      description: "Master architectural plan presentation, Lumion 3D animation, Photoshop post-processing and client walkthroughs.",
      cover_url: "/course-cover.jpeg",
      thumbnail_url: "/course-cover.jpeg",
      price: 1999,
      original_price: 5999,
      currency: "₹",
      total_duration: "18h 45m",
      total_lessons: 38,
      level: "Complete Course",
      language: "Malayalam",
      rating: 4.9,
      review_count: 1240,
      preview_video_url: "https://youtu.be/dQw4w9WgXcQ",
      what_you_will_learn: [
        "Lifetime Access",
        "Internship Certificate",
        "Portfolio Review",
        "Downloadable Resources",
        "Community Membership",
        "Future Course Updates"
      ],
      tools_covered: ["Lumion 3D", "Photoshop", "SketchUp", "Premiere Pro"],
      highlights: ["18+ Hours of HD Lessons", "Practice Project Files", "Verified Certificate", "Lifetime Access"],
      requirements: ["A laptop or PC capable of running 3D modeling tools"],
      target_audience: ["Architecture Students", "Civil Engineers", "Interior Designers"],
      published: true,
      status: "PUBLISHED",
    },
  });

  // 4. Create Modules & Lessons
  const mod1 = await prisma.courseModule.create({
    data: {
      course_id: revitCourse.id,
      title: "Module 1 — Getting Started with Revit & BIM Environment",
      description: "Understand the core fundamentals of Building Information Modeling and project template setup.",
      sort_order: 0,
      lessons: {
        create: [
          {
            title: "Lesson 1: Introduction to BIM & Revit Workspace",
            description: "An overview of BIM workflow vs traditional CAD drafting.",
            duration: "12:30",
            video_url: "https://youtu.be/dQw4w9WgXcQ",
            is_free: true,
            sort_order: 0,
          },
          {
            title: "Lesson 2: Setting Up Project Levels, Grids & Datum Elements",
            description: "Learn how to establish building elevations, datum planes, and grid alignments.",
            duration: "18:40",
            video_url: "https://youtu.be/dQw4w9WgXcQ",
            is_free: false,
            sort_order: 1,
          },
          {
            title: "Lesson 3: Basic Wall Assemblies, Layers & Materials",
            description: "Create compound exterior and interior wall types with accurate structural layers.",
            duration: "24:15",
            video_url: "https://youtu.be/dQw4w9WgXcQ",
            is_free: false,
            sort_order: 2,
          }
        ]
      }
    }
  });

  // 5. Enroll Demo Student in Course
  await prisma.enrollment.upsert({
    where: {
      user_id_course_id: {
        user_id: student.id,
        course_id: revitCourse.id,
      }
    },
    update: {},
    create: {
      user_id: student.id,
      course_id: revitCourse.id,
      status: "ACTIVE",
    }
  });

  console.log(" Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
