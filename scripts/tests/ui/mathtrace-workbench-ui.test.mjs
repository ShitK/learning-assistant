import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

function stripComments(sourceText) {
  return sourceText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function assertIncludesAll(sourceText, fragments, message) {
  for (const fragment of fragments) {
    assert.equal(sourceText.includes(fragment), true, `${message} 缺少 ${fragment}`);
  }
}

const jiti = createProjectJiti({ jsx: true });
const source = stripComments(
  await readFile("src/components/mathtrace-workbench.tsx", "utf8"),
);
const panelSource = stripComments(
  await readFile("src/components/mistake-book-panel.tsx", "utf8"),
);
const globalStyles = stripComments(await readFile("src/app/globals.css", "utf8"));
const workbenchStructureSources = Object.fromEntries(
  await Promise.all(
    [
      "agent-timeline.tsx",
      "diagnosis-result-card.tsx",
      "header-bar.tsx",
      "mistake-input-card.tsx",
      "practice-lab.tsx",
      "profile-insights.tsx",
      "profile-view-model.ts",
      "review-path.tsx",
      "risk-follow-up-panel.tsx",
      "section-header.tsx",
      "standard-solution-content.tsx",
      "tag.tsx",
      "workbench-labels.ts",
      "workbench-types.ts",
    ].map(async (fileName) => [
      fileName,
      stripComments(
        await readFile(`src/components/workbench/${fileName}`, "utf8"),
      ),
    ]),
  ),
);
const workbenchUiSource = [
  source,
  ...Object.values(workbenchStructureSources),
].join("\n");
const {
  confirmMistakeBookItemDeletion,
  createMistakeBookPanelViewModel,
} = jiti("./src/components/mistake-book-panel.tsx");
const {
  calculateWeaknessIndex,
  createProfileInsightsViewModel,
  getWeaknessStatus,
  HIGH_FREQUENCY_MISTAKE_CAUSE_THRESHOLD,
} = jiti("./src/components/workbench/profile-view-model.ts");
const {
  getMistakeCauseDescription,
  getMistakeCauseTitle,
} = jiti("./src/components/workbench/workbench-labels.ts");
const { requestStudentProfileEvidence } = jiti(
  "./src/lib/student-profile/student-profile-evidence-client.ts",
);
const {
  demoStudentProfile,
  sampleDiagnoses,
} = jiti("./src/data/mathtrace-demo.ts");
const { createSampleDiagnosisViewModel } = jiti(
  "./src/lib/diagnosis/diagnosis-view-model.ts",
);
const { applyMemoryDeltaToProfile } = jiti(
  "./src/lib/shared/student-profile.ts",
);

assert.equal(typeof requestStudentProfileEvidence, "function");

assert.equal(
  workbenchUiSource.includes("错误发生步骤"),
  false,
  "分析结果 UI 不应再展示“错误发生步骤”模块。",
);

assert.equal(
  workbenchUiSource.includes("学生答案与偏离点"),
  false,
  "分析结果 UI 不应再展示“学生答案与偏离点”模块。",
);

assert.equal(
  workbenchUiSource.includes("学生答案"),
  false,
  "识别结果确认 UI 不应再展示“学生答案”输入框。",
);

assert.equal(
  workbenchUiSource.includes("学生解题步骤"),
  true,
  "识别结果确认 UI 应将“解题步骤”改为“学生解题步骤”。",
);

assert.equal(
  workbenchUiSource.includes("解题步骤"),
  true,
  "识别结果确认 UI 仍应保留学生步骤输入能力。",
);

assert.equal(
  workbenchUiSource.includes("diagnosis conclusion"),
  false,
  "分析结果 UI 不应再展示偏离点结论卡片。",
);

assert.match(
  workbenchUiSource,
  /riskFollowUp \? null : \(/,
  "低证据追问模式下不应展示外层“确认生成报告”按钮。",
);

assert.equal(
  workbenchUiSource.includes("请在右侧核对"),
  false,
  "追问模式提示不应要求用户去右侧核对。",
);

assert.match(
  workbenchUiSource,
  /pendingFollowUpAnswer \? "确认写入画像" : "生成分析草稿"/,
  "追问卡片应使用同一个主按钮在“生成分析草稿”和“确认写入画像”之间切换。",
);

assert.equal(
  workbenchUiSource.includes("@supabase/supabase-js"),
  false,
  "工作台客户端组件不能 import Supabase 浏览器客户端。",
);
assert.doesNotMatch(
  source,
  /createSupabaseAdminClient|@supabase\/supabase-js/,
  "工作台只能通过 HTTP client 读取云端画像，不能直接 import Supabase。",
);
assert.match(
  source,
  /import \{ requestCloudStudentProfile \} from "@\/lib\/student-profile\/student-profile-client";/,
  "工作台应从 browser-safe HTTP client 读取云端画像。",
);
assert.match(
  source,
  /import \{ requestStudentProfileEvidence \} from "@\/lib\/student-profile\/student-profile-evidence-client";/,
  "工作台应从 browser-safe HTTP client 读取云端画像证据。",
);
assert.match(
  source,
  /const \[studentProfileEvidence, setStudentProfileEvidence\]/,
  "工作台应持有 evidence state 并作为可选输入传给画像展示。",
);
assert.match(
  source,
  /const studentProfileEvidenceRefreshRequestIdRef = useRef\(0\);/,
  "云端 evidence 刷新应使用 request id ref 防止旧请求覆盖新状态。",
);
assert.match(
  source,
  /const evidence = await requestStudentProfileEvidence\(\);/,
  "工作台应 best-effort 请求画像证据摘要。",
);
assert.match(
  source,
  /setStudentProfileEvidence\(evidence\.evidence\);/,
  "工作台只应把响应里的 evidence 摘要传给 UI。",
);
assert.match(
  source,
  /const refreshStudentProfileEvidence = useCallback\(async \(\): Promise<void> => \{[\s\S]*const evidenceRefreshRequestId =\s*\+\+studentProfileEvidenceRefreshRequestIdRef\.current;[\s\S]*try \{[\s\S]*setStudentProfileEvidence\(evidence\.evidence\);[\s\S]*\} catch \{[\s\S]*if \(\s*evidenceRefreshRequestId !==\s*studentProfileEvidenceRefreshRequestIdRef\.current\s*\) \{\s*return;\s*\}\s*setStudentProfileEvidence\(null\);[\s\S]*\}/,
  "当前 evidence 请求失败时应清空 evidence；旧请求失败不应覆盖新请求状态。",
);
assert.match(
  source,
  /<ProfileInsights[\s\S]*evidence=\{studentProfileEvidence\}/,
  "ProfileInsights 应接收 workbench 传入的 evidence，而不是自己 fetch。",
);
assert.match(
  source,
  /function handleResetProfile\(\): void \{[\s\S]*studentProfileEvidenceRefreshRequestIdRef\.current \+= 1;[\s\S]*setStudentProfileEvidence\(null\);/,
  "重置画像应清空 evidence 状态，避免旧证据解释已重置 demo。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes(
    "requestStudentProfileEvidence",
  ),
  false,
  "ProfileInsights 不能直接请求 evidence API。",
);

assert.equal(
  workbenchUiSource.includes("SUPABASE_SERVICE_ROLE_KEY"),
  false,
  "工作台客户端组件不能读取 Supabase service role key。",
);

assert.equal(
  panelSource.includes("@supabase/supabase-js"),
  false,
  "错题本只读面板不能 import Supabase 浏览器客户端。",
);

assert.equal(
  panelSource.includes("SUPABASE_SERVICE_ROLE_KEY"),
  false,
  "错题本只读面板不能读取 Supabase service role key。",
);

assert.match(
  source,
  /initialVariantPractice\?: ProductVariantPractice \| null/,
  "MathTraceWorkbench 应接收服务端传入的变式练习推荐 view model。",
);

assert.match(
  workbenchStructureSources["practice-lab.tsx"],
  /variantPractice\?: ProductVariantPractice \| null/,
  "PracticeLab 应能消费正式产品裁剪后的变式练习 view model。",
);

assert.equal(
  source.includes(
    'import { requestDynamicVariantPractice } from "@/lib/rag/dynamic-variant-practice-client";',
  ),
  true,
  "工作台应通过 browser-safe client 请求动态变式练习。",
);

assertIncludesAll(
  source,
  [
    "dynamicVariantPractice",
    "setDynamicVariantPractice",
    "dynamicVariantPracticeRequestIdRef",
    "useRef(0)",
  ],
  "工作台应持有动态 RAG 状态和 request id ref。",
);

assertIncludesAll(
  source,
  [
    "const visibleVariantPractice =",
    "isCurrentConfirmedImageReport",
    'diagnosisView.source === "image"',
    "dynamicVariantPractice",
    "initialVariantPractice",
  ],
  "变式练习展示优先级应覆盖确认上传题动态推荐和默认样例静态推荐。",
);

assertIncludesAll(
  source,
  [
    "const refreshDynamicVariantPractice = useCallback",
    "requestDynamicVariantPractice({",
    "const requestId = ++dynamicVariantPracticeRequestIdRef.current;",
    "requestId !== dynamicVariantPracticeRequestIdRef.current",
    "setDynamicVariantPractice(variantPractice);",
  ],
  "动态 RAG 请求应调用 client，并只允许最新请求写入状态。",
);

assert.equal(
  source.includes("void refreshDynamicVariantPractice(diagnosis);"),
  true,
  "确认上传题生成报告后应异步请求动态变式练习。",
);

assertIncludesAll(
  source,
  [
    "function clearDynamicVariantPractice(): void",
    "dynamicVariantPracticeRequestIdRef.current += 1;",
    "setDynamicVariantPractice(null);",
    "function handleImagePrepareError(message: string): void",
    "function handleClearImage(): void",
  ],
  "开始新诊断、图片准备失败或清空图片时应清空动态 RAG 推荐并废弃旧请求。",
);

for (const forbidden of [
  "matched_dimensions",
  "knowledge_point",
  "derivative_geometric_meaning",
  "tangent_slope",
  "命中目标技能标签",
  "score",
  "target_skill",
  "method_tag",
  "query_term",
  "source_candidate_id",
]) {
  assert.equal(
    workbenchStructureSources["practice-lab.tsx"].includes(forbidden),
    false,
    `正式变式练习 UI 不应展示内部 RAG 字段: ${forbidden}`,
  );
}

assert.equal(calculateWeaknessIndex(35), 65);
assert.equal(calculateWeaknessIndex(27), 73);
assert.equal(getWeaknessStatus(73).label, "高优先级");
assert.equal(getWeaknessStatus(58).label, "待巩固");
assert.equal(getWeaknessStatus(32).label, "基本稳定");
assert.equal(getWeaknessStatus(12).label, "稳定");
assert.equal(getWeaknessStatus(calculateWeaknessIndex(39)).label, "高优先级");
assert.equal(getWeaknessStatus(calculateWeaknessIndex(40)).label, "待巩固");
assert.equal(getWeaknessStatus(calculateWeaknessIndex(59)).label, "待巩固");
assert.equal(getWeaknessStatus(calculateWeaknessIndex(60)).label, "基本稳定");
assert.equal(getWeaknessStatus(calculateWeaknessIndex(79)).label, "基本稳定");
assert.equal(getWeaknessStatus(calculateWeaknessIndex(80)).label, "稳定");
assert.equal(HIGH_FREQUENCY_MISTAKE_CAUSE_THRESHOLD, 5);

assert.equal(getMistakeCauseTitle("domain_missing"), "范围/边界遗漏");
assert.match(
  getMistakeCauseDescription("classification_missing"),
  /分类|情况|含参/,
);
assert.equal(getMistakeCauseTitle("unknown_cause"), "unknown_cause");
assert.equal(
  workbenchStructureSources["workbench-labels.ts"].includes("getMistakeShortName"),
  false,
  "P1.9 已改用错因标题和解释，不应保留旧的 getMistakeShortName 死代码。",
);

const derivativeSample = sampleDiagnoses.find(
  (sample) => sample.id === "sample_derivative_001",
);
assert.ok(derivativeSample, "测试样例 sample_derivative_001 应存在。");
const derivativeDiagnosis = createSampleDiagnosisViewModel(derivativeSample);
const afterDerivativeProfile = applyMemoryDeltaToProfile(
  demoStudentProfile,
  derivativeSample.memory_delta,
);
const profileInsights = createProfileInsightsViewModel({
  diagnosis: derivativeDiagnosis,
  beforeProfile: demoStudentProfile,
  afterProfile: afterDerivativeProfile,
  mistakeHistoryLength: 8,
});

assert.equal(profileInsights.title, "画像变化");
assert.equal(profileInsights.conclusionRows.length, 2);
assert.equal(profileInsights.conclusionRows[0].id, "parameter_classification");
assert.equal(profileInsights.conclusionRows[0].weaknessIndex, 62);
assert.equal(profileInsights.conclusionRows[0].weaknessDelta, 8);
assert.equal(
  profileInsights.conclusionRows[0].summary,
  "本次 +8，当前薄弱指数 62",
);
assert.equal(profileInsights.conclusionRows[0].status.label, "高优先级");
assert.equal(profileInsights.priorityRows[0].id, "parameter_classification");
assert.equal(profileInsights.highlightedMistakeCauses.length, 2);
assert.equal(
  profileInsights.highlightedMistakeCauses[0].id,
  "classification_missing",
);
assert.equal(
  profileInsights.highlightedMistakeCauses[0].isNewInDiagnosis,
  true,
);
assert.equal(
  profileInsights.highlightedMistakeCauses[0].isHighFrequency,
  true,
);
assert.equal(
  profileInsights.highlightedMistakeCauses[0].countSummary,
  "本次 +1，累计 5 次",
);
assert.equal(
  profileInsights.otherMistakeCauses.some(
    (cause) => cause.id === "calculation_error",
  ),
  true,
);
assert.match(profileInsights.actionAdvice, /优先复习参数分类讨论/);
assert.match(
  profileInsights.recommendation.title,
  /为什么优先复习参数分类讨论/,
);
assert.equal(
  profileInsights.recommendation.bullets.some((bullet) =>
    bullet.includes("完整 memory_events"),
  ),
  false,
  "P1.9 推荐依据不能声称读取完整 memory_events 历史。",
);
const evidenceBackedProfileInsights = createProfileInsightsViewModel({
  diagnosis: derivativeDiagnosis,
  beforeProfile: demoStudentProfile,
  afterProfile: afterDerivativeProfile,
  mistakeHistoryLength: 8,
  evidence: {
    event_count: 3,
    latest_event_at: "2026-06-18T10:00:00.000Z",
    top_knowledge_focus: [
      {
        id: "parameter_classification",
        event_count: 2,
        total_weakness_delta: 8,
        latest_event_at: "2026-06-18T10:00:00.000Z",
      },
    ],
    top_mistake_causes: [
      {
        id: "classification_missing",
        event_count: 2,
        total_delta: 3,
        latest_event_at: "2026-06-18T10:00:00.000Z",
      },
    ],
    recent_events: [
      {
        id: "event-3",
        created_at: "2026-06-18T10:00:00.000Z",
        event_type: "mistake_cause",
        evidence_level: "student_work_sufficient",
        persistence_evidence: "student_work",
        knowledge_focus: ["parameter_classification"],
        mistake_causes: ["classification_missing"],
        rationale_summary: "系统把参数分类讨论提升为复习优先级第一位。",
      },
    ],
  },
});
assert.match(
  evidenceBackedProfileInsights.recommendation.bullets.join("\n"),
  /结合最近 3 次已确认的画像记录，参数分类讨论出现 2 次薄弱证据/,
);
assert.match(
  evidenceBackedProfileInsights.recommendation.bullets.join("\n"),
  /分类讨论漏项.*这些画像记录中新增 3 次/,
);
assert.equal(
  evidenceBackedProfileInsights.recommendation.bullets.some((bullet) =>
    bullet.includes("完整历史"),
  ),
  false,
);

const evidenceNotMatchingProfileInsights = createProfileInsightsViewModel({
  diagnosis: derivativeDiagnosis,
  beforeProfile: demoStudentProfile,
  afterProfile: afterDerivativeProfile,
  mistakeHistoryLength: 8,
  evidence: {
    event_count: 2,
    latest_event_at: "2026-06-18T10:00:00.000Z",
    top_knowledge_focus: [
      {
        id: "derivative_monotonicity",
        event_count: 2,
        total_weakness_delta: 4,
        latest_event_at: "2026-06-18T10:00:00.000Z",
      },
    ],
    top_mistake_causes: [
      {
        id: "calculation_error",
        event_count: 1,
        total_delta: 1,
        latest_event_at: "2026-06-18T10:00:00.000Z",
      },
    ],
    recent_events: [
      {
        id: "event-domain",
        created_at: "2026-06-18T10:00:00.000Z",
        event_type: "mistake_cause",
        evidence_level: "student_work_sufficient",
        persistence_evidence: "student_work",
        knowledge_focus: ["derivative_monotonicity"],
        mistake_causes: ["calculation_error"],
        rationale_summary: "最近证据主要集中在函数单调性。",
      },
    ],
  },
});
assert.match(
  evidenceNotMatchingProfileInsights.recommendation.bullets.join("\n"),
  /结合最近 2 次已确认的画像记录，云端证据主要集中在导数与函数单调性/,
);
assert.match(
  evidenceNotMatchingProfileInsights.recommendation.bullets.join("\n"),
  /当前薄弱指数/,
);
assert.match(
  evidenceNotMatchingProfileInsights.recommendation.bullets.join("\n"),
  /本次诊断使薄弱指数上升/,
);
assert.match(
  evidenceNotMatchingProfileInsights.recommendation.bullets.join("\n"),
  /相关错因.*本次新增，累计/,
);
const emptyDiagnosis = {
  ...derivativeDiagnosis,
  memory_delta: {
    ...derivativeDiagnosis.memory_delta,
    knowledge_mastery_changes: {},
    mistake_cause_changes: {},
    review_priority_changes: [],
    should_persist: false,
  },
  should_persist_profile: false,
};
const emptyProfileInsights = createProfileInsightsViewModel({
  diagnosis: emptyDiagnosis,
  beforeProfile: demoStudentProfile,
  afterProfile: null,
  mistakeHistoryLength: 8,
});
assert.equal(emptyProfileInsights.conclusionRows.length, 0);
assert.equal(
  emptyProfileInsights.notPersistedMessage,
  "本次仅展示诊断建议，未写入长期画像。",
);
assert.match(emptyProfileInsights.actionAdvice, /当前错题报告完成订正/);
assert.match(emptyProfileInsights.recommendation.bullets[0], /没有新增可写入/);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("掌握度变化"),
  false,
  "画像区不应再以“掌握度变化”作为主标题。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("长期价值对比"),
  false,
  "画像区不应继续使用虚泛的“长期价值对比”叙事。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("薄弱指数"),
  true,
  "画像区应使用薄弱指数表达复习优先级。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("本次诊断结论"),
  true,
  "画像区应展示本次诊断结论。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("全部知识点优先级"),
  true,
  "画像区应提供全部知识点优先级折叠区。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("需要关注的错因"),
  true,
  "画像区应展示需要关注的错因。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("推荐依据"),
  true,
  "画像区应展示推荐依据。",
);
assert.match(
  workbenchStructureSources["profile-insights.tsx"],
  /createProfileInsightsViewModel/,
  "画像区应通过纯 view model 派生展示数据。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("memory_events"),
  false,
  "P1.9 前端 UI 不应声称读取完整 memory_events 历史。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("key={bullet}"),
  false,
  "推荐依据列表不应直接使用文案作为 React key。",
);
assert.equal(
  panelSource.includes("删除"),
  true,
  "错题本每条记录应展示删除按钮。",
);
assert.equal(
  panelSource.includes("onDeleteItem"),
  true,
  "错题本删除按钮应通过父组件回调触发删除，避免面板直连数据库。",
);
assert.equal(
  panelSource.includes("deletingItemId"),
  true,
  "删除请求进行中应只禁用对应错题的删除按钮。",
);
assert.match(
  panelSource,
  /if \(\s*!confirmMistakeBookItemDeletion/,
  "删除按钮应先二次确认，取消后不触发删除回调。",
);
assert.equal(
  panelSource.includes('import { MathText } from "@/components/math-text";'),
  true,
  "错题本题干和摘要应复用 MathText 渲染数学公式。",
);
assert.equal(
  panelSource.includes("<MathText text={item.questionText}"),
  true,
  "错题本题干不能直接输出含 $...$ 的普通文本。",
);

assert.equal(
  source.includes("MistakeBookPanel"),
  true,
  "工作台应接入 MistakeBookPanel。",
);
assert.equal(
  source.includes("deleteMistakeBookItem"),
  true,
  "工作台应通过 mistake-book client 调用 DELETE API。",
);
assert.match(
  source,
  /await deleteMistakeBookItem[\s\S]*await refreshMistakeBook\(\);/,
  "确认删除成功后应刷新错题本。",
);
assert.match(
  source,
  /const deleteResult = await deleteMistakeBookItem[\s\S]*await refreshMistakeBook\(\);\s*if \(deleteResult\.profile_sync_status === "synced"\) \{\s*await refreshStudentProfileEvidence\(\);\s*await refreshCloudStudentProfile\(\);\s*\}/,
  "确认删除成功后只有云端画像同步成功才刷新云端画像和 evidence。",
);
assert.equal(
  source.includes("await refreshMistakeBook();"),
  true,
  "图片确认写入成功后应重新读取错题本，避免页面停留在旧列表。",
);
assert.equal(
  workbenchUiSource.includes("diagnosis.warnings"),
  true,
  "诊断响应中的用户可见提示应展示在报告顶部。",
);
assert.match(
  source,
  /createSampleDiagnosisViewModel\(\s*diagnosis\.sample_diagnosis,\s*diagnosis\.warnings,\s*\)/,
  "sample_diagnosis 的持久化提示不应在前端丢失。",
);
assert.match(
  source,
  /!hasDuplicateMistakeBookItemWarning\(diagnosis\.warnings\)/,
  "重复题不新增 memory_event 时，前端也不应重复写入 demo localStorage 画像。",
);
assert.match(
  source,
  /requestCloudStudentProfile/,
  "工作台应在本地 demo fallback 后 best-effort 读取云端画像。",
);
assert.match(
  source,
  /const cloudProfileRefreshRequestIdRef = useRef\(0\);/,
  "云端画像刷新应使用 request id ref 防止旧请求覆盖新状态。",
);
assert.match(
  source,
  /const cloudProfileRefreshRequestId =\s*\+\+cloudProfileRefreshRequestIdRef\.current;/,
  "每次云端画像刷新应递增并捕获当前 request id。",
);
assert.match(
  source,
  /if \(\s*cloudProfileRefreshRequestId !== cloudProfileRefreshRequestIdRef\.current\s*\) \{\s*return;\s*\}\s*if \(cloudProfile\.profile\)/,
  "应用云端画像前应先丢弃过期请求结果。",
);
assert.match(
  source,
  /if \(cloudProfile\.profile\)/,
  "云端画像为空时不应覆盖本地 fallback。",
);
assert.match(
  source,
  /setSessionStudentProfile\(cloudProfile\.profile\)/,
  "最新云端画像应更新 session profile state。",
);
assert.match(
  source,
  /if \(cloudProfile\.profile\) \{[\s\S]*writeStoredStudentProfile\(window\.localStorage, cloudProfile\.profile\)[\s\S]*\}/,
  "只有云端返回有效画像时才写入 localStorage。",
);
assert.match(
  source,
  /writeStoredStudentProfile\(window\.localStorage, cloudProfile\.profile\)/,
  "云端返回画像后应同步写入 localStorage。",
);
assert.equal(
  (
    source.match(
      /writeStoredStudentProfile\(window\.localStorage, cloudProfile\.profile\)/g,
    ) ?? []
  ).length,
  1,
  "云端画像 localStorage 写入只能出现在有效 profile 分支内。",
);
assert.match(
  source,
  /try \{[\s\S]*const cloudProfile = await requestCloudStudentProfile\(\);[\s\S]*\} catch \{\s*\}/,
  "云端画像读取失败应保持 best-effort，不写入 apiErrorMessage。",
);
assert.match(
  source,
  /function handleResetProfile\(\): void \{[\s\S]*cloudProfileRefreshRequestIdRef\.current \+= 1;[\s\S]*clearStoredStudentProfile\(window\.localStorage\);/,
  "重置画像应作废旧的云端刷新请求，避免旧响应覆盖 demo profile。",
);
assert.match(
  source,
  /shouldRefreshCloudStudentProfileAfterDiagnosis\(diagnosis\.warnings\)/,
  "诊断成功路径应通过 warning predicate 判断是否刷新云端画像。",
);
assert.match(
  source,
  /useEffect\(\(\) => \{\s*if \(!hasHydrated\) \{\s*return;\s*\}\s*const timeoutId = window\.setTimeout\(\(\) => \{\s*void refreshCloudStudentProfile\(\);\s*\}, 0\);\s*return \(\) => window\.clearTimeout\(timeoutId\);\s*\}, \[hasHydrated, refreshCloudStudentProfile\]\);/,
  "初始云端画像 hydration 应延迟触发，避免 effect 内同步调用可 setState 的 callback。",
);
assert.match(
  source,
  /createSampleDiagnosisViewModel\([\s\S]*diagnosis\.warnings,[\s\S]*\)[\s\S]*await refreshMistakeBook\(\);\s*if \(shouldRefreshCloudStudentProfileAfterDiagnosis\(diagnosis\.warnings\)\) \{\s*await refreshStudentProfileEvidence\(\);\s*await refreshCloudStudentProfile\(\);\s*\}\s*return;/,
  "sample_diagnosis 成功后应只在云端画像可信时刷新云端画像和 evidence。",
);
assert.match(
  source,
  /requestConfirmedImageDiagnosis[\s\S]*await refreshMistakeBook\(\);\s*if \(shouldRefreshCloudStudentProfileAfterDiagnosis\(diagnosis\.warnings\)\) \{\s*await refreshStudentProfileEvidence\(\);\s*await refreshCloudStudentProfile\(\);\s*\}/,
  "图片确认写入成功后应只在云端画像可信时刷新云端画像和 evidence。",
);
assert.equal(
  source.includes("@/lib/shared/persistence-warnings"),
  true,
  "工作台应从 browser-safe 共享模块读取持久化提示文案。",
);
assert.match(
  source,
  /DATABASE_NOT_CONFIGURED_WARNING,\s*DATABASE_WRITE_FAILED_WARNING,\s*DUPLICATE_MISTAKE_BOOK_ITEM_WARNING,\s*PROFILE_SYNC_FAILED_WARNING,/,
  "工作台应 import browser-safe warning 常量，不能硬编码 stale-cloud 判断文案。",
);
assert.match(
  source,
  /function shouldRefreshCloudStudentProfileAfterDiagnosis\(\s*warnings: string\[\],\s*\): boolean \{[\s\S]*!warnings\.some\(\(warning\) =>\s*cloudProfileStaleWarnings\.includes\(warning\),[\s\S]*\);[\s\S]*\}/,
  "诊断云端刷新 predicate 应拒绝会导致云端画像过期的 warning。",
);
assert.match(
  source,
  /const cloudProfileStaleWarnings: readonly string\[\] = \[[\s\S]*PROFILE_SYNC_FAILED_WARNING,[\s\S]*DATABASE_WRITE_FAILED_WARNING,[\s\S]*DATABASE_NOT_CONFIGURED_WARNING,[\s\S]*\];/,
  "云端画像过期 warning 列表应覆盖 profile sync、DB 写入失败和 DB 未配置。",
);
assert.equal(
  /warnings\.includes\("本题已加入错题本。"\)/.test(source),
  false,
  "工作台不应硬编码重复错题提示文案，避免与服务端常量漂移。",
);

assert.equal(
  source.split("\n").length <= 950,
  true,
  "MathTraceWorkbench 主容器应保持在 950 行以内，交互组件应拆到 workbench 子组件。",
);

for (const { fileName, exportName, pattern } of [
  {
    fileName: "agent-timeline.tsx",
    exportName: "AgentTimeline",
    pattern: /^export\s+function\s+AgentTimeline\b/m,
  },
  {
    fileName: "diagnosis-result-card.tsx",
    exportName: "DiagnosisResultCard",
    pattern: /^export\s+function\s+DiagnosisResultCard\b/m,
  },
  {
    fileName: "header-bar.tsx",
    exportName: "HeaderBar",
    pattern: /^export\s+function\s+HeaderBar\b/m,
  },
  {
    fileName: "mistake-input-card.tsx",
    exportName: "MistakeInputCard",
    pattern: /^export\s+function\s+MistakeInputCard\b/m,
  },
  {
    fileName: "practice-lab.tsx",
    exportName: "PracticeLab",
    pattern: /^export\s+function\s+PracticeLab\b/m,
  },
  {
    fileName: "profile-insights.tsx",
    exportName: "ProfileInsights",
    pattern: /^export\s+function\s+ProfileInsights\b/m,
  },
  {
    fileName: "profile-view-model.ts",
    exportName: "createProfileInsightsViewModel",
    pattern: /^export\s+function\s+createProfileInsightsViewModel\b/m,
  },
  {
    fileName: "review-path.tsx",
    exportName: "ReviewPath",
    pattern: /^export\s+function\s+ReviewPath\b/m,
  },
  {
    fileName: "risk-follow-up-panel.tsx",
    exportName: "RiskFollowUpPanel",
    pattern: /^export\s+function\s+RiskFollowUpPanel\b/m,
  },
  {
    fileName: "risk-follow-up-panel.tsx",
    exportName: "createEditableDraftRiskFollowUp",
    pattern: /^export\s+function\s+createEditableDraftRiskFollowUp\b/m,
  },
  {
    fileName: "section-header.tsx",
    exportName: "SectionHeader",
    pattern: /^export\s+function\s+SectionHeader\b/m,
  },
  {
    fileName: "standard-solution-content.tsx",
    exportName: "StandardSolutionContent",
    pattern: /^export\s+function\s+StandardSolutionContent\b/m,
  },
  {
    fileName: "tag.tsx",
    exportName: "Tag",
    pattern: /^export\s+function\s+Tag\b/m,
  },
  {
    fileName: "workbench-labels.ts",
    exportName: "practiceLevelLabels",
    pattern: /^export\s+const\s+practiceLevelLabels\b/m,
  },
  {
    fileName: "workbench-types.ts",
    exportName: "DiagnosisMode",
    pattern: /^export\s+type\s+DiagnosisMode\b/m,
  },
  {
    fileName: "workbench-types.ts",
    exportName: "ProfilePreview",
    pattern: /^export\s+interface\s+ProfilePreview\b/m,
  },
  {
    fileName: "workbench-types.ts",
    exportName: "ConfirmedDiagnosisOptions",
    pattern: /^export\s+interface\s+ConfirmedDiagnosisOptions\b/m,
  },
]) {
  assert.match(
    workbenchStructureSources[fileName],
    pattern,
    `${fileName} 应导出 ${exportName} named export。`,
  );
}

let confirmMessage = null;
const didCancelDeletion = confirmMistakeBookItemDeletion({
  confirm: (message) => {
    confirmMessage = message;
    return false;
  },
  questionText: "已知 $f(x)$ 的单调性。",
});
assert.equal(didCancelDeletion, false);
assert.equal(confirmMessage.includes("确认删除这条错题"), true);
assert.equal(confirmMessage.includes("$f(x)$"), true);

const didConfirmDeletion = confirmMistakeBookItemDeletion({
  confirm: () => true,
  questionText: "已知 $f(x)$ 的单调性。",
});
assert.equal(didConfirmDeletion, true);

const emptyPanel = createMistakeBookPanelViewModel({
  status: "ready",
  response: {
    student_id: "demo_student_001",
    items: [],
    is_database_configured: true,
    warnings: [],
  },
  errorMessage: null,
});

assert.equal(emptyPanel.statusLabel, "暂无错题记录");
assert.equal(emptyPanel.description, "完成一次可写入画像的诊断后，这里会显示最近错题。");

const longTextPanel = createMistakeBookPanelViewModel({
  status: "ready",
  response: {
    student_id: "demo_student_001",
    items: [
      {
        id: "book_item_001",
        diagnosis_run_id: "diag_run_001",
        source: "image",
        question_text:
          "这是一道很长很长的函数与导数题，包含参数分类讨论、单调区间判断、极值存在性分析，以及学生在若干步骤中遗漏条件导致后续推理失真的完整题干。",
        knowledge_points: ["derivative_monotonicity", "parameter_classification"],
        mistake_causes: ["classification_missing"],
        severity: "medium",
        diagnosis_summary:
          "学生主要问题是直接代入临界点，没有先按参数范围分类讨论。",
        evidence_level: "student_work_sufficient",
        persistence_evidence: "student_work",
        profile_update_kind: "mistake_cause",
        review_status: 0,
        created_at: "2026-06-11T10:00:00.000Z",
      },
    ],
    is_database_configured: true,
    warnings: [],
  },
  errorMessage: null,
});

assert.equal(longTextPanel.items.length, 1);
assert.equal(longTextPanel.items[0].questionText.endsWith("..."), true);
assert.equal(longTextPanel.items[0].sourceLabel, "图片诊断");
assert.equal(longTextPanel.items[0].severityLabel, "中等");

const rawMathPanel = createMistakeBookPanelViewModel({
  status: "ready",
  response: {
    student_id: "demo_student_001",
    items: [
      {
        id: "book_item_002",
        diagnosis_run_id: "diag_run_002",
        source: "image",
        question_text:
          "已知函数f(x)=lnx - a x + 1。(1)求f(x)的单调区间；(2)已知f(x)在(0,e)上有且仅有两个零点。",
        knowledge_points: ["derivative_monotonicity"],
        mistake_causes: ["domain_missing"],
        severity: "minor",
        diagnosis_summary: "学生只写出f'(x)=1/x-a，未讨论a > 0。",
        evidence_level: "problem_only",
        persistence_evidence: "user_confirmed",
        profile_update_kind: "mistake_cause",
        review_status: 0,
        created_at: "2026-06-11T10:00:00.000Z",
      },
    ],
    is_database_configured: true,
    warnings: [],
  },
  errorMessage: null,
});

assert.equal(
  rawMathPanel.items[0].questionText.includes("$f(x)=\\ln x - ax + 1$"),
  true,
);
assert.equal(rawMathPanel.items[0].summary.includes("$f'(x)=1/x-a$"), true);
assert.equal(hasBalancedInlineMathDelimiters(rawMathPanel.items[0].questionText), true);
assert.equal(hasBalancedInlineMathDelimiters(rawMathPanel.items[0].summary), true);

assert.equal(
  globalStyles.includes(".math-text .math-text-inline"),
  true,
  "题干、学生步骤、错题本等 MathText 场景应复用标准解法的内联公式字号和对齐规则。",
);
assert.equal(
  globalStyles.includes(".standard-solution-body .math-text-inline"),
  false,
  "公式字号和对齐规则不能只限定在标准解法区域。",
);

console.log("mathtrace workbench UI regression test passed");

function hasBalancedInlineMathDelimiters(text) {
  const matches = text.match(/(?<!\\)\$/g) ?? [];
  return matches.length % 2 === 0;
}
