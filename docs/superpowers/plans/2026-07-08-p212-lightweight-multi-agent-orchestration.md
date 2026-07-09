# P2.12 Lightweight Multi-Agent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing MathTrace diagnosis chain into real lightweight agent-role modules: VisionExtractionAgent, MistakeDiagnosisAgent, and LearningMemoryAgent, while preserving all API behavior and persistence gates.

**Architecture:** Keep `/api/diagnose` and `/api/confirm` as orchestration entry points. Extract current service responsibilities into three focused modules under `src/lib/diagnosis/agents/`; reuse existing deterministic pipeline, image pipeline, provider adapters, persistence services, and profile projection logic. Do not introduce LangGraph or any new runtime framework.

**Tech Stack:** Next.js App Router, TypeScript, existing Node script tests with `jiti`, Supabase PostgreSQL through existing server-side persistence modules.

## Global Constraints

- Do not change frontend UI or P2.11 problem chat behavior.
- Do not change `/api/diagnose` or `/api/confirm` request/response contracts.
- Do not change Supabase schema, RPC names, `memory_delta`, `student_profiles`, `mistake_book_items`, `memory_events`, or pgvector behavior.
- Do not introduce LangGraph, AutoGen, OpenAI Agents SDK, Vercel AI SDK, or any new dependency.
- `sample_diagnosis` must remain stable and must not require model provider, database, network, or image input.
- Image extraction review responses must not include `memory_delta` or `student_profile`.
- Analysis provider output remains display-only and must not change `memory_delta`.
- Frontend/client code must not import Supabase admin clients, service role keys, provider modules, or new server-side agent modules.
- Existing unrelated untracked file `interview/mathtrace-interview-prep.md` must not be staged or modified unless the user explicitly asks.

---

## File Structure

Create:

- `src/lib/diagnosis/agents/diagnosis-agent-types.ts`
  - Shared type definitions for agent service result and dependency bags.
- `src/lib/diagnosis/agents/vision-extraction-agent.ts`
  - Image parsing, provider selection, provider error mapping, extraction review response construction.
- `src/lib/diagnosis/agents/mistake-diagnosis-agent.ts`
  - Thin wrappers around `runMathTraceAgent()` and `runImageMathTraceAgent()` with agent-role names.
- `src/lib/diagnosis/agents/learning-memory-agent.ts`
  - Persistence gate, profile projection sync, persistence warning merge.
- `scripts/tests/diagnosis/multi-agent-orchestration.test.mjs`
  - Focused regression tests proving role boundaries and equivalence.

Modify:

- `src/lib/diagnosis/diagnose-service.ts`
  - Keep parsing and request routing; delegate to agent modules.
  - Preserve `DiagnoseServiceResult` and `persistDiagnosisIfNeeded` exports for tests/import compatibility.
- `src/lib/diagnosis/confirm-service.ts`
  - Keep confirmation parsing and analysis enhancement; delegate diagnosis/persistence to agent modules.
- `scripts/run-tests.mjs`
  - Add `scripts/tests/diagnosis/multi-agent-orchestration.test.mjs` near existing diagnosis tests.
- `scripts/tests/architecture/architecture-boundaries.test.mjs`
  - Add import-boundary checks so client reachable code cannot import server-side agent modules, and agent modules cannot cross their trust boundaries.
- `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - Add P2.12 architecture note.
- `interview/mathtrace-project-narrative.md`
  - Update P2.12 interview story after implementation.
- `README.md`
  - Update architecture wording to match the implemented agent role modules.

---

### Task 1: Add Failing Multi-Agent Role Tests

**Files:**
- Create: `scripts/tests/diagnosis/multi-agent-orchestration.test.mjs`
- Modify: `scripts/run-tests.mjs`
- Modify: `scripts/tests/architecture/architecture-boundaries.test.mjs`

**Interfaces:**
- Consumes existing functions:
  - `runMathTraceAgent(request)`
  - `runImageMathTraceAgent(input)`
  - `handleDiagnoseRequest(payload, deps?)`
  - `handleConfirmRequest(payload, deps?)`
- Produces expected new functions:
  - `runVisionExtractionAgent(input)`
  - `runSampleMistakeDiagnosisAgent(request)`
  - `runConfirmedImageMistakeDiagnosisAgent(input)`
  - `runLearningMemoryAgent(input)`

- [ ] **Step 1: Create the failing test file**

Create `scripts/tests/diagnosis/multi-agent-orchestration.test.mjs` with:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();

const { demoStudentProfile, sampleDiagnoses } = jiti(
  "./src/data/mathtrace-demo.ts",
);
const { runMathTraceAgent } = jiti(
  "./src/lib/diagnosis/mathtrace-agent-pipeline.ts",
);
const { runImageMathTraceAgent } = jiti(
  "./src/lib/image-diagnosis/image-diagnosis-pipeline.ts",
);
const {
  runVisionExtractionAgent,
} = jiti("./src/lib/diagnosis/agents/vision-extraction-agent.ts");
const {
  runSampleMistakeDiagnosisAgent,
  runConfirmedImageMistakeDiagnosisAgent,
} = jiti("./src/lib/diagnosis/agents/mistake-diagnosis-agent.ts");
const {
  runLearningMemoryAgent,
} = jiti("./src/lib/diagnosis/agents/learning-memory-agent.ts");
const {
  persistDiagnosisIfNeeded: servicePersistDiagnosisIfNeeded,
  handleDiagnoseRequest,
} = jiti("./src/lib/diagnosis/diagnose-service.ts");
const { handleConfirmRequest } = jiti(
  "./src/lib/diagnosis/confirm-service.ts",
);

assert.equal(
  typeof servicePersistDiagnosisIfNeeded,
  "function",
  "diagnose-service should keep persistDiagnosisIfNeeded re-export compatibility.",
);

const firstSample = sampleDiagnoses[0];
assert.ok(firstSample, "sample fixture should exist");

const sampleRequest = {
  student_id: "demo_student_001",
  task_type: "sample_diagnosis",
  sample_question_id: firstSample.id,
  image_base64: null,
  student_profile: demoStudentProfile,
  mistake_history: [],
};

assert.deepEqual(
  runSampleMistakeDiagnosisAgent(sampleRequest),
  runMathTraceAgent(sampleRequest),
  "MistakeDiagnosisAgent sample role should preserve existing sample diagnosis output.",
);

const extraction = {
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
  student_solution_steps: ["求导", "只写一个临界点"],
  extraction_confidence: "high",
  warnings: [],
};
const confirmedImageInput = {
  request: {
    student_id: "demo_student_001",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  extraction,
  is_extraction_confirmed: true,
  confirmation_action: "diagnose_from_student_work",
};

assert.deepEqual(
  runConfirmedImageMistakeDiagnosisAgent(confirmedImageInput),
  runImageMathTraceAgent(confirmedImageInput),
  "MistakeDiagnosisAgent confirmed-image role should preserve existing image diagnosis output.",
);

const visionResult = await runVisionExtractionAgent({
  request: {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "data:image/png;base64,iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  vision_provider: {
    async extractQuestionFromImage() {
      return { ok: true, value: extraction };
    },
  },
});

assert.equal(visionResult.status, 200);
assert.equal(visionResult.body.stage, "extraction_review");
assert.equal(visionResult.body.requires_confirmation, true);
assert.equal("memory_delta" in visionResult.body, false);
assert.equal("student_profile" in visionResult.body, false);

const missingImageResult = await runVisionExtractionAgent({
  request: {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: null,
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  vision_provider: {
    async extractQuestionFromImage() {
      throw new Error("provider should not be called for missing image");
    },
  },
});

assert.equal(missingImageResult.status, 400);
assert.equal(missingImageResult.body.error.code, "missing_image");

const providerTimeoutResult = await runVisionExtractionAgent({
  request: {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "data:image/png;base64,iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  vision_provider: {
    async extractQuestionFromImage() {
      return {
        ok: false,
        error: {
          code: "model_timeout",
          message: "模型请求超时。",
          recoverable: true,
        },
      };
    },
  },
});

assert.equal(providerTimeoutResult.status, 502);
assert.equal(providerTimeoutResult.body.error.code, "model_timeout");
assert.equal(providerTimeoutResult.body.fallback_used, true);

const warningsResult = await runLearningMemoryAgent({
  result: {
    status: 200,
    body: runMathTraceAgent(sampleRequest),
  },
  persistence_repository: {
    async persistDiagnosis() {
      return { status: "duplicate" };
    },
  },
});

assert.equal(warningsResult.status, 200);
assert.equal(
  warningsResult.body.warnings.includes("本题已加入错题本。"),
  true,
  "LearningMemoryAgent should preserve duplicate warning behavior.",
);

const visionSource = await readFile(
  "src/lib/diagnosis/agents/vision-extraction-agent.ts",
  "utf8",
);
assert.equal(
  /memory_delta|student_profiles|mistake_book_items/.test(visionSource),
  false,
  "VisionExtractionAgent must not know persistence or profile write fields.",
);

const mistakeSource = await readFile(
  "src/lib/diagnosis/agents/mistake-diagnosis-agent.ts",
  "utf8",
);
assert.equal(
  /persistDiagnosis|syncProjectedStudentProfile|Supabase|service_role/.test(
    mistakeSource,
  ),
  false,
  "MistakeDiagnosisAgent must not persist or access Supabase.",
);

const sampleServiceResult = await handleDiagnoseRequest(sampleRequest, {
  persistence_repository: {
    async persistDiagnosis() {
      return { status: "disabled" };
    },
  },
});

assert.equal(sampleServiceResult.status, 200);
assert.equal(sampleServiceResult.body.source, "sample");
assert.equal(
  sampleServiceResult.body.warnings.includes("数据库暂未配置，诊断结果未写入错题本。"),
  true,
);

const imageServiceResult = await handleDiagnoseRequest(
  {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "data:image/png;base64,iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    vision_provider: {
      async extractQuestionFromImage() {
        return { ok: true, value: extraction };
      },
    },
  },
);

assert.equal(imageServiceResult.status, 200);
assert.equal(imageServiceResult.body.stage, "extraction_review");
assert.equal("memory_delta" in imageServiceResult.body, false);

const confirmServiceResult = await handleConfirmRequest(
  {
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: imageServiceResult.body.confirmation_token,
    confirmed_extraction: extraction,
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    persistence_repository: {
      async persistDiagnosis() {
        return { status: "disabled" };
      },
    },
  },
);

assert.equal(confirmServiceResult.status, 200);
assert.equal(confirmServiceResult.body.source, "image");
assert.equal(confirmServiceResult.body.memory_delta.should_persist, true);
assert.equal(
  confirmServiceResult.body.warnings.includes(
    "数据库暂未配置，诊断结果未写入错题本。",
  ),
  true,
);
```

- [ ] **Step 2: Add the test to the default suite**

In `scripts/run-tests.mjs`, add this line after `scripts/tests/diagnosis/diagnosis-evidence.test.mjs`:

```js
    "scripts/tests/diagnosis/multi-agent-orchestration.test.mjs",
```

- [ ] **Step 3: Add architecture boundary assertions**

In `scripts/tests/architecture/architecture-boundaries.test.mjs`, add this block after the existing client reachable file checks and before `domainBoundaryRules`:

```js
for (const filePath of clientReachableFiles) {
  const source = sourceByFilePath.get(filePath);
  const importSources = getRuntimeImportSources(source, filePath);

  assert.equal(
    filePath.startsWith("src/lib/diagnosis/agents/"),
    false,
    `${filePath} must not be in the client component runtime graph.`,
  );
  assert.equal(
    importSources.some((importSource) =>
      importSource.startsWith("@/lib/diagnosis/agents/"),
    ),
    false,
    `${filePath} must not import server-side diagnosis agent modules.`,
  );
}

const agentBoundaryRules = [
  {
    file: "src/lib/diagnosis/agents/vision-extraction-agent.ts",
    forbidden_source_patterns: [
      /persistDiagnosisResponse/,
      /syncProjectedStudentProfile/,
      /createSupabaseAdminClient/,
      /@\/lib\/persistence\//,
      /@\/lib\/student-profile\//,
      /memory_events/,
      /student_profiles/,
      /mistake_book_items/,
    ],
  },
  {
    file: "src/lib/diagnosis/agents/mistake-diagnosis-agent.ts",
    forbidden_source_patterns: [
      /persistDiagnosis/,
      /syncProjectedStudentProfile/,
      /createSupabaseAdminClient/,
      /@\/lib\/persistence\//,
      /@\/lib\/student-profile\//,
      /@\/lib\/providers\//,
      /service_role/,
    ],
  },
  {
    file: "src/lib/diagnosis/agents/learning-memory-agent.ts",
    forbidden_source_patterns: [
      /@\/lib\/providers\//,
      /createVisionProvider/,
      /createAnalysisProvider/,
      /parseDiagnoseRequest/,
      /parseConfirmedExtractionDraft/,
      /runMathTraceAgent/,
      /runImageMathTraceAgent/,
    ],
  },
];

for (const rule of agentBoundaryRules) {
  const source = sourceByFilePath.get(rule.file);
  assert.ok(source, `${rule.file} should exist.`);

  for (const pattern of rule.forbidden_source_patterns) {
    assert.equal(
      pattern.test(source),
      false,
      `${rule.file} violates diagnosis agent boundary: ${pattern}`,
    );
  }
}
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run:

```bash
node scripts/tests/diagnosis/multi-agent-orchestration.test.mjs
node scripts/tests/architecture/architecture-boundaries.test.mjs
```

Expected:

```text
Error: Cannot find module './src/lib/diagnosis/agents/vision-extraction-agent.ts'
```

The architecture test should fail until the agent files exist.

---

### Task 2: Create Agent Types And Role Modules

**Files:**
- Create: `src/lib/diagnosis/agents/diagnosis-agent-types.ts`
- Create: `src/lib/diagnosis/agents/vision-extraction-agent.ts`
- Create: `src/lib/diagnosis/agents/mistake-diagnosis-agent.ts`
- Create: `src/lib/diagnosis/agents/learning-memory-agent.ts`
  - This module intentionally keeps a thin `runLearningMemoryAgent()` orchestration entry point around the existing persistence gate. Do not add new reasoning or new write policy here.

**Interfaces:**
- Produces:
  - `DiagnoseAgentResult`
  - `VisionExtractionAgentInput`
  - `runVisionExtractionAgent(input): Promise<DiagnoseAgentResult>`
  - `runSampleMistakeDiagnosisAgent(request): DiagnoseSuccessResponse`
  - `runConfirmedImageMistakeDiagnosisAgent(input): DiagnoseImageSuccessResponse`
  - `runLearningMemoryAgent(input): Promise<DiagnoseAgentResult>`
  - `persistDiagnosisIfNeeded(result, repository?, studentProfileRepository?): Promise<DiagnoseAgentResult>`

- [ ] **Step 1: Add shared agent result type**

Create `src/lib/diagnosis/agents/diagnosis-agent-types.ts`:

```ts
import type { DiagnoseApiResponse } from "@/lib/diagnosis/diagnose-api";
import type { DiagnosisPersistenceRepository } from "@/lib/persistence/diagnosis-persistence";
import type { StudentProfileProjectionRepository } from "@/lib/persistence/student-profile-persistence";

export interface DiagnoseAgentResult {
  status: number;
  body: DiagnoseApiResponse;
}

export interface LearningMemoryAgentRepositories {
  persistence_repository?: DiagnosisPersistenceRepository;
  student_profile_repository?: StudentProfileProjectionRepository;
}
```

- [ ] **Step 2: Add MistakeDiagnosisAgent wrapper**

Create `src/lib/diagnosis/agents/mistake-diagnosis-agent.ts`:

```ts
import { runMathTraceAgent } from "@/lib/diagnosis/mathtrace-agent-pipeline";
import { runImageMathTraceAgent } from "@/lib/image-diagnosis/image-diagnosis-pipeline";
import type { DiagnoseImageSuccessResponse } from "@/lib/shared/diagnosis-result-types";
import type {
  DiagnoseSuccessResponse,
  ParsedSampleDiagnoseRequest,
} from "@/lib/diagnosis/diagnose-api";
import type { AnalysisEnhancementDraft } from "@/lib/shared/analysis-provider-types";
import type {
  ConfirmationAction,
  FollowUpAnswerDraft,
} from "@/lib/shared/diagnosis-evidence";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

export interface ConfirmedImageMistakeDiagnosisAgentInput {
  request: {
    student_id: string;
    student_profile: unknown;
    mistake_history: unknown[];
  };
  extraction: VisionExtractionDraft;
  is_extraction_confirmed: boolean;
  confirmation_action?: ConfirmationAction;
  follow_up_answer?: FollowUpAnswerDraft;
  analysis?: AnalysisEnhancementDraft;
}

export function runSampleMistakeDiagnosisAgent(
  request: ParsedSampleDiagnoseRequest,
): DiagnoseSuccessResponse {
  return runMathTraceAgent(request);
}

export function runConfirmedImageMistakeDiagnosisAgent(
  input: ConfirmedImageMistakeDiagnosisAgentInput,
): DiagnoseImageSuccessResponse {
  return runImageMathTraceAgent(input);
}
```

- [ ] **Step 3: Add LearningMemoryAgent wrapper**

Create `src/lib/diagnosis/agents/learning-memory-agent.ts`:

```ts
import {
  DATABASE_NOT_CONFIGURED_WARNING,
  DATABASE_WRITE_FAILED_WARNING,
  DUPLICATE_MISTAKE_BOOK_ITEM_WARNING,
  persistDiagnosisResponse,
} from "@/lib/persistence/diagnosis-persistence";
import {
  PROFILE_SYNC_FAILED_WARNING,
  syncProjectedStudentProfile,
} from "@/lib/student-profile/student-profile-service";
import { isRecord } from "@/lib/shared/utils";
import type { DiagnoseApiResponse } from "@/lib/diagnosis/diagnose-api";
import type {
  DiagnoseImageSuccessResponse,
  DiagnoseSuccessResponse,
} from "@/lib/shared/diagnosis-result-types";
import type { DiagnosisPersistenceResult } from "@/lib/persistence/diagnosis-persistence";
import type {
  DiagnoseAgentResult,
  LearningMemoryAgentRepositories,
} from "@/lib/diagnosis/agents/diagnosis-agent-types";

export async function runLearningMemoryAgent(
  input: {
    result: DiagnoseAgentResult;
  } & LearningMemoryAgentRepositories,
): Promise<DiagnoseAgentResult> {
  return persistDiagnosisIfNeeded(
    input.result,
    input.persistence_repository,
    input.student_profile_repository,
  );
}

export async function persistDiagnosisIfNeeded(
  result: DiagnoseAgentResult,
  repository?: LearningMemoryAgentRepositories["persistence_repository"],
  studentProfileRepository?: LearningMemoryAgentRepositories["student_profile_repository"],
): Promise<DiagnoseAgentResult> {
  if (!isPersistableDiagnosisResponse(result.body)) {
    return result;
  }

  const persistenceResult = await persistDiagnosisResponse(
    result.body,
    repository,
  );
  const warnings: string[] = [];
  const persistenceWarning = getPersistenceWarning(persistenceResult);
  if (persistenceWarning) {
    warnings.push(persistenceWarning);
  }

  if (persistenceResult.status === "persisted") {
    const profileSync = await syncProjectedStudentProfile(
      result.body.student_id,
      studentProfileRepository,
    );
    if (profileSync.status === "failed") {
      warnings.push(profileSync.warning ?? PROFILE_SYNC_FAILED_WARNING);
    }
  }

  if (warnings.length === 0) {
    return result;
  }

  return {
    ...result,
    body: {
      ...result.body,
      warnings: appendUniqueWarnings(result.body.warnings, warnings),
    },
  };
}

function isPersistableDiagnosisResponse(
  body: DiagnoseApiResponse,
): body is DiagnoseSuccessResponse | DiagnoseImageSuccessResponse {
  return (
    isRecord(body) &&
    (body.source === "sample" || body.source === "image") &&
    "memory_delta" in body &&
    "student_profile" in body
  );
}

function getPersistenceWarning(
  result: DiagnosisPersistenceResult,
): string | null {
  if (result.status === "disabled") {
    return DATABASE_NOT_CONFIGURED_WARNING;
  }

  if (result.status === "failed") {
    return DATABASE_WRITE_FAILED_WARNING;
  }

  if (result.status === "duplicate") {
    return DUPLICATE_MISTAKE_BOOK_ITEM_WARNING;
  }

  return null;
}

function appendUniqueWarning(warnings: string[], warning: string): string[] {
  return warnings.includes(warning) ? warnings : [...warnings, warning];
}

function appendUniqueWarnings(
  warnings: string[],
  nextWarnings: string[],
): string[] {
  return nextWarnings.reduce(appendUniqueWarning, warnings);
}
```

- [ ] **Step 4: Add VisionExtractionAgent**

Create `src/lib/diagnosis/agents/vision-extraction-agent.ts` by moving the image-only helper logic out of `diagnose-service.ts`. The exported surface must be:

```ts
export interface VisionExtractionAgentInput {
  request: ParsedImageDiagnoseRequest;
  vision_provider?: VisionExtractionProvider;
}

export async function runVisionExtractionAgent(
  input: VisionExtractionAgentInput,
): Promise<DiagnoseAgentResult>
```

The implementation must include the existing logic currently in `diagnose-service.ts`:

```ts
const parsedImage = parseImageInput({
  image_base64: input.request.image_base64,
  image_mime_type: input.request.image_mime_type,
  max_bytes: 1_000_000,
});

if (!parsedImage.ok) {
  return {
    status: parsedImage.error === "image_too_large" ? 413 : 400,
    body: createDiagnoseError(
      parsedImage.error,
      getImageInputErrorMessage(parsedImage.error),
      true,
    ),
  };
}
```

Move these private helpers from `diagnose-service.ts` into `vision-extraction-agent.ts`:

- `buildImageExtractionResponse`
- `hashExtractionDraft`
- `hashText`
- `getVisionProvider`
- `buildVisionExtractionInput`
- `summarizeStudentProfile`
- `getProviderErrorStatus`
- `shouldMarkFallbackUsed`
- `getSafeDebugSummary`
- `getImageInputErrorMessage`

Keep the existing response behavior unchanged:

```ts
return {
  status: 200,
  body: buildImageExtractionResponse({
    student_id: input.request.student_id,
    extraction: extractionResult.value,
  }),
};
```

- [ ] **Step 5: Run the new focused tests**

Run:

```bash
node scripts/tests/diagnosis/multi-agent-orchestration.test.mjs
node scripts/tests/architecture/architecture-boundaries.test.mjs
```

Expected: PASS.

---

### Task 3: Wire Diagnose And Confirm Services Through Agent Roles

**Files:**
- Modify: `src/lib/diagnosis/diagnose-service.ts`
- Modify: `src/lib/diagnosis/confirm-service.ts`

**Interfaces:**
- Consumes:
  - `runVisionExtractionAgent`
  - `runSampleMistakeDiagnosisAgent`
  - `runConfirmedImageMistakeDiagnosisAgent`
  - `runLearningMemoryAgent`
  - `persistDiagnosisIfNeeded`
- Produces:
  - Existing `handleDiagnoseRequest(payload, deps?)`
  - Existing `handleConfirmRequest(payload, deps?)`
  - Existing `persistDiagnosisIfNeeded(...)` export compatibility from `diagnose-service.ts`

- [ ] **Step 1: Update `diagnose-service.ts` imports**

Replace direct imports of vision provider constructors, image input parser, persistence warnings, profile sync, `runMathTraceAgent`, `isRecord`, and provider types with agent imports:

```ts
import { createDiagnoseError, parseDiagnoseRequest } from "@/lib/diagnosis/diagnose-api";
import {
  runLearningMemoryAgent,
  persistDiagnosisIfNeeded,
} from "@/lib/diagnosis/agents/learning-memory-agent";
import { runSampleMistakeDiagnosisAgent } from "@/lib/diagnosis/agents/mistake-diagnosis-agent";
import { runVisionExtractionAgent } from "@/lib/diagnosis/agents/vision-extraction-agent";
import type {
  DiagnoseApiResponse,
  ParsedImageDiagnoseRequest,
} from "@/lib/diagnosis/diagnose-api";
import type {
  DiagnoseAgentResult,
  LearningMemoryAgentRepositories,
} from "@/lib/diagnosis/agents/diagnosis-agent-types";
import type { VisionExtractionProvider } from "@/lib/providers/anthropic-compatible-provider";
```

Keep this compatibility export:

```ts
export type DiagnoseServiceResult = DiagnoseAgentResult;
export { persistDiagnosisIfNeeded };
```

- [ ] **Step 2: Rewrite sample orchestration in `handleDiagnoseRequest`**

The sample branch should become:

```ts
if (parsedRequest.value.task_type === "sample_diagnosis") {
  try {
    return await runLearningMemoryAgent({
      result: {
        status: 200,
        body: runSampleMistakeDiagnosisAgent(parsedRequest.value),
      },
      persistence_repository: deps?.persistence_repository,
      student_profile_repository: deps?.student_profile_repository,
    });
  } catch {
    return {
      status: 400,
      body: createDiagnoseError(
        "unknown_sample_question_id",
        "未找到这个样例题，请重新选择。",
        true,
      ),
    };
  }
}
```

- [ ] **Step 3: Rewrite image orchestration**

Replace `handleImageDiagnoseRequest` body with:

```ts
async function handleImageDiagnoseRequest(
  request: ParsedImageDiagnoseRequest,
  deps?: {
    vision_provider?: VisionExtractionProvider;
  },
): Promise<DiagnoseServiceResult> {
  return runVisionExtractionAgent({
    request,
    vision_provider: deps?.vision_provider,
  });
}
```

Delete private helpers that moved to `vision-extraction-agent.ts` or `learning-memory-agent.ts`.

- [ ] **Step 4: Update `confirm-service.ts` imports and orchestration**

Replace imports:

```ts
import { persistDiagnosisIfNeeded } from "@/lib/diagnosis/diagnose-service";
import { runImageMathTraceAgent } from "@/lib/image-diagnosis/image-diagnosis-pipeline";
```

with:

```ts
import { runLearningMemoryAgent } from "@/lib/diagnosis/agents/learning-memory-agent";
import { runConfirmedImageMistakeDiagnosisAgent } from "@/lib/diagnosis/agents/mistake-diagnosis-agent";
```

Then replace the final return in `handleConfirmRequest` with:

```ts
return runLearningMemoryAgent({
  result: {
    status: 200,
    body: runConfirmedImageMistakeDiagnosisAgent({
      request: parsed.value.request,
      extraction: parsed.value.extraction,
      is_extraction_confirmed: parsed.value.is_confirmation_token_matched,
      confirmation_action: parsed.value.confirmation_action,
      follow_up_answer: parsed.value.follow_up_answer,
      analysis,
    }),
  },
  persistence_repository: deps?.persistence_repository,
  student_profile_repository: deps?.student_profile_repository,
});
```

- [ ] **Step 5: Run focused regression tests**

Run:

```bash
node scripts/tests/diagnosis/multi-agent-orchestration.test.mjs
node scripts/tests/architecture/architecture-boundaries.test.mjs
node scripts/tests/diagnosis/agent-pipeline.test.mjs
node scripts/tests/image-diagnosis/image-confirmation.test.mjs
node scripts/tests/persistence/diagnosis-persistence.test.mjs
```

Expected: all PASS.

---

### Task 4: Update Documentation And Interview Narrative

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `interview/mathtrace-project-narrative.md`
- Modify: `README.md`

**Interfaces:**
- Consumes implemented module paths:
  - `src/lib/diagnosis/agents/vision-extraction-agent.ts`
  - `src/lib/diagnosis/agents/mistake-diagnosis-agent.ts`
  - `src/lib/diagnosis/agents/learning-memory-agent.ts`
- Produces updated, honest interview wording.

- [ ] **Step 1: Add P2.12 note to PRD**

In `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, near the P2.11 note, add:

```md
P2.12 在不改变 API 契约、前端 UI、Supabase schema 或画像写入规则的前提下，把现有诊断链路重构为轻量多智能体职责编排：`VisionExtractionAgent` 负责图片结构化抽取和确认草稿，`MistakeDiagnosisAgent` 负责样例题与确认后图片题的结构化错因诊断，`LearningMemoryAgent` 负责确认后通过既有证据 gate 写入错题本、`memory_events` 并同步 `student_profiles`。本阶段不引入 LangGraph/AutoGen，不做 agent 自主决策、checkpoint、interrupt、多 provider routing、多题历史或聊天消息持久化；它是对现有确定性 pipeline 的职责边界落地。
```

- [ ] **Step 2: Update interview narrative**

In `interview/mathtrace-project-narrative.md`, add a new section after P2.11:

```md
## 26. P2.12 轻量多智能体职责编排 MVP

### 当前状态

已完成轻量代码重构。项目中真实存在 `VisionExtractionAgent`、`MistakeDiagnosisAgent` 和 `LearningMemoryAgent` 三个职责模块，但运行时仍由 `/api/diagnose` 和 `/api/confirm` 的受控流程顺序编排，没有引入 LangGraph 或 AutoGen。

### 功能价值

这一步把“多智能体式架构”从简历话术推进到代码边界。面试时可以说明：我没有让多个 Agent 自由对话，而是先把高风险学习系统拆成可测试的职责单元，保证视觉模型、诊断规则和长期记忆写入互不越权。

### 关键设计

- `VisionExtractionAgent`：只负责图片抽取和确认草稿，不生成 `memory_delta`。
- `MistakeDiagnosisAgent`：负责样例题和确认后图片题的错因诊断，不访问 Supabase。
- `LearningMemoryAgent`：负责确认后的错题本、`memory_events` 和 `student_profiles` 写入 gate，不重新计算错因。

其中 `MistakeDiagnosisAgent` 当前主要是对现有确定性诊断函数的职责边界封装，`LearningMemoryAgent` 主要是把既有持久化 gate 和画像投影同步收口到单独模块；它们不是“会自主推理的 Agent runtime”。

### 推荐回答

我会说这是轻量多智能体职责编排，而不是复杂多智能体 runtime。当前业务流程是固定的，真正重要的是把模型能力放在受控位置：视觉 Agent 看图，诊断 Agent 归因，记忆 Agent 写结构化事实。后续如果要做任务中断恢复、多 provider 路由或老师端报告 Agent，再引入 LangGraph 的 StateGraph 和 checkpoint。
```

- [ ] **Step 3: Update README architecture wording**

In `README.md`, update the existing “受控 Agent 流程” bullet to mention the implemented role modules. This is required because the README is the first architecture entry point:

```md
- 轻量多智能体职责编排：将一次错题诊断拆成 `VisionExtractionAgent`、`MistakeDiagnosisAgent` 和 `LearningMemoryAgent` 三类职责；当前由服务端受控流程顺序编排，不让模型自由写入长期学习状态。
```

- [ ] **Step 4: Run docs grep**

Run:

```bash
rg -n "P2\\.12|VisionExtractionAgent|MistakeDiagnosisAgent|LearningMemoryAgent|LangGraph" README.md docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md interview/mathtrace-project-narrative.md
```

Expected: The matches should include the new P2.12 wording and should explicitly say this is not LangGraph runtime.

---

### Task 5: Full Verification, Review Prompt, And Commit Scope

**Files:**
- No new code files unless previous tasks uncover a required targeted fix.
- Do not stage `docs/reviews/*.md`.
- Do not stage `interview/mathtrace-interview-prep.md`.

**Interfaces:**
- Consumes all implementation and docs from Tasks 1-4.
- Produces verified local checkpoint ready for Claude Code review.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Check whitespace and status**

Run:

```bash
git diff --check
git status --short
```

Expected:

- `git diff --check` prints nothing.
- `git status --short` shows only P2.12 implementation/docs files plus any pre-existing unrelated untracked file.

- [ ] **Step 4: Prepare Claude Code review prompt**

Use this prompt:

```md
请审查当前分支的 P2.12 轻量多智能体职责编排 MVP。重点看：

1. 是否真的把职责拆成 `VisionExtractionAgent`、`MistakeDiagnosisAgent`、`LearningMemoryAgent`，而不是只改名。
2. `/api/diagnose` 和 `/api/confirm` 的 request/response contract 是否保持不变。
3. `sample_diagnosis` 是否仍不依赖 provider、数据库、网络或图片输入。
4. 图片 extraction_review 阶段是否仍不会返回 `memory_delta` / `student_profile`，也不会写错题本或画像。
5. Analysis provider 是否仍只增强展示字段，不能改变 `memory_delta`。
6. `LearningMemoryAgent` 是否只复用现有 persistence gate、Supabase RPC 和 profile projection，不重新计算错因。
7. 前端/client 代码是否没有直接 import agent server modules、Supabase admin client、provider env 或 service role key。
8. 测试是否覆盖 agent role 边界、sample/image/confirm/persistence 回归。
9. 文档是否诚实表述为轻量多智能体职责编排，而不是 LangGraph/AutoGen runtime。
10. 是否混入无关文件，尤其不要提交 `docs/reviews/*.md` 和未确认的 `interview/mathtrace-interview-prep.md`。

请把审查报告写入：
`docs/reviews/2026-07-08-p212-lightweight-multi-agent-orchestration-review.md`
```

- [ ] **Step 5: Stage exact files after review fixes only**

After implementation, self-test, Claude review, fixes and retest, stage exact files only. Expected stage candidates:

```bash
git add src/lib/diagnosis/agents/diagnosis-agent-types.ts
git add src/lib/diagnosis/agents/vision-extraction-agent.ts
git add src/lib/diagnosis/agents/mistake-diagnosis-agent.ts
git add src/lib/diagnosis/agents/learning-memory-agent.ts
git add src/lib/diagnosis/diagnose-service.ts
git add src/lib/diagnosis/confirm-service.ts
git add scripts/tests/diagnosis/multi-agent-orchestration.test.mjs
git add scripts/run-tests.mjs
git add docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md
git add interview/mathtrace-project-narrative.md
git add README.md
```

Do not use `git add .`.

- [ ] **Step 6: Commit after verified review closure**

Run:

```bash
git commit -m "refactor: add lightweight diagnosis agent roles"
```

Expected: local commit created after all verification and review fixes pass.

---

## Plan Self-Review

- Spec coverage: The plan covers real role modules, controlled orchestration, unchanged API contracts, unchanged persistence gates, docs update, and verification.
- Placeholder scan: No placeholder markers or unspecified edge handling remain.
- Type consistency: Agent function names and result types are consistent across tests, implementation tasks and service wiring.
- Scope control: The plan explicitly excludes LangGraph, multi-topic history, frontend UI changes, Supabase schema changes and agent autonomous planning.
