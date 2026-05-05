import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
  bigint,
  float,
  index,
  unique,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Topics ───────────────────────────────────────────────────────────────────

export const topics = mysqlTable(
  "topics",
  {
    id: int("id").autoincrement().primaryKey(),
    keyword: varchar("keyword", { length: 512 }).notNull(),
    source: varchar("source", { length: 128 }).notNull(),
    language: varchar("language", { length: 8 }).notNull().default("en"),
    trendScore: int("trend_score").notNull().default(0),
    searchIntentScore: int("search_intent_score").notNull().default(0),
    contentGapScore: int("content_gap_score").notNull().default(0),
    expectedAdValueScore: int("expected_ad_value_score").notNull().default(0),
    freshnessScore: int("freshness_score").notNull().default(0),
    policyRiskScore: int("policy_risk_score").notNull().default(0),
    duplicationScore: int("duplication_score").notNull().default(0),
    opportunityScore: int("opportunity_score").notNull().default(0),
    status: mysqlEnum("status", ["candidate", "accepted", "rejected", "generating", "done"]).notNull().default("candidate"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_topics_status_score").on(t.status, t.opportunityScore),
    unique("idx_topics_keyword_language").on(t.keyword, t.language),
  ]
);

export type Topic = typeof topics.$inferSelect;
export type InsertTopic = typeof topics.$inferInsert;

// ─── Content Pages ────────────────────────────────────────────────────────────

export const contentPages = mysqlTable(
  "content_pages",
  {
    id: int("id").autoincrement().primaryKey(),
    topicId: int("topic_id").references(() => topics.id),
    slug: varchar("slug", { length: 512 }).notNull().unique(),
    title: varchar("title", { length: 512 }).notNull(),
    metaDescription: text("meta_description"),
    language: varchar("language", { length: 8 }).notNull().default("en"),
    pageType: varchar("page_type", { length: 64 }).notNull().default("article"),
    status: mysqlEnum("status", ["draft", "reviewing", "approved", "published", "archived", "rejected"]).notNull().default("draft"),
    policyStatus: mysqlEnum("policy_status", ["pending", "approved", "flagged", "rejected"]).notNull().default("pending"),
    publishScore: int("publish_score").notNull().default(0),
    safetyScore: int("safety_score").notNull().default(0),
    originalityScore: int("originality_score").notNull().default(0),
    usefulnessScore: int("usefulness_score").notNull().default(0),
    coherenceScore: int("coherence_score").notNull().default(0),
    factualGroundingScore: int("factual_grounding_score").notNull().default(0),
    readabilityScore: int("readability_score").notNull().default(0),
    bodyMarkdown: text("body_markdown").notNull(),
    structuredData: json("structured_data"),
    canonicalPageId: int("canonical_page_id"),
    version: int("version").notNull().default(1),
    rejectionReason: text("rejection_reason"),
    qualityDecision: mysqlEnum("quality_decision", ["approve", "retry", "merge", "reject"]),
    qualityReasons: json("quality_reasons"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_pages_status").on(t.status),
    index("idx_pages_published_at").on(t.publishedAt),
    index("idx_pages_topic_id").on(t.topicId),
  ]
);

export type ContentPage = typeof contentPages.$inferSelect;
export type InsertContentPage = typeof contentPages.$inferInsert;

// ─── Generation Jobs ──────────────────────────────────────────────────────────

export const generationJobs = mysqlTable(
  "generation_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    topicId: int("topic_id").references(() => topics.id),
    pageId: int("page_id").references(() => contentPages.id),
    jobType: mysqlEnum("job_type", ["generate", "review", "refresh", "archive"]).notNull(),
    status: mysqlEnum("status", ["queued", "running", "completed", "failed", "skipped"]).notNull().default("queued"),
    model: varchar("model", { length: 128 }),
    provider: varchar("provider", { length: 64 }).default("built-in"),
    promptTokens: int("prompt_tokens").default(0),
    completionTokens: int("completion_tokens").default(0),
    totalTokens: int("total_tokens").default(0),
    estimatedCostUsd: float("estimated_cost_usd").default(0),
    latencyMs: int("latency_ms"),
    errorMessage: text("error_message"),
    retryCount: int("retry_count").notNull().default(0),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).unique(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_jobs_status").on(t.status),
    index("idx_jobs_topic_id").on(t.topicId),
    index("idx_jobs_created_at").on(t.createdAt),
  ]
);

export type GenerationJob = typeof generationJobs.$inferSelect;
export type InsertGenerationJob = typeof generationJobs.$inferInsert;

// ─── Page Events ──────────────────────────────────────────────────────────────

export const pageEvents = mysqlTable(
  "page_events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    pageId: int("page_id").references(() => contentPages.id),
    eventType: mysqlEnum("event_type", ["page_view", "ad_slot_visible", "ad_click_out", "bot_blocked"]).notNull(),
    sessionHash: varchar("session_hash", { length: 64 }),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    referrer: varchar("referrer", { length: 512 }),
    botScore: int("bot_score").notNull().default(0),
    adEligible: boolean("ad_eligible").notNull().default(false),
    isAdmin: boolean("is_admin").notNull().default(false),
    isInternal: boolean("is_internal").notNull().default(false),
    turnstilePassed: boolean("turnstile_passed"),
    country: varchar("country", { length: 8 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_events_page_id").on(t.pageId),
    index("idx_events_created_at").on(t.createdAt),
    index("idx_events_type").on(t.eventType),
  ]
);

export type PageEvent = typeof pageEvents.$inferSelect;
export type InsertPageEvent = typeof pageEvents.$inferInsert;

// ─── Page Metrics Daily ───────────────────────────────────────────────────────

export const pageMetricsDaily = mysqlTable(
  "page_metrics_daily",
  {
    id: int("id").autoincrement().primaryKey(),
    pageId: int("page_id").references(() => contentPages.id).notNull(),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
    totalViews: int("total_views").notNull().default(0),
    humanViews: int("human_views").notNull().default(0),
    adEligibleViews: int("ad_eligible_views").notNull().default(0),
    adSlotVisibles: int("ad_slot_visibles").notNull().default(0),
    botViews: int("bot_views").notNull().default(0),
    estimatedRevenueUsd: float("estimated_revenue_usd").notNull().default(0),
    avgBotScore: float("avg_bot_score").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    unique("idx_metrics_page_date").on(t.pageId, t.date),
    index("idx_metrics_date").on(t.date),
  ]
);

export type PageMetricsDaily = typeof pageMetricsDaily.$inferSelect;
export type InsertPageMetricsDaily = typeof pageMetricsDaily.$inferInsert;

// ─── System Settings ──────────────────────────────────────────────────────────

export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedBy: int("updated_by").references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// ─── Admin Audit Log ──────────────────────────────────────────────────────────

export const adminAuditLog = mysqlTable(
  "admin_audit_log",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").references(() => users.id),
    action: varchar("action", { length: 256 }).notNull(),
    target: varchar("target", { length: 256 }),
    details: json("details"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_audit_created_at").on(t.createdAt)]
);

export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type InsertAdminAuditLog = typeof adminAuditLog.$inferInsert;

// ─── Prototype Runs (M0 Evidence Table) ──────────────────────────────────────

export const prototypeRuns = mysqlTable("prototype_runs", {
  id: int("id").autoincrement().primaryKey(),
  runNumber: int("run_number").notNull(),
  topic: varchar("topic", { length: 512 }).notNull(),
  generated: boolean("generated").notNull().default(false),
  decision: mysqlEnum("decision", ["approve", "reject"]),
  publishScore: int("publish_score"),
  safetyScore: int("safety_score"),
  usefulnessScore: int("usefulness_score"),
  readabilityScore: int("readability_score"),
  rendered: boolean("rendered").notNull().default(false),
  estimatedCostUsd: float("estimated_cost_usd"),
  latencyMs: int("latency_ms"),
  notes: text("notes"),
  draftContent: text("draft_content"),
  qualityReasons: json("quality_reasons"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PrototypeRun = typeof prototypeRuns.$inferSelect;
export type InsertPrototypeRun = typeof prototypeRuns.$inferInsert;
