import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/components/mathtrace-workbench.tsx", "utf8");

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

console.log("mathtrace workbench UI regression test passed");
