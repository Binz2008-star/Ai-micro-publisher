# AI Micro-Publisher TODO

## Milestone 0 (CURRENT — must complete before anything else)
- [x] Hardcoded prototype topic brief (JSON constant in server)
- [x] LLM draft generation tRPC procedure (generateDraft)
- [x] Quality gate function: publish_score, safety_score, usefulness_score, readability_score
- [x] Approve/reject decision logic (thresholds: publish>=75, safety>=95, usefulness>=75, readability>=70)
- [x] Staging page /prototype: shows brief, generate button, scores, decision, rendered draft
- [x] 5-run evidence table: run number, generated, decision, scores, cost, latency, rendered, notes
- [x] Unit tests for quality gate scoring and thresholds (18 tests, all passing)

## Milestone 1 (CURRENT — infrastructure)
- [x] Apply full DB schema migrations (topics, content_pages, generation_jobs, page_events, page_metrics_daily, system_settings, admin_audit_log, prototype_runs)
- [x] Seed system_settings with default runtime config
- [x] Install BullMQ + ioredis, configure queue connection
- [x] Queue service: publisher.ts (enqueue jobs)
- [x] Worker bootstrap: base worker class with retry/backoff
- [x] Stub workers: topic-discovery, content-generation, quality-review, publish-pages, analytics-rollup
- [x] /api/health endpoint: DB ping, queue ping, worker status, uptime (responds in <250ms with or without Redis)
- [x] adminProcedure middleware (role === 'admin' gate)
- [x] Admin audit log helper (logAdminAction)
- [x] Admin-only tRPC router with system status procedure
- [x] GitHub Actions CI: pnpm install, pnpm test, pnpm check (yml ready, push via GitHub UI due to token scope)
- [x] M1 integration tests: DB connection, queue enqueue/dequeue config, health endpoint, admin gate (34/34 passing)
- [ ] BLOCKER: Real Redis/Valkey required for queue execution proof before M1 GO
- [ ] Queue execution proof: enqueue job, worker pickup, intentional failure, retry/backoff, final status
- [x] Push M1 infrastructure code to GitHub (pending queue proof commit)

## Milestone 2 (CURRENT — topic discovery)
- [ ] Topic scoring engine: trend, search_intent, content_gap, ad_value, freshness, policy_risk, duplication, opportunity
- [ ] Policy risk keyword blocklist
- [ ] Seeded keyword list (safe, high-value utility topics)
- [ ] RSS feed ingestion (HackerNews, Reddit, Google Trends RSS)
- [ ] Seasonal calendar topics (month-aware)
- [ ] Keyword normalization (lowercase, trim, dedup)
- [ ] Duplicate-safe upsert into topics table
- [ ] TopicDiscoveryWorker: replace stub with real implementation
- [ ] Admin topic candidate tRPC procedures (list, accept, reject)
- [ ] Admin topic candidate UI: table with scores, status, rejection reasons
- [ ] M2 unit tests: scoring formula, policy risk, dedup logic
- [ ] Push M2 to GitHub

## Milestone 3 (CURRENT — content generation)
- [ ] Structured brief generator: topic → content brief (sections, tone, max_words, blocked_claims)
- [ ] ContentGenerationWorker: replace stub with real implementation
- [ ] LLM draft generation using built-in invokeLLM
- [ ] Version tracking: store multiple drafts per topic in content_pages
- [ ] Generation job audit trail: model, tokens, cost estimate, latency, errors
- [ ] Daily spend limit enforcement: check system_settings.daily_spend_limit_usd
- [ ] Daily spend aggregation: sum generation_jobs.estimated_cost_usd per day
- [ ] Admin generation status tRPC procedures (list jobs, spend summary, draft preview)
- [ ] Admin generation UI: job table, spend tracker, draft preview panel
- [ ] M3 unit tests: brief generator, cost estimation, spend limit logic
- [ ] Push M3 to GitHub

## Milestone 4 (CURRENT — quality gate, controlled mode)
- [ ] Stage 1 heuristic checker: readability, metadata, headings, keyword density, length, duplicate slug
- [ ] Stage 2 LLM reviewer: usefulness, coherence, factual caution, safety → JSON structured output
- [ ] Quality decision engine: approve/retry/merge/reject with reasons
- [ ] Quality review runner: apply both stages, update content_pages scores
- [ ] Update content_pages: publish_score, safety_score, originality_score, usefulness_score, coherence_score, factual_grounding_score, readability_score, policy_status, quality_decision, quality_reasons
- [ ] Admin quality review tRPC procedures: list pending, get review detail, manual override
- [ ] Admin quality review UI: pending drafts, scores, decision, rejection reasons
- [ ] M4 unit tests: unsafe rejected, duplicate merge-suggested, thin rejected, good approved, borderline retry
- [ ] Run quality review on all 6 existing drafts and capture evidence
- [ ] Push M4 to GitHub

## Post-M4 (BLOCKED until M4 GO decision)
- [ ] SEO publishing worker (M5)
- [ ] Content generation pipeline with version tracking (M3)
- [ ] Two-stage quality gate (M4)
- [ ] SEO publishing worker (M5)
- [ ] Bot protection + ad eligibility (M6)
- [ ] Analytics pipeline (M7)
- [ ] Admin dashboard (M7)
- [ ] Emergency control panel (M7)
