/**
 * M4 — Stage 1: Heuristic Quality Checker
 *
 * Fast, deterministic checks that reject obvious failures before
 * expensive LLM calls. Checks:
 *   - Content length (word count)
 *   - Readability (avg sentence length, caps ratio)
 *   - Metadata completeness (title, meta description, slug)
 *   - Heading structure (H1 presence, H2 count)
 *   - Keyword density (target keyword in content)
 *   - Duplicate slug detection
 *   - Near-duplicate content detection (word overlap)
 */

export interface Stage1Result {
  passed: boolean;
  readabilityScore: number;       // 0–100
  lengthScore: number;            // 0–100
  metadataScore: number;          // 0–100
  headingScore: number;           // 0–100
  keywordDensityScore: number;    // 0–100
  originalityScore: number;       // 0–100 (duplicate check)
  reasons: string[];
  suggestMerge: boolean;          // true if near-duplicate found
  mergeTargetSlug: string | null;
}

// ─── Readability ──────────────────────────────────────────────────────────────

function checkReadability(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;

  if (avgWordsPerSentence > 30) {
    score -= 25;
    reasons.push(`Average sentence length ${avgWordsPerSentence.toFixed(0)} words (>30) — too complex`);
  } else if (avgWordsPerSentence > 22) {
    score -= 10;
    reasons.push(`Average sentence length ${avgWordsPerSentence.toFixed(0)} words (>22) — slightly complex`);
  }

  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
  if (capsRatio > 0.15) {
    score -= 15;
    reasons.push("Excessive capitalisation detected");
  }

  // Check for paragraph structure
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 20);
  if (paragraphs.length < 3) {
    score -= 10;
    reasons.push("Fewer than 3 paragraphs — poor structure");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ─── Content length ───────────────────────────────────────────────────────────

function checkLength(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (wordCount < 150) {
    return { score: 0, reasons: [`Content too thin: ${wordCount} words (<150) — auto-reject`] };
  }
  if (wordCount < 250) {
    return { score: 40, reasons: [`Content is brief: ${wordCount} words (<250)`] };
  }
  if (wordCount < 350) {
    return { score: 70, reasons: [`Content is short: ${wordCount} words (<350)`] };
  }
  if (wordCount > 1200) {
    return { score: 75, reasons: [`Content is very long: ${wordCount} words (>1200) — may need trimming`] };
  }

  return { score: 100, reasons: [] };
}

// ─── Metadata completeness ────────────────────────────────────────────────────

function checkMetadata(
  title: string,
  metaDescription: string | null,
  slug: string,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  if (!title || title.trim().length < 10) {
    score -= 30;
    reasons.push("Title is missing or too short (<10 chars)");
  } else if (title.length > 70) {
    score -= 10;
    reasons.push(`Title too long: ${title.length} chars (>70)`);
  }

  if (!metaDescription || metaDescription.trim().length < 50) {
    score -= 20;
    reasons.push("Meta description missing or too short (<50 chars)");
  } else if (metaDescription.length > 160) {
    score -= 10;
    reasons.push(`Meta description too long: ${metaDescription.length} chars (>160)`);
  }

  if (!slug || slug.length < 5) {
    score -= 20;
    reasons.push("Slug is missing or too short");
  } else if (!/^[a-z0-9-]+$/.test(slug)) {
    score -= 10;
    reasons.push("Slug contains invalid characters (must be lowercase alphanumeric + hyphens)");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ─── Heading structure ────────────────────────────────────────────────────────

function checkHeadings(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  const h1Matches = text.match(/^#\s+.+/gm) || [];
  const h2Matches = text.match(/^##\s+.+/gm) || [];
  const h3Matches = text.match(/^###\s+.+/gm) || [];

  if (h1Matches.length === 0) {
    score -= 30;
    reasons.push("No H1 title found");
  } else if (h1Matches.length > 1) {
    score -= 15;
    reasons.push(`Multiple H1 headings (${h1Matches.length}) — should have exactly one`);
  }

  if (h2Matches.length < 2) {
    score -= 20;
    reasons.push(`Only ${h2Matches.length} H2 headings (<2) — needs more structure`);
  }

  const totalHeadings = h1Matches.length + h2Matches.length + h3Matches.length;
  if (totalHeadings < 3) {
    score -= 10;
    reasons.push(`Only ${totalHeadings} total headings — poor document structure`);
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ─── Keyword density ──────────────────────────────────────────────────────────

function checkKeywordDensity(text: string, targetKeyword: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const lower = text.toLowerCase();
  const kwLower = targetKeyword.toLowerCase();

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const kwWords = kwLower.split(/\s+/).length;

  // Count occurrences of the keyword
  let count = 0;
  let pos = 0;
  while ((pos = lower.indexOf(kwLower, pos)) !== -1) {
    count++;
    pos += kwLower.length;
  }

  if (count === 0) {
    return { score: 30, reasons: [`Target keyword "${targetKeyword}" not found in content`] };
  }

  const density = (count * kwWords) / wordCount;

  if (density > 0.05) {
    return { score: 40, reasons: [`Keyword density too high: ${(density * 100).toFixed(1)}% (>5%) — keyword stuffing risk`] };
  }

  if (density < 0.005) {
    return { score: 60, reasons: [`Keyword density low: ${(density * 100).toFixed(2)}% (<0.5%) — consider adding keyword naturally`] };
  }

  return { score: 90, reasons: [] };
}

// ─── Duplicate / near-duplicate detection ────────────────────────────────────

function checkOriginality(
  slug: string,
  bodyText: string,
  existingPages: Array<{ slug: string; bodyMarkdown: string }>,
): { score: number; reasons: string[]; suggestMerge: boolean; mergeTargetSlug: string | null } {
  // Exact slug duplicate
  if (existingPages.some((p) => p.slug === slug)) {
    return {
      score: 0,
      reasons: [`Exact slug duplicate: "${slug}" already exists`],
      suggestMerge: true,
      mergeTargetSlug: slug,
    };
  }

  // Near-duplicate content check (word overlap)
  const words = new Set(
    bodyText.toLowerCase().split(/\s+/).filter((w) => w.length > 4)
  );

  for (const page of existingPages) {
    const existingWords = new Set(
      page.bodyMarkdown.toLowerCase().split(/\s+/).filter((w) => w.length > 4)
    );
    const intersection = Array.from(words).filter((w) => existingWords.has(w)).length;
    const union = new Set([...Array.from(words), ...Array.from(existingWords)]).size;
    const similarity = union > 0 ? intersection / union : 0;

    if (similarity > 0.6) {
      return {
        score: 10,
        reasons: [`Near-duplicate of "${page.slug}" (${(similarity * 100).toFixed(0)}% word overlap) — suggest merge`],
        suggestMerge: true,
        mergeTargetSlug: page.slug,
      };
    }
    if (similarity > 0.4) {
      return {
        score: 50,
        reasons: [`Similar to "${page.slug}" (${(similarity * 100).toFixed(0)}% word overlap) — review for overlap`],
        suggestMerge: false,
        mergeTargetSlug: null,
      };
    }
  }

  return { score: 90, reasons: [], suggestMerge: false, mergeTargetSlug: null };
}

// ─── Main Stage 1 runner ──────────────────────────────────────────────────────

export interface Stage1Input {
  title: string;
  metaDescription: string | null;
  slug: string;
  bodyMarkdown: string;
  targetKeyword: string;
  existingPages?: Array<{ slug: string; bodyMarkdown: string }>;
}

export function runStage1(input: Stage1Input): Stage1Result {
  const allReasons: string[] = [];

  const readability = checkReadability(input.bodyMarkdown);
  const length = checkLength(input.bodyMarkdown);
  const metadata = checkMetadata(input.title, input.metaDescription, input.slug);
  const headings = checkHeadings(input.bodyMarkdown);
  const keywordDensity = checkKeywordDensity(input.bodyMarkdown, input.targetKeyword);
  const originality = checkOriginality(
    input.slug,
    input.bodyMarkdown,
    input.existingPages ?? [],
  );

  allReasons.push(
    ...readability.reasons,
    ...length.reasons,
    ...metadata.reasons,
    ...headings.reasons,
    ...keywordDensity.reasons,
    ...originality.reasons,
  );

  // Stage 1 passes if no critical failures
  const criticalFailure =
    length.score === 0 ||           // Too thin
    originality.score === 0 ||      // Exact duplicate
    metadata.score < 30;            // Completely missing metadata

  const passed = !criticalFailure;

  return {
    passed,
    readabilityScore: readability.score,
    lengthScore: length.score,
    metadataScore: metadata.score,
    headingScore: headings.score,
    keywordDensityScore: keywordDensity.score,
    originalityScore: originality.score,
    reasons: allReasons,
    suggestMerge: originality.suggestMerge,
    mergeTargetSlug: originality.mergeTargetSlug,
  };
}
