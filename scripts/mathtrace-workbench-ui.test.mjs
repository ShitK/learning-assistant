import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true, jsx: true });
const source = await readFile("src/components/mathtrace-workbench.tsx", "utf8");
const panelSource = await readFile("src/components/mistake-book-panel.tsx", "utf8");
const globalStyles = await readFile("src/app/globals.css", "utf8");
const {
  confirmMistakeBookItemDeletion,
  createMistakeBookPanelViewModel,
} = jiti("../src/components/mistake-book-panel.tsx");

assert.equal(
  source.includes("错误发生步骤"),
  false,
  "分析结果 UI 不应再展示“错误发生步骤”模块。",
);

assert.equal(
  source.includes("学生答案与偏离点"),
  false,
  "分析结果 UI 不应再展示“学生答案与偏离点”模块。",
);

assert.equal(
  source.includes("学生答案"),
  false,
  "识别结果确认 UI 不应再展示“学生答案”输入框。",
);

assert.equal(
  source.includes("学生解题步骤"),
  true,
  "识别结果确认 UI 应将“解题步骤”改为“学生解题步骤”。",
);

assert.equal(
  source.includes("解题步骤"),
  true,
  "识别结果确认 UI 仍应保留学生步骤输入能力。",
);

assert.equal(
  source.includes("diagnosis conclusion"),
  false,
  "分析结果 UI 不应再展示偏离点结论卡片。",
);

assert.match(
  source,
  /riskFollowUp \? null : \(/,
  "低证据追问模式下不应展示外层“确认生成报告”按钮。",
);

assert.equal(
  source.includes("请在右侧核对"),
  false,
  "追问模式提示不应要求用户去右侧核对。",
);

assert.match(
  source,
  /pendingFollowUpAnswer \? "确认写入画像" : "生成分析草稿"/,
  "追问卡片应使用同一个主按钮在“生成分析草稿”和“确认写入画像”之间切换。",
);

assert.equal(
  source.includes("@supabase/supabase-js"),
  false,
  "工作台客户端组件不能 import Supabase 浏览器客户端。",
);

assert.equal(
  source.includes("SUPABASE_SERVICE_ROLE_KEY"),
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
assert.equal(
  source.includes("await refreshMistakeBook();"),
  true,
  "图片确认写入成功后应重新读取错题本，避免页面停留在旧列表。",
);
assert.equal(
  source.includes("diagnosis.warnings"),
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
assert.equal(
  source.includes("@/lib/persistence-warnings"),
  true,
  "工作台应从 browser-safe 共享模块读取重复错题提示文案。",
);
assert.equal(
  /warnings\.includes\("本题已加入错题本。"\)/.test(source),
  false,
  "工作台不应硬编码重复错题提示文案，避免与服务端常量漂移。",
);

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
