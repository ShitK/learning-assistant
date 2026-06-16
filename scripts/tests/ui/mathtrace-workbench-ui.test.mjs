import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

function stripComments(sourceText) {
  return sourceText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
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
  /await deleteMistakeBookItem[\s\S]*await refreshMistakeBook\(\);\s*await refreshCloudStudentProfile\(\);/,
  "确认删除成功后应先刷新错题本，再刷新云端画像。",
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
  /await refreshCloudStudentProfile\(\)/,
  "诊断和删除成功路径应等待云端画像刷新。",
);
assert.match(
  source,
  /createSampleDiagnosisViewModel\([\s\S]*diagnosis\.warnings,[\s\S]*\)[\s\S]*await refreshMistakeBook\(\);\s*await refreshCloudStudentProfile\(\);\s*return;/,
  "sample_diagnosis 成功后应等待错题本刷新，再等待云端画像刷新。",
);
assert.match(
  source,
  /requestConfirmedImageDiagnosis[\s\S]*await refreshMistakeBook\(\);\s*await refreshCloudStudentProfile\(\);/,
  "图片确认写入成功后应等待错题本刷新，再等待云端画像刷新。",
);
assert.equal(
  source.includes("@/lib/shared/persistence-warnings"),
  true,
  "工作台应从 browser-safe 共享模块读取重复错题提示文案。",
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
