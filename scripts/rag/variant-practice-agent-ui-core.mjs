import { renderMathTextToHtml } from "./tag-review-ui-core.mjs";

const APP_VERSION = "variant-practice-agent-ui-v0";
const TYPE_LABELS = {
  foundation: "巩固题",
  near_transfer: "近迁移题",
  mixed_application: "综合应用题",
  additional_practice: "补充练习题",
};

export function validateVariantPracticeRecommendations(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["recommendations artifact must be an object"] };
  }
  if (value.agent_version !== "variant-practice-agent-v0") {
    errors.push("agent_version must be variant-practice-agent-v0");
  }
  if (!Array.isArray(value.recommendations)) {
    errors.push("recommendations must be an array");
  } else {
    value.recommendations.forEach((item, index) => validateRecommendation(item, index, errors));
  }
  if (value.warnings !== undefined && !isStringArray(value.warnings)) {
    errors.push("warnings must be an array of strings when present");
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, result: value };
}

export function buildVariantPracticeAppData({ recommendations, sourceFile, generatedAt }) {
  const items = recommendations.recommendations.map((item) => {
    const rendered = renderMathTextToHtml(item.question_text);
    return {
      ...item,
      recommendation_type_label: TYPE_LABELS[item.recommendation_type] ?? item.recommendation_type,
      rendered_html: rendered.html,
      render_warnings: rendered.warnings,
      matched_dimensions: normalizeStringArray(item.matched_dimensions),
      source_ref: item.source_ref ?? null,
    };
  });
  const warnings = normalizeStringArray(recommendations.warnings);
  return {
    app_version: APP_VERSION,
    source_file: sourceFile,
    generated_at: generatedAt,
    agent_version: recommendations.agent_version,
    query_id: recommendations.query_id ?? null,
    practice_goal: recommendations.practice_goal ?? null,
    agent_steps: Array.isArray(recommendations.agent_steps) ? recommendations.agent_steps : [],
    rationale: typeof recommendations.rationale === "string" ? recommendations.rationale : "",
    search_summary: recommendations.search_summary ?? null,
    recommendations: items,
    warnings,
    has_demo_fill: warnings.includes("demo_fill_used"),
    type_counts: countTypes(items),
  };
}

export function buildVariantPracticeManifest(appData) {
  return {
    app_version: appData.app_version,
    source_file: appData.source_file,
    generated_at: appData.generated_at,
    query_id: appData.query_id,
    recommendation_count: appData.recommendations.length,
    warnings: appData.warnings,
    has_demo_fill: appData.has_demo_fill,
  };
}

export function renderVariantPracticeHtml(appData, { katexCss, katexJs }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MathTrace Variant Practice</title>
  <style>${katexCss}</style>
  <style>${renderStyles()}</style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">MathTrace RAG Demo</p>
      <h1>MathTrace Variant Practice</h1>
      <div class="summary">
        <span>${appData.recommendations.length} 道推荐题</span>
        <span>${escapeHtml(String(appData.search_summary?.candidate_count ?? "-"))} 道候选题</span>
        <span>${escapeHtml(String(appData.search_summary?.corpus_version ?? "-"))}</span>
      </div>
    </header>

    <section class="goal">
      <h2>练习目标</h2>
      <p>${escapeHtml(appData.practice_goal?.summary ?? "暂无练习目标摘要。")}</p>
      <h2>Agent 判断</h2>
      <p>${escapeHtml(appData.rationale || "暂无整体推荐解释。")}</p>
    </section>

    ${appData.has_demo_fill ? renderDemoFillNotice() : ""}

    <section class="cards">
      ${appData.recommendations.map(renderCard).join("")}
    </section>

    <section class="trace">
      <h2>Agent Trace</h2>
      <ol>${appData.agent_steps.map(renderTraceStep).join("")}</ol>
    </section>

    <section class="warnings">
      <h2>Warnings</h2>
      ${appData.warnings.length > 0
        ? appData.warnings.map((warning) => `<code>${escapeHtml(warning)}</code>`).join("")
        : "<p>无 warning。</p>"}
    </section>
  </main>
  <script id="katex-runtime">${escapeInlineScript(katexJs)}</script>
  <script id="variant-practice-data">window.__VARIANT_PRACTICE_DATA__ = ${escapeScriptJson(appData)};</script>
</body>
</html>
`;
}

function renderCard(item) {
  return `<article class="card ${escapeAttribute(item.recommendation_type)}">
    <div class="card-head">
      <span>#${escapeHtml(String(item.rank))}</span>
      <h2>${escapeHtml(item.recommendation_type_label)}</h2>
      <small>score ${escapeHtml(String(item.score))}</small>
    </div>
    <div class="question">${item.rendered_html}</div>
    <p>${escapeHtml(item.reason)}</p>
    <div class="chips">${item.matched_dimensions.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    <footer>${escapeHtml(item.item_id)} · ${escapeHtml(formatSourceRef(item.source_ref))}</footer>
  </article>`;
}

function renderTraceStep(step) {
  return `<li><strong>${escapeHtml(step?.id ?? "step")}</strong><span>${escapeHtml(step?.summary ?? "")}</span></li>`;
}

function renderDemoFillNotice() {
  return `<section class="notice"><strong>已启用演示补位</strong><span>当前题库暂缺稳定综合应用题，第三题使用同标签相近题补充展示，系统保留 demo_fill_used 提示。</span></section>`;
}

function renderStyles() {
  return `
    :root { --ink:#18212b; --muted:#667085; --paper:#faf8f3; --panel:#fffdf8; --line:#ded6c8; --blue:#24516f; --green:#55745c; --gold:#ad7f32; --red:#9d4a3f; }
    * { box-sizing: border-box; }
    body { margin:0; color:var(--ink); background:var(--paper); font-family:Avenir Next, Helvetica Neue, Helvetica, sans-serif; line-height:1.55; }
    main { width:min(1180px, calc(100vw - 32px)); margin:0 auto; padding:28px 0 48px; }
    header { border-bottom:2px solid var(--line); padding-bottom:18px; }
    .eyebrow { margin:0 0 6px; color:var(--gold); font-size:13px; font-weight:700; text-transform:uppercase; }
    h1 { margin:0; font-family:Georgia, Times New Roman, serif; font-size:clamp(34px, 5vw, 64px); line-height:1; letter-spacing:0; }
    h2 { margin:0 0 10px; font-size:18px; letter-spacing:0; }
    .summary, .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
    .summary span, .chips span, code { border:1px solid var(--line); border-radius:999px; background:#eef3ec; padding:4px 10px; font-size:13px; }
    .goal, .trace, .warnings, .notice, .card { border:1px solid var(--line); background:var(--panel); }
    .goal, .trace, .warnings, .notice { margin-top:18px; padding:18px; }
    .notice { display:flex; gap:12px; background:#fff5dc; border-color:#d9b36d; }
    .cards { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:16px; margin-top:18px; }
    .card { display:flex; flex-direction:column; min-height:410px; padding:18px; border-top:5px solid var(--blue); }
    .card.near_transfer { border-top-color:var(--green); }
    .card.mixed_application { border-top-color:var(--red); }
    .card.additional_practice { border-top-color:var(--gold); }
    .card-head { display:flex; justify-content:space-between; gap:10px; align-items:start; margin-bottom:12px; }
    .card-head span, .card-head small, footer { color:var(--muted); font-size:12px; font-weight:700; }
    .question { flex:1; padding:14px; border:1px solid var(--line); background:#fffefa; font-size:18px; overflow-wrap:anywhere; }
    footer { margin-top:14px; padding-top:12px; border-top:1px solid var(--line); overflow-wrap:anywhere; }
    .trace ol { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; margin:0; padding:0; list-style:none; }
    .trace li { padding:12px; border-left:3px solid var(--blue); background:#fffefa; }
    .trace strong { display:block; }
    @media (max-width: 900px) { .cards, .trace ol { grid-template-columns:1fr; } .card { min-height:auto; } .notice { display:block; } }
  `;
}

function validateRecommendation(item, index, errors) {
  const path = `recommendations[${index}]`;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errors.push(`${path} must be an object`);
    return;
  }
  requireNumber(item.rank, `${path}.rank`, errors);
  requireString(item.recommendation_type, `${path}.recommendation_type`, errors);
  requireString(item.item_id, `${path}.item_id`, errors);
  requireString(item.question_text, `${path}.question_text`, errors);
  requireString(item.reason, `${path}.reason`, errors);
  requireNumber(item.score, `${path}.score`, errors);
  if (!isStringArray(item.matched_dimensions)) {
    errors.push(`${path}.matched_dimensions must be an array of strings`);
  }
}

function countTypes(items) {
  return items.reduce((counts, item) => {
    counts[item.recommendation_type] = (counts[item.recommendation_type] ?? 0) + 1;
    return counts;
  }, {});
}

function formatSourceRef(sourceRef) {
  if (!sourceRef || typeof sourceRef !== "object") return "source unknown";
  const page = Number.isInteger(sourceRef.pdf_page_index) ? `PDF page ${sourceRef.pdf_page_index}` : null;
  const section = typeof sourceRef.section_title === "string" ? sourceRef.section_title : null;
  return [page, section].filter(Boolean).join(" · ") || "source unknown";
}

function requireString(value, path, errors) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${path} must be a non-empty string`);
}

function requireNumber(value, path, errors) {
  if (typeof value !== "number" || Number.isNaN(value)) errors.push(`${path} must be a number`);
}

function normalizeStringArray(value) {
  return isStringArray(value)
    ? [...new Set(value.filter((item) => item.trim()).map((item) => item.trim()))]
    : [];
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll(" ", "-");
}

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeInlineScript(value) {
  return String(value ?? "").replaceAll("</script", "<\\/script");
}
