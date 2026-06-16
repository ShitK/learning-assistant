import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();

const { parseMathText } = jiti("./src/lib/math/math-text-parser.ts");

assert.deepEqual(parseMathText("解得$0<a<1$；"), [
  { kind: "text", value: "解得" },
  { kind: "math", value: "0<a<1", displayMode: false },
  { kind: "text", value: "；" },
]);

assert.deepEqual(parseMathText("价格为 $5。"), [
  { kind: "text", value: "价格为 $5。" },
]);

console.log("math text parser test passed");
