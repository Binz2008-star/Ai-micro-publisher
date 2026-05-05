/**
 * M4 — Quality Review Runner
 *
 * Orchestrates the two-stage quality gate:
 *   Stage 1: fast heuristic checks (no LLM)
 *   Stage 2: LLM-based review (only if Stage 1 passes)
 *
 * Updates content_pages with all scores and the final decision.
 * Updates policy_status based on safety score.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { contentPages, topics } from "../../drizzle/schema";
import { runStage1, type Stage1Input } from "./stage1";
import { runStage2, type QualityDecision, STAGE2_THRESHOLDS } from "./stage2";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QualityReviewResult {
  pageId: number;
  topicKeyword: string;
  stage1Passed: boolean;
  decision: QualityDecision | "reject_stage1";
  publishScore: number;
  safetyScore: number;
  originalityScore: number;
  usefulnessScore: number;
  coherenceScore: number;
  factualGroundingScore: number;
  readabilityScore: number;
  policyStatus: "approved" | "flagged" | "rejected";
  reasons: string[];
  requiredChanges: string[];
  suggestMerge: boolean;
  mergeTargetSlug: string | null;
  stage1Details: ReturnType<typeof runStage1>;
  stage2Details: Awaited<ReturnType<typeof runStage2>> | null;
}

// ─── Policy status from safety score ─────────────────────────────────────────

function derivePolicyStatus(safetyScore: number): "approved" | "flagged" | "rejected" {
  if (safetyScore >= STAGE2_THRESHOLDS.safetyScore) return "approved";
  if (safetyScore >= 70) return "flagged";
  return "rejected";
}

// ─── Single page review ───────────────────────────────────────────────────────

export async function reviewPage(pageId: number): Promise<QualityReviewResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  // Load page
  const pageRows = await db.select().from(contentPages).where(eq(contentPages.id, pageId)).limit(1);
  const page = pageRows[0];
  if (!page) throw new Error(`Page ${pageId} not found`);

  // Load topic for keyword and audience
  const topicRows = page.topicId
    ? await db.select().from(topics).where(eq(topics.id, page.topicId)).limit(1)
    : [];
  const topic = topicRows[0];
  const targetKeyword = topic?.keyword ?? page.slug.replace(/-/g, " ");

  // Load existing published pages for duplicate detection (exclude current page)
  const existingRows = await db
    .select({ slug: contentPages.slug, bodyMarkdown: contentPages.bodyMarkdown })
    .from(contentPages)
    .where(and(
      eq(contentPages.status, "draft"),
    ))
    .limit(50);
  const existingPages = existingRows.filter((p) => p.slug !== page.slug);

  // ─── Stage 1 ─────────────────────────────────────────────────────────────

  const stage1Input: Stage1Input = {
    title: page.title,
    metaDescription: page.metaDescription ?? null,
    slug: page.slug,
    bodyMarkdown: page.bodyMarkdown,
    targetKeyword,
    existingPages,
  };

  const stage1 = runStage1(stage1Input);

  // If Stage 1 fails critically, reject immediately without LLM call
  if (!stage1.passed) {
    const decision: QualityDecision = stage1.suggestMerge ? "merge" : "reject";

    // Compute a rough publish score from Stage 1 only
    const s1PublishScore = Math.round(
      (stage1.readabilityScore * 0.2 +
        stage1.lengthScore * 0.3 +
        stage1.metadataScore * 0.2 +
        stage1.headingScore * 0.15 +
        stage1.originalityScore * 0.15)
    );

    await db.update(contentPages).set({
      publishScore: s1PublishScore,
      safetyScore: 0,
      originalityScore: stage1.originalityScore,
      usefulnessScore: 0,
      coherenceScore: 0,
      factualGroundingScore: 0,
      readabilityScore: stage1.readabilityScore,
      policyStatus: "flagged",
      qualityDecision: decision,
      qualityReasons: stage1.reasons,
      status: decision === "merge" ? "reviewing" : "rejected",
    }).where(eq(contentPages.id, pageId));

    return {
      pageId,
      topicKeyword: targetKeyword,
      stage1Passed: false,
      decision: "reject_stage1",
      publishScore: s1PublishScore,
      safetyScore: 0,
      originalityScore: stage1.originalityScore,
      usefulnessScore: 0,
      coherenceScore: 0,
      factualGroundingScore: 0,
      readabilityScore: stage1.readabilityScore,
      policyStatus: "flagged",
      reasons: stage1.reasons,
      requiredChanges: ["Fix Stage 1 failures before LLM review"],
      suggestMerge: stage1.suggestMerge,
      mergeTargetSlug: stage1.mergeTargetSlug,
      stage1Details: stage1,
      stage2Details: null,
    };
  }

  // ─── Stage 2 ─────────────────────────────────────────────────────────────

  const stage2 = await runStage2(
    page.title,
    page.bodyMarkdown,
    targetKeyword,
    "general professionals",
  );

  // Combine scores: Stage 1 informs readability/originality, Stage 2 informs the rest
  const finalReadabilityScore = Math.round((stage1.readabilityScore + stage2.coherenceScore) / 2);
  const finalOriginalityScore = stage1.originalityScore;
  const finalPublishScore = Math.round(
    stage2.usefulnessScore * 0.25 +
    stage2.coherenceScore * 0.20 +
    stage2.factualGroundingScore * 0.20 +
    stage2.safetyScore * 0.15 +
    stage1.readabilityScore * 0.10 +
    stage1.originalityScore * 0.10,
  );

  const policyStatus = derivePolicyStatus(stage2.safetyScore);

  // Determine final decision
  let finalDecision: QualityDecision = stage2.decision;
  if (stage1.suggestMerge) {
    finalDecision = "merge";
  }

  // Map content_pages.status
  const pageStatus =
    finalDecision === "approve" ? "approved" :
    finalDecision === "merge" ? "reviewing" :
    finalDecision === "retry" ? "reviewing" :
    "rejected";

  const allReasons = [...stage1.reasons, ...stage2.reasons];
  const allChanges = stage2.requiredChanges;

  // Update content_pages
  await db.update(contentPages).set({
    publishScore: finalPublishScore,
    safetyScore: stage2.safetyScore,
    originalityScore: finalOriginalityScore,
    usefulnessScore: stage2.usefulnessScore,
    coherenceScore: stage2.coherenceScore,
    factualGroundingScore: stage2.factualGroundingScore,
    readabilityScore: finalReadabilityScore,
    policyStatus,
    qualityDecision: finalDecision,
    qualityReasons: allReasons,
    status: pageStatus,
    rejectionReason: finalDecision === "reject" ? allReasons.slice(0, 3).join("; ") : undefined,
  }).where(eq(contentPages.id, pageId));

  return {
    pageId,
    topicKeyword: targetKeyword,
    stage1Passed: true,
    decision: finalDecision,
    publishScore: finalPublishScore,
    safetyScore: stage2.safetyScore,
    originalityScore: finalOriginalityScore,
    usefulnessScore: stage2.usefulnessScore,
    coherenceScore: stage2.coherenceScore,
    factualGroundingScore: stage2.factualGroundingScore,
    readabilityScore: finalReadabilityScore,
    policyStatus,
    reasons: allReasons,
    requiredChanges: allChanges,
    suggestMerge: stage1.suggestMerge,
    mergeTargetSlug: stage1.mergeTargetSlug,
    stage1Details: stage1,
    stage2Details: stage2,
  };
}

// ─── Batch review ─────────────────────────────────────────────────────────────

export async function reviewAllPendingPages(): Promise<QualityReviewResult[]> {
  const db = await getDb();
  if (!db) return [];

  const pendingPages = await db
    .select({ id: contentPages.id })
    .from(contentPages)
    .where(eq(contentPages.status, "draft"))
    .limit(20);

  const results: QualityReviewResult[] = [];
  for (const { id } of pendingPages) {
    try {
      const result = await reviewPage(id);
      results.push(result);
    } catch (err) {
      console.error(`[QualityReview] Error reviewing page ${id}:`, err);
    }
  }

  return results;
}
