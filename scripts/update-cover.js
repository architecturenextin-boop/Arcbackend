import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgres://39d9dc25c87c82517622b258e00672b600774b61215b40e29f4fcfacc649319f:sk_ngzZxJGfaWhQhogwEwvFG@db.prisma.io:5432/postgres?sslmode=require",
    },
  },
});

async function main() {
  const result = await prisma.course.updateMany({
    data: {
      cover_url: "/course-cover.jpeg",
      thumbnail_url: "/course-cover.jpeg",
    },
  });
  console.log("✅ Updated course cover_url:", result.count);
  await prisma.$disconnect();
}

main();
