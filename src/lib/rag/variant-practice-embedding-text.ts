import type { DynamicPracticeQuery } from "@/lib/rag/dynamic-variant-practice-query";

export interface VariantPracticeEmbeddingTextItem {
  question_text: string;
  search_text: string;
  knowledge_points: string[];
  section_title?: string | null;
  target_skills?: string[];
  method_tags?: string[];
}

export interface VariantPracticeEmbeddingHashInput {
  embedding_model: string;
  dimensions: number;
  embedding_text: string;
}

export function buildVariantPracticeItemEmbeddingText(
  item: VariantPracticeEmbeddingTextItem,
): string {
  return [
    "题干：",
    normalizeText(item.question_text),
    "",
    "检索文本：",
    normalizeText(item.search_text),
    "",
    "知识点：",
    normalizeList(item.knowledge_points),
    "",
    "章节：",
    normalizeText(item.section_title ?? ""),
    "",
    "目标能力：",
    normalizeList(item.target_skills ?? []),
    "",
    "方法标签：",
    normalizeList(item.method_tags ?? []),
  ].join("\n");
}

export function buildDynamicPracticeQueryEmbeddingText(
  query: DynamicPracticeQuery,
): string {
  return [
    "当前错题：",
    normalizeText(query.question_text),
    "",
    "知识点：",
    normalizeList(query.knowledge_points),
    "",
    "章节：",
    normalizeText(query.section_title ?? ""),
    "",
    "错因：",
    normalizeList(query.mistake_causes),
    "",
    "练习目标：",
    normalizeList(query.target_skills),
  ].join("\n");
}

export function buildVariantPracticeEmbeddingHashInput(
  input: VariantPracticeEmbeddingHashInput,
): string {
  return [
    normalizeText(input.embedding_model),
    String(input.dimensions),
    input.embedding_text,
  ].join("\n");
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizeList(values: readonly string[]): string {
  return [...new Set(values.map(normalizeText).filter(Boolean))].join("、");
}
