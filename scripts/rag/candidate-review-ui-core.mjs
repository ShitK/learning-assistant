import katex from "katex";

const APP_VERSION = "candidate-review-ui-v1";
const STORAGE_KEY_PREFIX = "mathtrace.candidateReview";
const MATH_PATTERN = /(?<!\\)(\$\$?)([\s\S]+?)(?<!\\)\1/g;

export function validateCandidateExtraction(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["root must be an object"] };
  }
  requireString(value, "source_file", errors);
  requireString(value, "mineru_json_file", errors);
  requireNumber(value, "page_count", errors);
  if ("warnings" in value && !Array.isArray(value.warnings)) {
    errors.push("warnings must be an array");
  }
  if (!Array.isArray(value.candidates)) {
    errors.push("candidates must be an array");
  }
  if (Array.isArray(value.candidates)) {
    value.candidates.forEach((candidate, index) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        errors.push(`candidate[${index}] must be an object`);
        return;
      }
      const path = `candidate[${index}]`;
      requireString(candidate, "id", errors, path);
      requireString(candidate, "normalized_text", errors, path);
      if (!("source_ref" in candidate)) {
        errors.push(`${path} missing source_ref`);
      } else {
        validateSourceRef(candidate.source_ref, errors, `${path}.source_ref`);
      }
      if (!Array.isArray(candidate.warnings)) {
        errors.push(`${path}.warnings must be an array`);
      }
    });
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, extraction: value };
}

export function renderMathTextToHtml(text) {
  const warnings = [];
  const source = String(text ?? "");
  let cursor = 0;
  let html = "";

  for (const match of source.matchAll(MATH_PATTERN)) {
    html += escapeHtml(source.slice(cursor, match.index));
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

  html += escapeHtml(source.slice(cursor));
  return {
    html: html.replace(/\n/g, "<br>"),
    warnings: [...new Set(warnings)],
  };
}

export function buildReviewAppData({
  extraction,
  candidateSourceFile,
  candidateSourceSha256,
  generatedAt,
}) {
  const candidates = extraction.candidates.map((candidate) => {
    const rendered = renderMathTextToHtml(candidate.normalized_text);
    const sectionTitle = candidate.source_ref?.section_title ?? null;
    return {
      id: candidate.id,
      question_number: candidate.question_number,
      section_title: sectionTitle,
      normalized_text: candidate.normalized_text,
      rendered_html: rendered.html,
      extraction_confidence: candidate.extraction_confidence,
      warnings: [...new Set([...(candidate.warnings ?? []), ...rendered.warnings])],
      source_ref: candidate.source_ref,
    };
  });

  return {
    app_version: APP_VERSION,
    candidate_source_file: candidateSourceFile,
    candidate_source_sha256: candidateSourceSha256,
    generated_at: generatedAt,
    storage_key: `${STORAGE_KEY_PREFIX}.${candidateSourceSha256.slice(0, 12)}`,
    extraction: {
      source_file: extraction.source_file,
      mineru_json_file: extraction.mineru_json_file,
      page_count: extraction.page_count,
      warnings: extraction.warnings ?? [],
    },
    candidates,
  };
}

export function buildReviewManifest(appData) {
  return {
    app_version: appData.app_version,
    candidate_source_file: appData.candidate_source_file,
    candidate_source_sha256: appData.candidate_source_sha256,
    generated_at: appData.generated_at,
    candidate_count: appData.candidates.length,
    extraction_warnings: appData.extraction.warnings,
  };
}

export function buildReviewedPracticeSeed({ appData, reviewState, exportedAt }) {
  const approvedItems = appData.candidates
    .filter((candidate) => reviewState[candidate.id]?.status === "approved")
    .map((candidate) => ({
      id: candidate.id,
      candidate_id: candidate.id,
      review_status: "reviewed",
      reviewer_note: reviewState[candidate.id]?.note ?? "",
      question_text: candidate.normalized_text,
      solution_outline: null,
      mistake_causes: [],
      knowledge_points: inferKnowledgePoints(candidate),
      difficulty: null,
      variant_level: null,
      source_ref: candidate.source_ref,
      original_extraction_confidence: candidate.extraction_confidence,
      original_warnings: candidate.warnings,
    }));

  return {
    exported_at: exportedAt,
    source_candidate_file: appData.candidate_source_file,
    source_file: appData.extraction.source_file,
    mineru_json_file: appData.extraction.mineru_json_file,
    approved_count: approvedItems.length,
    items: approvedItems,
  };
}

export function renderCandidateReviewHtml(appData, { katexCss }) {
  const dataJson = escapeScriptJson(appData);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MathTrace Candidate Review</title>
  <style>${katexCss}</style>
  <style>${renderStyles()}</style>
</head>
<body>
  <main id="app">
    <header class="topbar">
      <h1>MathTrace Candidate Review</h1>
      <div id="summary"></div>
      <input id="search" type="search" placeholder="搜索题号、章节、题干">
      <select id="filter">
        <option value="all">全部</option>
        <option value="unreviewed">未审核</option>
        <option value="approved">Approved</option>
        <option value="needs_fix">Needs Fix</option>
        <option value="skipped">Skipped</option>
        <option value="warnings">有 warnings</option>
      </select>
      <button id="copy-json">复制 JSON</button>
      <button id="download-json">下载 reviewed_practice_seed.json</button>
    </header>
    <textarea id="copy-json-fallback" hidden readonly></textarea>
    <section class="layout">
      <aside id="candidate-list"></aside>
      <section id="candidate-detail"></section>
    </section>
  </main>
  <script>window.__CANDIDATE_REVIEW_DATA__ = ${dataJson};</script>
  <script>${renderBrowserScript()}</script>
</body>
</html>
`;
}

function inferKnowledgePoints(candidate) {
  const points = ["导数"];
  if (candidate.section_title) {
    points.push(candidate.section_title);
  }
  return [...new Set(points)];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function requireString(value, key, errors, path = "root") {
  if (!(key in value)) {
    errors.push(path === "root" ? `missing ${key}` : `${path} missing ${key}`);
    return;
  }
  if (typeof value[key] !== "string") {
    errors.push(
      path === "root"
        ? `${key} must be a string`
        : `${path}.${key} must be a string`,
    );
  }
}

function requireNumber(value, key, errors) {
  if (!(key in value)) {
    errors.push(`missing ${key}`);
    return;
  }
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
    errors.push(`${key} must be a number`);
  }
}

function validateSourceRef(sourceRef, errors, path) {
  if (sourceRef === null) {
    return;
  }
  if (!sourceRef || typeof sourceRef !== "object" || Array.isArray(sourceRef)) {
    errors.push(`${path} must be an object or null`);
    return;
  }
  if (
    "section_title" in sourceRef &&
    sourceRef.section_title !== null &&
    typeof sourceRef.section_title !== "string"
  ) {
    errors.push(`${path}.section_title must be a string or null`);
  }
}

function renderStyles() {
  return `
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8f7f4; color: #1f2933; }
    .topbar { display: grid; gap: 10px; padding: 16px; border-bottom: 1px solid #ded8cc; background: #fffdf8; }
    .layout { display: grid; grid-template-columns: minmax(260px, 34vw) 1fr; min-height: calc(100vh - 170px); }
    #candidate-list { border-right: 1px solid #ded8cc; overflow: auto; }
    .candidate-row { width: 100%; border: 0; border-bottom: 1px solid #e7e0d3; padding: 12px; text-align: left; background: transparent; cursor: pointer; }
    .candidate-row[aria-selected="true"] { background: #efe8d9; }
    #candidate-detail { padding: 22px; overflow: auto; }
    .question-body { line-height: 1.85; font-size: 17px; }
    .actions { display: flex; gap: 8px; margin: 16px 0; }
    textarea { width: 100%; min-height: 90px; }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } #candidate-list { max-height: 34vh; border-right: 0; border-bottom: 1px solid #ded8cc; } }
  `;
}

function renderBrowserScript() {
  return `
    const appData = window.__CANDIDATE_REVIEW_DATA__;
    const state = loadState();
    let selectedId = appData.candidates[0]?.id ?? null;
    let query = "";
    let filter = "all";

    function loadState() {
      try { return JSON.parse(localStorage.getItem(appData.storage_key) || "{}"); }
      catch { return {}; }
    }
    function saveState() { localStorage.setItem(appData.storage_key, JSON.stringify(state)); }
    function setStatus(id, status) {
      state[id] = { ...(state[id] || {}), status, updated_at: new Date().toISOString() };
      saveState();
      render();
    }
    function setNote(id, note) {
      state[id] = { ...(state[id] || {}), note, updated_at: new Date().toISOString() };
      saveState();
    }
    function filteredCandidates() {
      return appData.candidates.filter((candidate) => {
        const status = state[candidate.id]?.status || "unreviewed";
        const haystack = [candidate.question_number, candidate.section_title, candidate.normalized_text].join(" ").toLowerCase();
        if (query && !haystack.includes(query.toLowerCase())) return false;
        if (filter === "all") return true;
        if (filter === "warnings") return candidate.warnings.length > 0;
        return status === filter;
      });
    }
    function buildSeed() {
      const approved = appData.candidates.filter((candidate) => state[candidate.id]?.status === "approved");
      return {
        exported_at: new Date().toISOString(),
        source_candidate_file: appData.candidate_source_file,
        source_file: appData.extraction.source_file,
        mineru_json_file: appData.extraction.mineru_json_file,
        approved_count: approved.length,
        items: approved.map((candidate) => ({
          id: candidate.id,
          candidate_id: candidate.id,
          review_status: "reviewed",
          reviewer_note: state[candidate.id]?.note || "",
          question_text: candidate.normalized_text,
          solution_outline: null,
          mistake_causes: [],
          knowledge_points: candidate.section_title ? ["导数", candidate.section_title] : ["导数"],
          difficulty: null,
          variant_level: null,
          source_ref: candidate.source_ref,
          original_extraction_confidence: candidate.extraction_confidence,
          original_warnings: candidate.warnings,
        })),
      };
    }
    function render() {
      const list = filteredCandidates();
      document.querySelector("#summary").textContent = "候选题 " + appData.candidates.length + " 道，当前筛选 " + list.length + " 道";
      document.querySelector("#candidate-list").innerHTML = list.map((candidate) => {
        const status = state[candidate.id]?.status || "unreviewed";
        return '<button class="candidate-row" aria-selected="' + (candidate.id === selectedId) + '" data-id="' + escapeAttribute(candidate.id) + '">' +
          '<strong>' + escapeHtml(candidate.question_number || "-") + '</strong> ' +
          escapeHtml(candidate.section_title || "未分组") +
          '<br><small>' + escapeHtml(status) + ' · ' + escapeHtml(candidate.extraction_confidence) + ' · warnings ' + escapeHtml(candidate.warnings.length) + '</small>' +
          '</button>';
      }).join("");
      const selected = appData.candidates.find((candidate) => candidate.id === selectedId) || list[0];
      if (!selected) {
        document.querySelector("#candidate-detail").innerHTML = "<p>没有候选题。</p>";
        return;
      }
      selectedId = selected.id;
      const note = state[selected.id]?.note || "";
      document.querySelector("#candidate-detail").innerHTML =
        '<h2>题号 ' + escapeHtml(selected.question_number || "-") + '</h2>' +
        '<p>' + escapeHtml(selected.section_title || "未分组") + '</p>' +
        '<div class="question-body">' + selected.rendered_html + '</div>' +
        '<div class="actions">' +
        '<button data-status="approved">Approved</button>' +
        '<button data-status="needs_fix">Needs Fix</button>' +
        '<button data-status="skipped">Skipped</button>' +
        '</div>' +
        '<h3>Warnings</h3><pre>' + escapeHtml(JSON.stringify(selected.warnings, null, 2)) + '</pre>' +
        '<h3>Source Ref</h3><pre>' + escapeHtml(JSON.stringify(selected.source_ref, null, 2)) + '</pre>' +
        '<h3>备注</h3><textarea id="note">' + escapeHtml(note) + '</textarea>';
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
    document.querySelector("#copy-json").addEventListener("click", async () => {
      const text = JSON.stringify(buildSeed(), null, 2);
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
      const blob = new Blob([JSON.stringify(buildSeed(), null, 2) + "\\n"], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "reviewed_practice_seed.json";
      link.click();
      URL.revokeObjectURL(link.href);
    });
    render();
  `;
}
