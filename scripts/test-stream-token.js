import { signStreamToken, verifyStreamToken } from "../src/utils/stream-token.js";
import assert from "assert";

async function runStreamTokenTests() {
  console.log("=== Running Stream Token & Edge Worker Security Tests ===");

  const secret = "test-stream-signing-secret-architecturenext";
  const lessonId = "e70419a5-5512-4e9e-a04f-75c7e79cdb8c";
  const userId = "235c749c-dcba-48f9-adec-f6f8d06b23f6";

  // Test 1: Sign token with 4-hour TTL
  const token = signStreamToken({ lessonId, userId, expiresInSeconds: 14400 }, secret);
  assert(token, "Signed stream token must be generated");
  assert.strictEqual(token.split(".").length, 3, "Token format must have 3 JWT/HMAC parts");
  console.log("✔ Test 1 Passed: Generated valid 3-part HMAC token");

  // Test 2: Verify valid token
  const payload = verifyStreamToken(token, lessonId, secret);
  assert(payload, "Payload must be successfully verified");
  assert.strictEqual(payload.sub, lessonId, "Payload subject must match lessonId");
  assert.strictEqual(payload.uid, userId, "Payload user ID must match userId");
  assert(payload.exp > Math.floor(Date.now() / 1000), "Token must not be expired");
  console.log("✔ Test 2 Passed: Verified token signature, lessonId, and TTL");

  // Test 3: Reject mismatched lessonId (anti-tamper / lesson swap prevention)
  const wrongLessonId = "00000000-0000-0000-0000-000000000000";
  const rejectedPayload = verifyStreamToken(token, wrongLessonId, secret);
  assert.strictEqual(rejectedPayload, null, "Must reject token for different lessonId");
  console.log("✔ Test 3 Passed: Successfully rejected mismatched lesson token swap");

  // Test 4: Reject tampered signature
  const tamperedToken = token.slice(0, -4) + "XXXX";
  const tamperedPayload = verifyStreamToken(tamperedToken, lessonId, secret);
  assert.strictEqual(tamperedPayload, null, "Must reject tampered signature");
  console.log("✔ Test 4 Passed: Successfully rejected tampered token signature");

  // Test 5: Reject expired token
  const expiredToken = signStreamToken({ lessonId, userId, expiresInSeconds: -10 }, secret);
  const expiredPayload = verifyStreamToken(expiredToken, lessonId, secret);
  assert.strictEqual(expiredPayload, null, "Must reject expired token");
  console.log("✔ Test 5 Passed: Successfully rejected expired token");

  console.log("\nAll Stream Token & Edge Worker Security Tests Passed Successfully!\n");
}

runStreamTokenTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});