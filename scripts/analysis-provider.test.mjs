import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  createAnalysisProvider,
  createAnalysisProviderConfigFromEnv,
  parseAnalysisProviderOutput,
} = jiti("../src/lib/analysis-provider.ts");

const missingConfig = createAnalysisProviderConfigFromEnv({});
assert.equal(missingConfig.ok, false);
assert.equal(missingConfig.error.code, "model_not_configured");

const configResult = createAnalysisProviderConfigFromEnv({
  ANALYSIS_PROVIDER_PROTOCOL: "openai",
  ANALYSIS_PROVIDER_BASE_URL: "https://api.deepseek.com",
  ANALYSIS_PROVIDER_MODEL: "deepseek-v4-flash",
  ANALYSIS_PROVIDER_API_KEY: "local-secret",
  ANALYSIS_PROVIDER_NAME: "deepseek_v4_flash",
  ANALYSIS_PROVIDER_TIMEOUT_MS: "60000",
});

assert.equal(configResult.ok, true);
assert.equal(configResult.value.protocol, "openai");
assert.equal(configResult.value.base_url, "https://api.deepseek.com");
assert.equal(configResult.value.model, "deepseek-v4-flash");
assert.equal(configResult.value.provider_name, "deepseek_v4_flash");
assert.equal(configResult.value.timeout_ms, 60000);

const unsupportedProtocol = createAnalysisProviderConfigFromEnv({
  ANALYSIS_PROVIDER_PROTOCOL: "anthropic",
  ANALYSIS_PROVIDER_BASE_URL: "https://api.deepseek.com/anthropic",
  ANALYSIS_PROVIDER_MODEL: "deepseek-v4-flash",
  ANALYSIS_PROVIDER_API_KEY: "local-secret",
});

assert.equal(unsupportedProtocol.ok, false);
assert.equal(unsupportedProtocol.error.code, "model_not_configured");

const invalidTimeoutConfig = createAnalysisProviderConfigFromEnv({
  ANALYSIS_PROVIDER_PROTOCOL: "openai",
  ANALYSIS_PROVIDER_BASE_URL: "https://api.deepseek.com",
  ANALYSIS_PROVIDER_MODEL: "deepseek-v4-flash",
  ANALYSIS_PROVIDER_API_KEY: "local-secret",
  ANALYSIS_PROVIDER_TIMEOUT_MS: "60000abc",
});

assert.equal(invalidTimeoutConfig.ok, true);
assert.equal(invalidTimeoutConfig.value.timeout_ms, 30000);

const parsed = parseAnalysisProviderOutput(
  JSON.stringify({
    expected_diagnosis: "主要错在参数分类讨论缺失。",
    step_analysis: ["求导正确", "临界点讨论不完整"],
    solution_highlights: ["先确定定义域", "再分类讨论参数"],
    standard_solution: "令 $f'(x)=0$ 后讨论 $a\\le 0$ 与 $a>0$。",
    warnings: ["由模型生成，需结合确认结果理解。"],
  }),
);

assert.equal(parsed.ok, true);
assert.equal(parsed.value.expected_diagnosis, "主要错在参数分类讨论缺失。");
assert.deepEqual(parsed.value.step_analysis, [
  "求导正确",
  "临界点讨论不完整",
]);
assert.equal(
  parsed.value.standard_solution,
  "令 $f'(x)=0$ 后讨论 $a\\le 0$ 与 $a>0$。",
);

const allowedStringMention = parseAnalysisProviderOutput(
  JSON.stringify({
    expected_diagnosis: "本次不涉及 memory_delta: 保持本地规则画像。",
    step_analysis: ["求导正确"],
    solution_highlights: ["先看导数符号"],
    standard_solution: "标准解法仍由确认文本增强。",
    warnings: [],
  }),
);

assert.equal(allowedStringMention.ok, true);
assert.equal(
  allowedStringMention.value.expected_diagnosis,
  "本次不涉及 memory_delta: 保持本地规则画像。",
);

const fencedJson = parseAnalysisProviderOutput(`
\`\`\`json
{
  "expected_diagnosis": "模型返回被包在 markdown 中。",
  "step_analysis": ["步骤一"],
  "solution_highlights": ["关键点"],
  "standard_solution": "标准解法",
  "warnings": []
}
\`\`\`
`);

assert.equal(fencedJson.ok, true);
assert.equal(fencedJson.value.expected_diagnosis, "模型返回被包在 markdown 中。");

const forbidden = parseAnalysisProviderOutput(
  JSON.stringify({
    expected_diagnosis: "越权",
    step_analysis: ["x"],
    solution_highlights: ["x"],
    standard_solution: "x",
    memory_delta: { should_persist: true },
  }),
);

assert.equal(forbidden.ok, false);
assert.equal(forbidden.error.code, "model_invalid_output");

const extraDecisionFields = parseAnalysisProviderOutput(
  JSON.stringify({
    expected_diagnosis: "试图夹带业务决策字段",
    step_analysis: ["x"],
    solution_highlights: ["x"],
    standard_solution: "x",
    knowledge_mapping: { knowledge_points: ["parameter_classification"] },
    mistake_causes: ["classification_missing"],
    severity: "severe",
  }),
);

assert.equal(extraDecisionFields.ok, false);
assert.equal(extraDecisionFields.error.code, "model_invalid_output");

const invalidShape = parseAnalysisProviderOutput(
  JSON.stringify({
    expected_diagnosis: "缺少标准解法",
    step_analysis: ["x"],
    solution_highlights: ["x"],
  }),
);

assert.equal(invalidShape.ok, false);
assert.equal(invalidShape.error.code, "model_invalid_output");

const requests = [];
const provider = createAnalysisProvider({
  protocol: "openai",
  base_url: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  api_key: "local-secret",
  provider_name: "deepseek_v4_flash",
  timeout_ms: 60000,
  fetch_fn: async (url, init) => {
    requests.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
    });

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                expected_diagnosis: "DeepSeek 增强错因。",
                step_analysis: ["DeepSeek 步骤"],
                solution_highlights: ["DeepSeek 高亮"],
                standard_solution: "DeepSeek 标准解法。",
                warnings: [],
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  },
});

const providerResult = await provider.analyzeConfirmedExtraction({
  question_text: "题干",
  student_answer: "学生答案",
  student_solution_steps: ["步骤"],
  standard_solution_draft: "标准解法草稿",
  extraction_confidence: "high",
  warnings: [],
});

assert.equal(providerResult.ok, true);
assert.equal(providerResult.value.expected_diagnosis, "DeepSeek 增强错因。");
assert.equal(requests.length, 1);
assert.equal(requests[0].url, "https://api.deepseek.com/chat/completions");
assert.equal(requests[0].headers.Authorization, "Bearer local-secret");
assert.equal(requests[0].body.model, "deepseek-v4-flash");
assert.deepEqual(requests[0].body.response_format, { type: "json_object" });
assert.equal(requests[0].body.stream, false);
assert.equal("thinking" in requests[0].body, false);
assert.equal(
  requests[0].body.messages[0].content.includes("json"),
  true,
);
assert.equal(
  requests[0].body.messages[0].content.includes("memory_delta"),
  true,
);
assert.equal(
  requests[0].body.messages[0].content.includes("\\frac{1}{a}"),
  true,
);
assert.equal(
  requests[0].body.messages[0].content.includes("\\ln a"),
  true,
);
assert.equal(
  requests[0].body.messages[0].content.includes("独立生成 standard_solution"),
  true,
);
assert.equal(
  requests[0].body.messages[1].content.includes("标准解法草稿："),
  false,
);
assert.equal(
  requests[0].body.messages[1].content.includes(
    "请根据确认后的题干、学生答案和学生步骤独立生成完整标准解法",
  ),
  true,
);

const endpointRequests = [];
const endpointProvider = createAnalysisProvider({
  protocol: "openai",
  base_url: "https://api.deepseek.com/chat/completions",
  model: "deepseek-v4-flash",
  api_key: "local-secret",
  provider_name: "deepseek_v4_flash",
  timeout_ms: 60000,
  fetch_fn: async (url) => {
    endpointRequests.push(url);

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                expected_diagnosis: "DeepSeek 增强错因。",
                step_analysis: ["DeepSeek 步骤"],
                solution_highlights: ["DeepSeek 高亮"],
                standard_solution: "DeepSeek 标准解法。",
                warnings: [],
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  },
});

await endpointProvider.analyzeConfirmedExtraction({
  question_text: "题干",
  student_answer: "学生答案",
  student_solution_steps: ["步骤"],
  standard_solution_draft: "标准解法草稿",
  extraction_confidence: "high",
  warnings: [],
});

assert.deepEqual(endpointRequests, [
  "https://api.deepseek.com/chat/completions",
]);
