/**
 * Milestone 0 — Hardcoded safe prototype topic brief.
 * This is the only topic used in M0. No discovery, no DB, no workers.
 */
export const PROTOTYPE_BRIEF = {
  topic: "How to write a polite follow-up email after no response",
  target_keyword: "polite follow up email after no response",
  user_intent: "utility",
  page_type: "template",
  audience: "general professionals",
  language: "en",
  tone: "clear, polite, practical",
  max_words: 500,
  required_sections: ["intro", "template", "examples", "tips", "faq"],
  blocked_claims: ["legal guarantees", "employment law advice"],
  internal_links: [] as string[],
} as const;

export type PrototypeBrief = typeof PROTOTYPE_BRIEF;
