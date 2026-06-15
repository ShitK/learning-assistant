import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { demoStudentProfile } = jiti("../src/data/mathtrace-demo.ts");
const {
  DEMO_STUDENT_PROFILE_STORAGE_KEY,
  parseStoredStudentProfile,
  serializeStudentProfile,
  createMemoryStorage,
  readStoredStudentProfile,
  writeStoredStudentProfile,
  clearStoredStudentProfile,
} = jiti("../src/lib/demo/demo-state.ts");

const updatedProfile = {
  ...demoStudentProfile,
  mastery_scores: {
    ...demoStudentProfile.mastery_scores,
    parameter_classification: 38,
  },
  frequent_mistake_causes: {
    ...demoStudentProfile.frequent_mistake_causes,
    classification_missing: 5,
  },
  review_priority: [
    "parameter_classification",
    "derivative_monotonicity",
    "function_domain",
  ],
  updated_at: "2026-05-30T10:00:00+08:00",
};

assert.equal(
  DEMO_STUDENT_PROFILE_STORAGE_KEY,
  "mathtrace.demoStudentProfile.v1",
);

assert.deepEqual(parseStoredStudentProfile(null), demoStudentProfile);
assert.deepEqual(parseStoredStudentProfile(""), demoStudentProfile);
assert.deepEqual(parseStoredStudentProfile("{"), demoStudentProfile);
assert.deepEqual(
  parseStoredStudentProfile(JSON.stringify({ student_id: 123 })),
  demoStudentProfile,
);
assert.deepEqual(
  parseStoredStudentProfile(
    JSON.stringify({
      ...updatedProfile,
      mastery_scores: ["bad-score"],
    }),
  ),
  demoStudentProfile,
);
assert.deepEqual(
  parseStoredStudentProfile(
    JSON.stringify({
      ...updatedProfile,
      gaokao_focus: "bad-focus",
    }),
  ),
  demoStudentProfile,
);
assert.deepEqual(
  parseStoredStudentProfile(
    serializeStudentProfile({
      ...updatedProfile,
      mastery_scores: {
        parameter_classification: Number.NaN,
      },
    }),
  ),
  demoStudentProfile,
);
assert.deepEqual(
  parseStoredStudentProfile(
    serializeStudentProfile({
      ...updatedProfile,
      gaokao_focus: [
        {
          knowledge_point: "parameter_classification",
          reason: "bad priority",
          priority: Number.POSITIVE_INFINITY,
        },
      ],
    }),
  ),
  demoStudentProfile,
);

assert.deepEqual(
  parseStoredStudentProfile(JSON.stringify(updatedProfile)),
  updatedProfile,
);

const serializedProfile = serializeStudentProfile(updatedProfile);
assert.deepEqual(JSON.parse(serializedProfile), updatedProfile);
assert.deepEqual(parseStoredStudentProfile(serializedProfile), updatedProfile);

const storage = createMemoryStorage();
assert.deepEqual(readStoredStudentProfile(storage), demoStudentProfile);

writeStoredStudentProfile(storage, updatedProfile);
assert.deepEqual(readStoredStudentProfile(storage), updatedProfile);

const secondUpdatedProfile = {
  ...updatedProfile,
  mastery_scores: {
    ...updatedProfile.mastery_scores,
    parameter_classification: 35,
  },
};
writeStoredStudentProfile(storage, secondUpdatedProfile);
assert.deepEqual(readStoredStudentProfile(storage), secondUpdatedProfile);

storage.setItem(DEMO_STUDENT_PROFILE_STORAGE_KEY, "{");
assert.deepEqual(readStoredStudentProfile(storage), demoStudentProfile);

writeStoredStudentProfile(storage, updatedProfile);
clearStoredStudentProfile(storage);
assert.deepEqual(readStoredStudentProfile(storage), demoStudentProfile);

const throwingStorage = {
  getItem() {
    throw new Error("storage unavailable");
  },
  setItem() {
    throw new Error("storage unavailable");
  },
  removeItem() {
    throw new Error("storage unavailable");
  },
};

assert.deepEqual(readStoredStudentProfile(throwingStorage), demoStudentProfile);
assert.doesNotThrow(() => writeStoredStudentProfile(throwingStorage, updatedProfile));
assert.doesNotThrow(() => clearStoredStudentProfile(throwingStorage));

console.log("demo state regression test passed");
