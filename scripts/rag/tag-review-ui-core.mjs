import katex from "katex";

const APP_VERSION = "tag-review-ui-v1";
const STORAGE_KEY_PREFIX = "mathtrace.tagReview";
const STORAGE_NOTICE = "导出前请勿重新生成 queue；重新生成后本页本地草稿可能不会自动恢复。";
const MATH_PATTERN = /(?<!\\)(\$\$?)([\s\S]+?)(?<!\\)\1/g;
const TAG_GROUPS = ["target_skills", "method_tags", "feature_flags"];

export function renderMathTextToHtml(text) {
  const warnings = [];
  const source = String(text ?? "");
  let cursor = 0;
  let html = "";

  for (const match of source.matchAll(MATH_PATTERN)) {
    html += renderPlainTextSegment(source.slice(cursor, match.index));
    const delimiter = match[1];
    const math = match[2];
    try {
      html += katex.renderToString(math, {
        displayMode: delimiter === "$$",
        throwOnError: true,
        strict: "ignore",
      });
    } catch {
      warnings.push("math_render_failed");
      html += escapeHtml(`${delimiter}${math}${delimiter}`);
    }
    cursor = match.index + match[0].length;
  }

  html += renderPlainTextSegment(source.slice(cursor));
  return {
    html,
    warnings: [...new Set(warnings)],
  };
}

export function validateTagReviewQueue(value, taxonomy) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["tag review queue must be an object or array"] };
  }
  const reviewQueue = Array.isArray(value) ? value : value.review_queue;
  if (!Array.isArray(reviewQueue)) {
    errors.push("review_queue must be an array");
  }
  if (
    !Array.isArray(value) &&
    "taxonomy_id" in value &&
    value.taxonomy_id !== null &&
    value.taxonomy_id !== taxonomy?.taxonomy_id
  ) {
    errors.push("taxonomy_id must match taxonomy.taxonomy_id");
  }

  for (const [index, item] of (reviewQueue ?? []).entries()) {
    const path = `review_queue[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    if (typeof item.item_id !== "string" || !item.item_id.trim()) {
      errors.push(`${path}.item_id must be a non-empty string`);
    }
    if (typeof item.question_text !== "string") {
      errors.push(`${path}.question_text must be a string`);
    }
    if (!Array.isArray(item.gate_reasons)) {
      errors.push(`${path}.gate_reasons must be an array`);
    }
    for (const group of TAG_GROUPS) {
      if (item.rule_tags && !Array.isArray(item.rule_tags[group])) {
        errors.push(`${path}.rule_tags.${group} must be an array`);
      }
      if (item.ai_tags && !Array.isArray(item.ai_tags[group])) {
        errors.push(`${path}.ai_tags.${group} must be an array`);
      }
      if (!Array.isArray(item.proposed_final_tags?.[group])) {
        errors.push(`${path}.proposed_final_tags.${group} must be an array`);
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, queue: value };
}

export function buildTagReviewAppData({
  queue,
  taxonomy,
  queueSourceFile,
  queueSourceSha256,
  generatedAt,
}) {
  const items = getReviewQueueItems(queue).map((item) => {
    const rendered = renderMathTextToHtml(item.question_text);
    return {
      item_id: item.item_id,
      source_candidate_id: item.source_candidate_id ?? null,
      question_text: item.question_text,
      rendered_html: rendered.html,
      render_warnings: rendered.warnings,
      section_title: item.section_title ?? null,
      source_ref: item.source_ref ?? null,
      gate_status: item.gate_status ?? "needs_review",
      review_status: item.review_status ?? "needs_review",
      recommended_review_status: item.recommended_review_status ?? null,
      taxonomy_id: item.taxonomy_id ?? taxonomy?.taxonomy_id ?? null,
      gate_reasons: normalizeStringArray(item.gate_reasons),
      rule_tags: normalizeTagGroups(item.rule_tags),
      ai_tags: normalizeTagGroups(item.ai_tags),
      proposed_final_tags: normalizeTagGroups(item.proposed_final_tags),
      ai_confidence: item.ai_confidence ?? null,
      review_origin: item.review_origin ?? null,
    };
  });

  return {
    app_version: APP_VERSION,
    queue_source_file: queueSourceFile,
    queue_source_sha256: queueSourceSha256,
    generated_at: generatedAt,
    storage_key: `${STORAGE_KEY_PREFIX}.${queueSourceSha256.slice(0, 12)}`,
    storage_notice: STORAGE_NOTICE,
    taxonomy: normalizeTaxonomy(taxonomy),
    item_count: items.length,
    source_queue: {
      proposal_version: queue?.proposal_version ?? null,
      generated_at: queue?.generated_at ?? null,
      taxonomy_id: queue?.taxonomy_id ?? null,
    },
    items,
  };
}

function getReviewQueueItems(queue) {
  if (Array.isArray(queue)) {
    return queue;
  }
  return Array.isArray(queue?.review_queue) ? queue.review_queue : [];
}

export function buildTagReviewManifest(appData) {
  return {
    app_version: appData.app_version,
    queue_source_file: appData.queue_source_file,
    queue_source_sha256: appData.queue_source_sha256,
    generated_at: appData.generated_at,
    taxonomy_id: appData.taxonomy?.taxonomy_id ?? null,
    item_count: appData.items.length,
  };
}

export function buildCompatibleReviewRecords({ appData, reviewState }) {
  return appData.items
    .filter((item) => reviewState?.[item.item_id])
    .map((item) => buildCompatibleReviewRecord(item, reviewState[item.item_id], appData.taxonomy));
}

export function renderTagReviewHtml(appData, { katexCss, katexJs }) {
  const dataJson = escapeScriptJson(appData);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MathTrace Tag Review</title>
  <style>${katexCss}</style>
  <style>${renderStyles()}</style>
</head>
<body>
  <main id="app">
    <header class="topbar">
      <div class="topbar-primary">
        <h1>MathTrace Tag Review</h1>
        <div class="topbar-actions">
          <button id="copy-json" type="button">复制 JSON</button>
          <button id="download-json" type="button">下载 tag_review_records.json</button>
        </div>
      </div>
      <p class="notice">${escapeHtml(appData.storage_notice)}</p>
      <div id="summary"></div>
      <div class="filters">
        <input id="search" type="search" placeholder="搜索题干、item id、gate reason">
        <select id="filter">
          <option value="all">全部</option>
          <option value="unreviewed">未审核</option>
          <option value="approved">Approved</option>
          <option value="needs_fix">Needs Fix</option>
          <option value="skipped">Skipped</option>
        </select>
      </div>
    </header>
    <textarea id="copy-json-fallback" hidden readonly></textarea>
    <section class="layout">
      <aside id="item-list"></aside>
      <section id="item-detail"></section>
    </section>
  </main>
  <script id="katex-runtime">${escapeInlineScript(katexJs)}</script>
  <script id="tag-review-data">window.__TAG_REVIEW_DATA__ = ${dataJson};</script>
  <script id="tag-review-app">${renderBrowserScript()}</script>
</body>
</html>
`;
}

function buildCompatibleReviewRecord(item, stateItem, taxonomy) {
  return {
    item_id: item.item_id,
    review_status: stateItem.status ?? item.review_status ?? "needs_review",
    reviewed_tags: {
      target_skills: normalizeStateTags(stateItem.target_skills, item.proposed_final_tags.target_skills),
      method_tags: normalizeStateTags(stateItem.method_tags, item.proposed_final_tags.method_tags),
      feature_flags: normalizeStateTags(stateItem.feature_flags, item.proposed_final_tags.feature_flags),
    },
    review_notes: typeof stateItem.note === "string" ? stateItem.note : "",
    has_manual_tag_correction: true,
    tag_source: "human",
    taxonomy_id: taxonomy?.taxonomy_id ?? item.taxonomy_id ?? null,
    review_origin: "human_review",
    ai_confidence: item.ai_confidence ?? null,
    rule_ai_agreement: item.gate_reasons.join(", "),
  };
}

function normalizeStateTags(value, fallback) {
  return normalizeStringArray(Array.isArray(value) ? value : fallback);
}

function normalizeTaxonomy(taxonomy) {
  return {
    taxonomy_id: taxonomy?.taxonomy_id ?? null,
    subject: taxonomy?.subject ?? null,
    unit: taxonomy?.unit ?? null,
    display_name: taxonomy?.display_name ?? null,
    target_skills: normalizeTagDefinitions(taxonomy?.target_skills),
    method_tags: normalizeTagDefinitions(taxonomy?.method_tags),
    feature_flags: normalizeTagDefinitions(taxonomy?.feature_flags),
  };
}

function normalizeTagDefinitions(tags) {
  return (Array.isArray(tags) ? tags : [])
    .filter((tag) => typeof tag?.key === "string" && typeof tag?.display_name === "string")
    .map((tag) => ({ key: tag.key, display_name: tag.display_name }));
}

function normalizeTagGroups(value) {
  return {
    target_skills: normalizeStringArray(value?.target_skills),
    method_tags: normalizeStringArray(value?.method_tags),
    feature_flags: normalizeStringArray(value?.feature_flags),
  };
}

function normalizeStringArray(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPlainTextSegment(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replaceAll("https://", "\\x68ttps://")
    .replaceAll("http://", "\\x68ttp://")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeInlineScript(value) {
  return String(value ?? "").replace(/<\/script/gi, "<\\/script");
}

function renderStyles() {
  return `
    html, body { height: 100%; }
    body { margin: 0; overflow: hidden; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f5ef; color: #1f2933; }
    button, input, select, textarea { font: inherit; }
    button { border: 1px solid #b9c2b3; border-radius: 6px; padding: 7px 10px; background: #fffdf8; color: #1f2933; cursor: pointer; }
    button:hover { background: #eef3e8; }
    #app { height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .topbar { display: grid; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #d9d6c9; background: #fffdf8; }
    .topbar-primary { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .topbar h1 { margin: 0; font-size: 24px; line-height: 1.1; }
    .topbar-actions, .filters, .status-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .notice { margin: 0; color: #6f4f14; font-size: 13px; }
    .filters input { min-width: 260px; flex: 1; }
    .layout { min-height: 0; display: grid; grid-template-columns: minmax(280px, 34vw) minmax(0, 1fr); }
    #item-list { min-height: 0; overflow-y: auto; border-right: 1px solid #d9d6c9; }
    .item-row { width: 100%; display: grid; gap: 4px; border: 0; border-bottom: 1px solid #e3dfd1; border-radius: 0; padding: 12px; text-align: left; background: transparent; }
    .item-row[aria-selected="true"] { background: #e9f0e3; box-shadow: inset 4px 0 0 #527357; }
    .item-row.status-approved { box-shadow: inset 4px 0 0 #527357; }
    .item-row.status-needs_fix { box-shadow: inset 4px 0 0 #b45309; }
    .item-row.status-skipped { box-shadow: inset 4px 0 0 #687383; }
    #item-detail { min-height: 0; overflow-y: auto; padding: 20px; }
    .question-body { line-height: 1.85; font-size: 17px; background: #fffdf8; border: 1px solid #e3dfd1; padding: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .panel { border: 1px solid #e3dfd1; background: #fffdf8; padding: 12px; }
    .tag-group { margin: 18px 0; }
    .tag-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .tag-option { display: flex; gap: 8px; align-items: flex-start; padding: 8px; border: 1px solid #e3dfd1; background: #fffdf8; }
    .tag-key, .muted { color: #667085; font-size: 12px; }
    .tag-pill { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 7px; border-radius: 999px; background: #e8eee2; font-size: 12px; }
    textarea { width: 100%; min-height: 86px; box-sizing: border-box; }
    pre { white-space: pre-wrap; word-break: break-word; }
    @media (max-width: 760px) {
      body { overflow: auto; }
      #app { min-height: 100vh; height: auto; }
      .layout { grid-template-columns: 1fr; }
      #item-list { max-height: 34vh; border-right: 0; border-bottom: 1px solid #d9d6c9; }
      .grid { grid-template-columns: 1fr; }
    }
  `;
}

function renderBrowserScript() {
  return `
    const appData = window.__TAG_REVIEW_DATA__;
    const katexRuntimeReady = Boolean(window.katex);
    const state = loadState();
    let selectedId = appData.items[0]?.item_id ?? null;
    let query = "";
    let filter = "all";

    function loadState() {
      try { return JSON.parse(localStorage.getItem(appData.storage_key) || "{}"); }
      catch { return {}; }
    }
    function saveState() {
      localStorage.setItem(appData.storage_key, JSON.stringify(state));
    }
    function ensureState(id) {
      const item = appData.items.find((candidate) => candidate.item_id === id);
      if (!state[id]) {
        state[id] = {
          status: item?.recommended_review_status || "needs_fix",
          target_skills: [...(item?.proposed_final_tags.target_skills || [])],
          method_tags: [...(item?.proposed_final_tags.method_tags || [])],
          feature_flags: [...(item?.proposed_final_tags.feature_flags || [])],
          note: "",
        };
      }
      return state[id];
    }
    function setStatus(id, status) {
      const itemState = ensureState(id);
      itemState.status = status;
      itemState.updated_at = new Date().toISOString();
      saveState();
      render();
    }
    function setNote(id, note) {
      const itemState = ensureState(id);
      itemState.note = note;
      itemState.updated_at = new Date().toISOString();
      saveState();
    }
    function setTag(id, group, tag, checked) {
      const itemState = ensureState(id);
      const next = new Set(itemState[group] || []);
      if (checked) next.add(tag);
      else next.delete(tag);
      itemState[group] = Array.from(next);
      itemState.updated_at = new Date().toISOString();
      saveState();
      render();
    }
    function getStatus(item) {
      return state[item.item_id]?.status || "unreviewed";
    }
    function filteredItems() {
      return appData.items.filter((item) => {
        const status = getStatus(item);
        const haystack = [
          item.item_id,
          item.source_candidate_id,
          item.section_title,
          item.question_text,
          item.gate_reasons.join(" "),
        ].join(" ").toLowerCase();
        if (query && !haystack.includes(query.toLowerCase())) return false;
        if (filter === "all") return true;
        return status === filter;
      });
    }
    function buildCompatibleReviewRecords() {
      return appData.items
        .filter((item) => state[item.item_id])
        .map((item) => {
          const itemState = state[item.item_id] || {};
          return {
            item_id: item.item_id,
            review_status: itemState.status || item.review_status || "needs_review",
            reviewed_tags: {
              target_skills: Array.isArray(itemState.target_skills) ? itemState.target_skills : item.proposed_final_tags.target_skills,
              method_tags: Array.isArray(itemState.method_tags) ? itemState.method_tags : item.proposed_final_tags.method_tags,
              feature_flags: Array.isArray(itemState.feature_flags) ? itemState.feature_flags : item.proposed_final_tags.feature_flags,
            },
            review_notes: typeof itemState.note === "string" ? itemState.note : "",
            has_manual_tag_correction: true,
            tag_source: "human",
            taxonomy_id: appData.taxonomy.taxonomy_id,
            review_origin: "human_review",
            ai_confidence: item.ai_confidence,
            rule_ai_agreement: item.gate_reasons.join(", "),
          };
        });
    }
    function render() {
      const list = filteredItems();
      const reviewedCount = appData.items.filter((item) => state[item.item_id]).length;
      document.querySelector("#summary").textContent = "待审核 " + appData.items.length + " 条，已编辑 " + reviewedCount + " 条，当前筛选 " + list.length + " 条";
      document.querySelector("#item-list").innerHTML = list.map((item) => {
        const status = getStatus(item);
        return '<button class="item-row status-' + escapeAttribute(status) + '" aria-selected="' + (item.item_id === selectedId) + '" data-id="' + escapeAttribute(item.item_id) + '">' +
          '<strong>' + escapeHtml(item.item_id) + '</strong>' +
          '<span class="muted">' + escapeHtml(status) + ' · ' + escapeHtml(item.ai_confidence || "unknown") + '</span>' +
          '<span>' + escapeHtml(item.gate_reasons.join(", ") || "no gate reason") + '</span>' +
          '</button>';
      }).join("");
      const selected = appData.items.find((item) => item.item_id === selectedId) || list[0];
      if (!selected) {
        document.querySelector("#item-detail").innerHTML = "<p>没有待审核标签。</p>";
        return;
      }
      selectedId = selected.item_id;
      const itemState = state[selected.item_id] || {};
      document.querySelector("#item-detail").innerHTML =
        '<h2>' + escapeHtml(selected.item_id) + '</h2>' +
        '<p class="muted">' + escapeHtml(selected.section_title || "未分组") + '</p>' +
        '<div class="question-body">' + selected.rendered_html + '</div>' +
        '<div class="grid">' +
          renderTagSummary("Rule tags", selected.rule_tags) +
          renderTagSummary("AI tags", selected.ai_tags) +
        '</div>' +
        '<h3>Gate reasons</h3><pre>' + escapeHtml(JSON.stringify(selected.gate_reasons, null, 2)) + '</pre>' +
        '<h3>Review tags</h3>' +
        renderTagControls(selected, itemState) +
        '<h3>Status</h3>' +
        '<div class="status-actions">' +
          '<button data-status="approved" type="button">Approved</button>' +
          '<button data-status="needs_fix" type="button">Needs Fix</button>' +
          '<button data-status="skipped" type="button">Skipped</button>' +
        '</div>' +
        '<h3>备注</h3><textarea id="note">' + escapeHtml(itemState.note || "") + '</textarea>';
    }
    function renderTagSummary(title, groups) {
      return '<section class="panel"><h3>' + escapeHtml(title) + '</h3>' +
        ["target_skills", "method_tags", "feature_flags"].map((group) =>
          '<p><strong>' + escapeHtml(group) + '</strong><br>' +
          (groups[group] || []).map((tag) => '<span class="tag-pill">' + escapeHtml(tag) + '</span>').join("") +
          '</p>'
        ).join("") +
        '</section>';
    }
    function renderTagControls(item, itemState) {
      return [
        renderTagGroup("target_skills", "Target skills", appData.taxonomy.target_skills, item, itemState),
        renderTagGroup("method_tags", "Method tags", appData.taxonomy.method_tags, item, itemState),
        renderTagGroup("feature_flags", "Feature flags", appData.taxonomy.feature_flags, item, itemState),
      ].join("");
    }
    function renderTagGroup(group, title, definitions, item, itemState) {
      const selectedTags = new Set(Array.isArray(itemState[group]) ? itemState[group] : item.proposed_final_tags[group]);
      return '<section class="tag-group"><h4>' + escapeHtml(title) + '</h4><div class="tag-list">' +
        definitions.map((tag) => {
          const checked = selectedTags.has(tag.key) ? " checked" : "";
          return '<label class="tag-option">' +
            '<input type="checkbox" data-tag-group="' + escapeAttribute(group) + '" data-tag-key="' + escapeAttribute(tag.key) + '"' + checked + '>' +
            '<span><strong>' + escapeHtml(tag.display_name) + '</strong><br><span class="tag-key">' + escapeHtml(tag.key) + '</span></span>' +
            '</label>';
        }).join("") +
        '</div></section>';
    }
    function escapeHtml(value) {
      return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
    }
    function escapeAttribute(value) {
      return escapeHtml(value);
    }
    document.addEventListener("click", (event) => {
      const row = event.target.closest("[data-id]");
      if (row) { selectedId = row.dataset.id; render(); return; }
      const action = event.target.closest("[data-status]");
      if (action && selectedId) setStatus(selectedId, action.dataset.status);
    });
    document.addEventListener("input", (event) => {
      if (event.target.id === "search") { query = event.target.value; render(); }
      if (event.target.id === "filter") { filter = event.target.value; render(); }
      if (event.target.id === "note" && selectedId) setNote(selectedId, event.target.value);
    });
    document.addEventListener("change", (event) => {
      if (event.target.matches("[data-tag-group]") && selectedId) {
        setTag(selectedId, event.target.dataset.tagGroup, event.target.dataset.tagKey, event.target.checked);
      }
    });
    document.querySelector("#copy-json").addEventListener("click", async () => {
      const text = JSON.stringify(buildCompatibleReviewRecords(), null, 2);
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return;
        } catch {}
      }
      const fallback = document.querySelector("#copy-json-fallback");
      fallback.hidden = false;
      fallback.value = text;
      fallback.focus();
      fallback.select();
      document.execCommand("copy");
    });
    document.querySelector("#download-json").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(buildCompatibleReviewRecords(), null, 2) + "\\n"], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "tag_review_records.json";
      link.click();
      URL.revokeObjectURL(link.href);
    });
    window.__tagReviewTestHooks__ = { buildCompatibleReviewRecords };
    render();
  `;
}
