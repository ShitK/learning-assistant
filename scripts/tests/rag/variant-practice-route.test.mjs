import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { POST } = jiti("./src/app/api/variant-practice/route.ts");

const validPayload = {
  student_id: "demo_student_001",
  request_source: "confirmed_image_diagnosis",
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  question_text: "已知函数 f(x)=ln x-ax+1，讨论函数单调性。",
  knowledge_points: ["derivative_monotonicity"],
  mistake_causes: ["classification_missing"],
};

{
  const response = await POST(
    new Request("http://localhost/api/variant-practice", {
      method: "POST",
      body: JSON.stringify(validPayload),
    }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(
    body.variant_practice === null || body.variant_practice.items.length === 3,
    true,
  );
  const responseJson = JSON.stringify(body);
  assert.equal(responseJson.includes("cosine_distance"), false);
  assert.equal(responseJson.includes("metadata_score"), false);
  assert.equal(responseJson.includes("embedding_hash"), false);
  assert.equal(responseJson.includes("source_candidate_id"), false);
  assert.equal(responseJson.includes("item_id"), false);
  assert.equal(responseJson.includes("source_ref"), false);
}

{
  const response = await POST(
    new Request("http://localhost/api/variant-practice", {
      method: "POST",
      body: "{",
    }),
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "invalid_json");
}

console.log("variant practice route tests passed");
