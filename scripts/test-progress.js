import { prisma } from "../src/config/db.js";
import { CourseService } from "../src/services/course.service.js";
import assert from "assert";

async function runTests() {
  console.log("=== Running Progress System Validation Tests ===");

  // 1. Find or create a test user and lesson
  let user = await prisma.user.findFirst({ where: { email: { contains: "admin" } } });
  if (!user) {
    user = await prisma.user.findFirst();
  }
  assert(user, "Test user must exist in database");

  const lesson = await prisma.courseLesson.findFirst({
    include: {
      module: {
        include: { course: true }
      }
    }
  });
  assert(lesson, "Test lesson must exist in database");

  const courseId = lesson.module.course_id;
  const lessonId = lesson.id;

  console.log(`Testing with User ID: ${user.id}, Lesson ID: ${lessonId}, Course ID: ${courseId}`);

  // Test 1: Reset progress
  await CourseService.removeLessonProgress(user.id, lessonId);
  const initial = await CourseService.getLessonProgress(user.id, lessonId);
  assert.strictEqual(initial.last_position, 0, "Initial last_position must be 0");
  assert.strictEqual(initial.completed, false, "Initial completed must be false");
  console.log("✔ Test 1 Passed: Initial progress reset & empty record handling");

  // Test 2: Save partial progress with float last_position (e.g. 42.75 seconds of a 100s video)
  const saved = await CourseService.saveLessonProgress(user.id, courseId, lessonId, {
    last_position: 42.75,
    duration: 100,
    completed: false,
  });
  assert.strictEqual(Number(saved.last_position), 42.75, "Saved last_position must be 42.75");
  assert.strictEqual(saved.progress_seconds, 42, "progress_seconds must be floored to 42");
  assert.strictEqual(saved.completed, false, "Should not be completed at 42.75% (<90%)");
  console.log("✔ Test 2 Passed: Float last_position stored and floored progress_seconds");

  // Test 3: Auto-completion mark at >= 90%
  const completedSaved = await CourseService.saveLessonProgress(user.id, null, lessonId, {
    last_position: 91.5,
    duration: 100,
  });
  assert.strictEqual(Number(completedSaved.last_position), 91.5, "Saved last_position must be 91.5");
  assert.strictEqual(completedSaved.completed, true, "Should automatically mark completed at >= 90%");
  console.log("✔ Test 3 Passed: Auto-completion trigger at >= 90% duration");

  // Test 4: Retrieve learning content and verify last_position in payload
  const learningData = await CourseService.getCourseLearningContent(courseId, user);
  assert(learningData.course, "Learning content course must be returned");
  const targetLesson = learningData.course.modules
    .flatMap((m) => m.lessons)
    .find((l) => l.id === lessonId);
  assert(targetLesson, "Lesson must be present in curriculum");
  assert.strictEqual(targetLesson.last_position, 91.5, "Curriculum lesson payload must contain last_position");
  console.log("✔ Test 4 Passed: Curriculum learning content includes last_position");

  console.log("\nAll Progress System Validation Tests Passed Successfully!\n");
  await prisma.$disconnect();
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});