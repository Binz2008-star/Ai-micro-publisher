/**
 * M2 — Topic Discovery Sources
 *
 * Three source types:
 *   1. Seeded keywords — safe, high-value utility topics (always available)
 *   2. RSS feeds — HackerNews, Reddit, Google Trends (live, with fallback)
 *   3. Seasonal calendar — month-aware topics (deterministic)
 */

// ─── Seeded Keywords ──────────────────────────────────────────────────────────
// Safe, ad-friendly utility topics with proven search demand.
// These are the fallback when RSS feeds are unavailable.

export const SEEDED_KEYWORDS: Array<{ keyword: string; trendSignal: number }> = [
  // Email & communication
  { keyword: "how to write a polite follow-up email after no response", trendSignal: 75 },
  { keyword: "professional email subject line examples", trendSignal: 70 },
  { keyword: "how to decline a meeting invitation politely", trendSignal: 65 },
  { keyword: "out of office message examples", trendSignal: 60 },
  { keyword: "how to write a resignation letter", trendSignal: 72 },

  // Productivity & work
  { keyword: "how to prioritize tasks when everything is urgent", trendSignal: 78 },
  { keyword: "best free project management tools for small teams", trendSignal: 82 },
  { keyword: "how to run an effective one-on-one meeting", trendSignal: 68 },
  { keyword: "remote work productivity tips", trendSignal: 74 },
  { keyword: "how to write a performance review self-assessment", trendSignal: 71 },

  // Tech & software
  { keyword: "how to use git rebase vs merge", trendSignal: 76 },
  { keyword: "python list comprehension examples", trendSignal: 80 },
  { keyword: "how to center a div in css", trendSignal: 85 },
  { keyword: "difference between rest api and graphql", trendSignal: 73 },
  { keyword: "how to set up a virtual environment in python", trendSignal: 77 },
  { keyword: "javascript async await vs promises explained", trendSignal: 79 },
  { keyword: "how to write a good README file for github", trendSignal: 69 },

  // Career & job search
  { keyword: "how to negotiate salary for a new job", trendSignal: 83 },
  { keyword: "linkedin profile tips for software engineers", trendSignal: 76 },
  { keyword: "how to prepare for a technical interview", trendSignal: 88 },
  { keyword: "cover letter template for software developer", trendSignal: 72 },
  { keyword: "how to ask for a promotion at work", trendSignal: 70 },

  // Finance & personal finance
  { keyword: "how to create a monthly budget spreadsheet", trendSignal: 80 },
  { keyword: "difference between roth ira and traditional ira", trendSignal: 75 },
  { keyword: "how to improve your credit score fast", trendSignal: 82 },
  { keyword: "what is an emergency fund and how much to save", trendSignal: 71 },

  // Health & wellness (safe, non-medical-advice)
  { keyword: "how to improve sleep quality naturally", trendSignal: 84 },
  { keyword: "beginner workout routine at home no equipment", trendSignal: 86 },
  { keyword: "healthy meal prep ideas for the week", trendSignal: 79 },
  { keyword: "how to reduce stress at work", trendSignal: 77 },

  // Learning & education
  { keyword: "how to learn a new skill quickly", trendSignal: 73 },
  { keyword: "best free online courses for web development", trendSignal: 81 },
  { keyword: "how to take effective notes while studying", trendSignal: 68 },
  { keyword: "pomodoro technique explained for beginners", trendSignal: 65 },

  // Writing & content
  { keyword: "how to write a blog post that ranks on google", trendSignal: 78 },
  { keyword: "copywriting formulas for beginners", trendSignal: 70 },
  { keyword: "how to write a compelling headline", trendSignal: 72 },
];

// ─── RSS Feed Sources ─────────────────────────────────────────────────────────

export interface RssFeedConfig {
  name: string;
  url: string;
  source: string;
  maxItems: number;
  trendSignalBase: number; // Base trend signal for items from this feed
}

export const RSS_FEEDS: RssFeedConfig[] = [
  {
    name: "HackerNews Top Stories",
    url: "https://hnrss.org/frontpage",
    source: "hackernews",
    maxItems: 20,
    trendSignalBase: 70,
  },
  {
    name: "HackerNews Ask HN",
    url: "https://hnrss.org/ask",
    source: "hackernews",
    maxItems: 10,
    trendSignalBase: 65,
  },
  {
    name: "Reddit r/learnprogramming",
    url: "https://www.reddit.com/r/learnprogramming/top/.rss?t=day",
    source: "reddit",
    maxItems: 15,
    trendSignalBase: 60,
  },
  {
    name: "Reddit r/productivity",
    url: "https://www.reddit.com/r/productivity/top/.rss?t=day",
    source: "reddit",
    maxItems: 10,
    trendSignalBase: 60,
  },
  {
    name: "Dev.to",
    url: "https://dev.to/feed",
    source: "devto",
    maxItems: 15,
    trendSignalBase: 65,
  },
];

// ─── Seasonal Calendar ────────────────────────────────────────────────────────

export interface SeasonalTopic {
  keyword: string;
  months: number[]; // 1-12
  trendSignal: number;
}

export const SEASONAL_TOPICS: SeasonalTopic[] = [
  // January
  { keyword: "new year productivity system setup", months: [1], trendSignal: 85 },
  { keyword: "how to set goals you will actually achieve", months: [1, 12], trendSignal: 80 },
  { keyword: "best budgeting apps for the new year", months: [1], trendSignal: 78 },

  // February
  { keyword: "valentine's day email templates for businesses", months: [2], trendSignal: 70 },
  { keyword: "how to write a thank you note professionally", months: [2, 11, 12], trendSignal: 65 },

  // March / April — Spring
  { keyword: "spring cleaning checklist for your digital life", months: [3, 4], trendSignal: 72 },
  { keyword: "how to organize your home office", months: [3, 4], trendSignal: 75 },
  { keyword: "tax filing checklist for freelancers", months: [3, 4], trendSignal: 82 },

  // May / June — Graduation / Summer
  { keyword: "graduation gift ideas for tech professionals", months: [5, 6], trendSignal: 70 },
  { keyword: "how to write a cover letter for your first job", months: [5, 6], trendSignal: 76 },
  { keyword: "summer internship tips for software developers", months: [5, 6], trendSignal: 73 },

  // July / August — Mid-year review
  { keyword: "mid-year performance review examples", months: [7, 8], trendSignal: 74 },
  { keyword: "how to stay productive in summer heat", months: [7, 8], trendSignal: 65 },

  // September / October — Back to work / school
  { keyword: "back to school productivity tips for adults", months: [9, 10], trendSignal: 78 },
  { keyword: "how to get back on track after a vacation", months: [9], trendSignal: 72 },
  { keyword: "fall productivity routine ideas", months: [9, 10], trendSignal: 70 },

  // November / December — Year-end
  { keyword: "year-end review template for professionals", months: [11, 12], trendSignal: 80 },
  { keyword: "how to write a year in review for your team", months: [11, 12], trendSignal: 75 },
  { keyword: "holiday out of office message examples", months: [12], trendSignal: 82 },
  { keyword: "how to plan your goals for next year", months: [12], trendSignal: 85 },
];

export function getCurrentSeasonalTopics(): Array<{ keyword: string; trendSignal: number }> {
  const month = new Date().getMonth() + 1; // 1-12
  return SEASONAL_TOPICS
    .filter((t) => t.months.includes(month))
    .map(({ keyword, trendSignal }) => ({ keyword, trendSignal }));
}

// ─── Keyword normalizer ───────────────────────────────────────────────────────

export function normalizeKeyword(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special chars except hyphens
    .replace(/\s+/g, " ")    // Collapse whitespace
    .replace(/^(the|a|an)\s+/i, "") // Remove leading articles
    .slice(0, 200);           // Max length
}

export function isValidKeyword(keyword: string): boolean {
  const normalized = normalizeKeyword(keyword);
  if (normalized.length < 5) return false;
  if (normalized.split(" ").length < 2) return false; // Must be at least 2 words
  if (/^\d+$/.test(normalized)) return false; // Pure numbers
  return true;
}
