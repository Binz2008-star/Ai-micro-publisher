/**
 * M4 — Stage 2: LLM-Based Quality Reviewer
 *
 * Judgment-heavy checks that require language understanding:
 *   - Usefulness: does it genuinely help the target audience?
 *   - Coherence: is the content logically structured and consistent?
 *   - Factual caution: does it make unsupported or risky factual claims?
 *   - Safety: does it contain harmful, deceptive, or policy-violating content?
 *
 * Returns structured JSON with scores (0–100) and a decision.
 */

import { invokeLLM } from "../_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QualityDecision = "approve" | "retry" | "merge" | "reject";

export interface Stage2Result {
  decision: QualityDecision;
  usefulnessScore: number;        // 0–100
  coherenceScore: number;         // 0–100
  factualGroundingScore: number;  // 0–100 (100 = fully grounded, 0 = risky claims)
  safetyScore: number;            // 0–100 (100 = fully safe)
  publishScore: number;           // 0–100 composite
  reasons: string[];
  requiredChanges: string[];
  llmRawResponse: string;
  error: string | null;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const STAGE2_THRESHOLDS = {
  usefulnessScore: 70,
  coherenceScore: 70,
  factualGroundingScore: 75,
  safetyScore: 90,
  publishScore: 70,
} as const;

// ─── LLM prompt ───────────────────────────────────────────────────────────────

function buildReviewPrompt(
  title: string,
  bodyMarkdown: string,
  targetKeyword: string,
  audience: string,
): string {
  const truncated = bodyMarkdown.slice(0, 3000); // Limit to avoid token overflow
  return `You are a strict content quality reviewer for a professional publishing platform.

Review the following article and return a JSON object with your assessment.

ARTICLE TITLE: ${title}
TARGET KEYWORD: ${targetKeyword}
TARGET AUDIENCE: ${audience}

ARTICLE CONTENT:
${truncated}

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "usefulness_score": <0-100>,
  "coherence_score": <0-100>,
  "factual_grounding_score": <0-100>,
  "safety_score": <0-100>,
  "decision": "<approve|retry|reject>",
  "reasons": ["<reason1>", "<reason2>"],
  "required_changes": ["<change1>"]
}

Scoring guide:
- usefulness_score: Does this genuinely help ${audience}? 90+ = excellent practical value, 70+ = useful, <70 = vague or generic
- coherence_score: Is the content logically structured, consistent, and well-organized? 90+ = excellent flow, 70+ = acceptable, <70 = confusing or disjointed
- factual_grounding_score: Are all claims accurate and appropriately hedged? 90+ = well-grounded, 75+ = acceptable, <75 = unsupported or risky claims
- safety_score: Is the content free from harmful, deceptive, misleading, or policy-violating content? 95+ = fully safe, 90+ = acceptable, <90 = concerns found

Decision rules:
- "approve": all scores meet thresholds AND content is genuinely useful
- "retry": one score is borderline (within 10 points of threshold) AND specific improvements are possible
- "reject": safety_score < 80 OR multiple scores fail thresholds OR content is fundamentally flawed

Be strict. Generic, padded, or low-value content should score 60-70 on usefulness, not 90.`;
}

// ─── Stage 2 runner ───────────────────────────────────────────────────────────

export async function runStage2(
  title: string,
  bodyMarkdown: string,
  targetKeyword: string,
  audience: string = "general professionals",
): Promise<Stage2Result> {
  let llmRawResponse = "";
  let error: string | null = null;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "user",
          content: buildReviewPrompt(title, bodyMarkdown, targetKeyword, audience),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quality_review",
          strict: true,
          schema: {
            type: "object",
            properties: {
              usefulness_score: { type: "number" },
              coherence_score: { type: "number" },
              factual_grounding_score: { type: "number" },
              safety_score: { type: "number" },
              decision: { type: "string", enum: ["approve", "retry", "reject"] },
              reasons: { type: "array", items: { type: "string" } },
              required_changes: { type: "array", items: { type: "string" } },
            },
            required: [
              "usefulness_score", "coherence_score", "factual_grounding_score",
              "safety_score", "decision", "reasons", "required_changes",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content ?? "";
    llmRawResponse = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

    const parsed = JSON.parse(llmRawResponse) as {
      usefulness_score: number;
      coherence_score: number;
      factual_grounding_score: number;
      safety_score: number;
      decision: string;
      reasons: string[];
      required_changes: string[];
    };

    const usefulnessScore = Math.max(0, Math.min(100, Math.round(parsed.usefulness_score)));
    const coherenceScore = Math.max(0, Math.min(100, Math.round(parsed.coherence_score)));
    const factualGroundingScore = Math.max(0, Math.min(100, Math.round(parsed.factual_grounding_score)));
    const safetyScore = Math.max(0, Math.min(100, Math.round(parsed.safety_score)));

    // Composite publish score
    const publishScore = Math.round(
      usefulnessScore * 0.30 +
      coherenceScore * 0.25 +
      factualGroundingScore * 0.25 +
      safetyScore * 0.20,
    );

    // Override decision if safety is critically low
    let decision = parsed.decision as QualityDecision;
    if (safetyScore < 80) {
      decision = "reject";
    }

    return {
      decision,
      usefulnessScore,
      coherenceScore,
      factualGroundingScore,
      safetyScore,
      publishScore,
      reasons: parsed.reasons ?? [],
      requiredChanges: parsed.required_changes ?? [],
      llmRawResponse,
      error: null,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error("[Stage2] LLM review error:", error);

    // Fallback: return conservative scores on error
    return {
      decision: "retry",
      usefulnessScore: 0,
      coherenceScore: 0,
      factualGroundingScore: 0,
      safetyScore: 0,
      publishScore: 0,
      reasons: [`LLM review failed: ${error}`],
      requiredChanges: ["Retry quality review after LLM error resolves"],
      llmRawResponse,
      error,
    };
  }
}
