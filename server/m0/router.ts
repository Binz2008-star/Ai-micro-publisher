/**
 * Milestone 0 — tRPC router
 * Exposes:
 *   m0.generateDraft  — single LLM generation + quality gate
 *   m0.runEvidence    — run 5 generations sequentially and return evidence table
 *   m0.getBrief       — return the hardcoded brief (for display)
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { PROTOTYPE_BRIEF } from "./brief";
import { runQualityGate, THRESHOLDS } from "./quality";

// ─── Cost estimation (rough: $0.002 per 1K tokens, gpt-4o-mini equivalent) ───
const COST_PER_1K_TOKENS = 0.002;

function estimateCost(totalTokens: number): number {
  return parseFloat(((totalTokens / 1000) * COST_PER_1K_TOKENS).toFixed(6));
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a professional content writer producing helpful, practical web pages for a micro-publishing platform.

Your output must be clean Markdown suitable for direct web rendering.
Write in a clear, polite, and practical tone.
Do not include any preamble, meta-commentary, or "Here is your article" framing.
Start directly with the H1 title.`;
}

function buildUserPrompt(brief: typeof PROTOTYPE_BRIEF): string {
  return `Write a helpful ${brief.page_type} page about: "${brief.topic}"

Target keyword: ${brief.target_keyword}
Audience: ${brief.audience}
Tone: ${brief.tone}
Max words: ${brief.max_words}
Language: ${brief.language}

Required sections (use ## headings):
${brief.required_sections.map((s) => `- ${s}`).join("\n")}

Do NOT include:
${brief.blocked_claims.map((c) => `- ${c}`).join("\n")}

Format requirements:
- Start with a single H1 (# Title)
- Use ## for each required section
- Include at least one numbered list or bullet list
- Include a practical email template in a code block or blockquote
- Include 2-3 concrete examples
- End with a short FAQ section (at least 2 Q&A pairs)
- Keep total length between 350 and 550 words`;
}

// ─── Single generation ────────────────────────────────────────────────────────

async function generateOneDraft(runNumber: number) {
  const start = Date.now();

  let draftContent = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let errorMessage: string | null = null;
  let generated = false;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(PROTOTYPE_BRIEF) },
      ],
    });

    const choice = response.choices?.[0];
    const rawContent = choice?.message?.content ?? "";
    draftContent = typeof rawContent === "string" ? rawContent : "";
    promptTokens = response.usage?.prompt_tokens ?? 0;
    completionTokens = response.usage?.completion_tokens ?? 0;
    totalTokens = response.usage?.total_tokens ?? (promptTokens + completionTokens);
    generated = draftContent.length > 50;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - start;
  const estimatedCostUsd = estimateCost(totalTokens);

  // Run quality gate only if we have content
  let qualityResult = null;
  if (generated && draftContent) {
    qualityResult = runQualityGate(draftContent, PROTOTYPE_BRIEF.required_sections);
  }

  const decision = qualityResult?.decision ?? "reject";
  const rendered = decision === "approve" && generated;

  return {
    runNumber,
    topic: PROTOTYPE_BRIEF.topic,
    generated,
    decision,
    publishScore: qualityResult?.publishScore ?? 0,
    safetyScore: qualityResult?.safetyScore ?? 0,
    usefulnessScore: qualityResult?.usefulnessScore ?? 0,
    readabilityScore: qualityResult?.readabilityScore ?? 0,
    rendered,
    estimatedCostUsd,
    latencyMs,
    promptTokens,
    completionTokens,
    totalTokens,
    draftContent: generated ? draftContent : null,
    qualityReasons: qualityResult?.reasons ?? [],
    requiredChanges: qualityResult?.requiredChanges ?? [],
    errorMessage,
    notes: errorMessage
      ? `Error: ${errorMessage}`
      : qualityResult?.reasons?.filter((r) => r.includes("Failed")).join("; ") || "All thresholds passed",
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const m0Router = router({
  getBrief: publicProcedure.query(() => ({
    brief: PROTOTYPE_BRIEF,
    thresholds: THRESHOLDS,
  })),

  generateDraft: publicProcedure
    .input(z.object({ runNumber: z.number().min(1).max(10).default(1) }))
    .mutation(async ({ input }) => {
      return generateOneDraft(input.runNumber);
    }),

  runEvidence: publicProcedure.mutation(async () => {
    const runs = [];
    for (let i = 1; i <= 5; i++) {
      const result = await generateOneDraft(i);
      runs.push(result);
    }

    const passRate = runs.filter((r) => r.decision === "approve").length;
    const avgCost = runs.reduce((s, r) => s + r.estimatedCostUsd, 0) / runs.length;
    const avgLatency = Math.round(runs.reduce((s, r) => s + r.latencyMs, 0) / runs.length);
    const usefulCount = runs.filter(
      (r) => r.usefulnessScore >= THRESHOLDS.usefulnessScore,
    ).length;
    const renderedCount = runs.filter((r) => r.rendered).length;
    const safetyFailures = runs.filter((r) => r.safetyScore < THRESHOLDS.safetyScore).length;

    const goDecision =
      passRate === 5 &&
      usefulCount >= 4 &&
      renderedCount >= 1 &&
      safetyFailures === 0 &&
      avgCost <= 0.05;

    return {
      runs,
      summary: {
        passRate: `${passRate} / 5`,
        avgCostUsd: parseFloat(avgCost.toFixed(6)),
        avgLatencyMs: avgLatency,
        usefulDraftCount: `${usefulCount} / 5`,
        renderedPageCount: `${renderedCount} / 5`,
        safetyFailures,
        decision: goDecision ? "GO" : "NO-GO",
        reason: goDecision
          ? "All M0 criteria met"
          : [
              passRate < 5 && `Pass rate ${passRate}/5 < 5`,
              usefulCount < 4 && `Useful drafts ${usefulCount}/5 < 4`,
              renderedCount < 1 && "No pages rendered",
              safetyFailures > 0 && `${safetyFailures} safety failure(s)`,
              avgCost > 0.05 && `Avg cost $${avgCost.toFixed(4)} > $0.05`,
            ]
              .filter(Boolean)
              .join("; "),
      },
    };
  }),
});
