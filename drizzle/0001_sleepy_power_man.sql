CREATE TABLE `admin_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`action` varchar(256) NOT NULL,
	`target` varchar(256),
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`topic_id` int,
	`slug` varchar(512) NOT NULL,
	`title` varchar(512) NOT NULL,
	`meta_description` text,
	`language` varchar(8) NOT NULL DEFAULT 'en',
	`page_type` varchar(64) NOT NULL DEFAULT 'article',
	`status` enum('draft','reviewing','approved','published','archived','rejected') NOT NULL DEFAULT 'draft',
	`policy_status` enum('pending','approved','flagged','rejected') NOT NULL DEFAULT 'pending',
	`publish_score` int NOT NULL DEFAULT 0,
	`safety_score` int NOT NULL DEFAULT 0,
	`originality_score` int NOT NULL DEFAULT 0,
	`usefulness_score` int NOT NULL DEFAULT 0,
	`coherence_score` int NOT NULL DEFAULT 0,
	`factual_grounding_score` int NOT NULL DEFAULT 0,
	`readability_score` int NOT NULL DEFAULT 0,
	`body_markdown` text NOT NULL,
	`structured_data` json,
	`canonical_page_id` int,
	`version` int NOT NULL DEFAULT 1,
	`rejection_reason` text,
	`quality_decision` enum('approve','retry','merge','reject'),
	`quality_reasons` json,
	`published_at` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_pages_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`topic_id` int,
	`page_id` int,
	`job_type` enum('generate','review','refresh','archive') NOT NULL,
	`status` enum('queued','running','completed','failed','skipped') NOT NULL DEFAULT 'queued',
	`model` varchar(128),
	`provider` varchar(64) DEFAULT 'built-in',
	`prompt_tokens` int DEFAULT 0,
	`completion_tokens` int DEFAULT 0,
	`total_tokens` int DEFAULT 0,
	`estimated_cost_usd` float DEFAULT 0,
	`latency_ms` int,
	`error_message` text,
	`retry_count` int NOT NULL DEFAULT 0,
	`idempotency_key` varchar(128),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generation_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `generation_jobs_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `page_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`page_id` int,
	`event_type` enum('page_view','ad_slot_visible','ad_click_out','bot_blocked') NOT NULL,
	`session_hash` varchar(64),
	`ip_hash` varchar(64),
	`user_agent` varchar(512),
	`referrer` varchar(512),
	`bot_score` int NOT NULL DEFAULT 0,
	`ad_eligible` boolean NOT NULL DEFAULT false,
	`is_admin` boolean NOT NULL DEFAULT false,
	`is_internal` boolean NOT NULL DEFAULT false,
	`turnstile_passed` boolean,
	`country` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `page_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `page_metrics_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`total_views` int NOT NULL DEFAULT 0,
	`human_views` int NOT NULL DEFAULT 0,
	`ad_eligible_views` int NOT NULL DEFAULT 0,
	`ad_slot_visibles` int NOT NULL DEFAULT 0,
	`bot_views` int NOT NULL DEFAULT 0,
	`estimated_revenue_usd` float NOT NULL DEFAULT 0,
	`avg_bot_score` float NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `page_metrics_daily_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_metrics_page_date` UNIQUE(`page_id`,`date`)
);
--> statement-breakpoint
CREATE TABLE `prototype_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_number` int NOT NULL,
	`topic` varchar(512) NOT NULL,
	`generated` boolean NOT NULL DEFAULT false,
	`decision` enum('approve','reject'),
	`publish_score` int,
	`safety_score` int,
	`usefulness_score` int,
	`readability_score` int,
	`rendered` boolean NOT NULL DEFAULT false,
	`estimated_cost_usd` float,
	`latency_ms` int,
	`notes` text,
	`draft_content` text,
	`quality_reasons` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prototype_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updated_by` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(512) NOT NULL,
	`source` varchar(128) NOT NULL,
	`language` varchar(8) NOT NULL DEFAULT 'en',
	`trend_score` int NOT NULL DEFAULT 0,
	`search_intent_score` int NOT NULL DEFAULT 0,
	`content_gap_score` int NOT NULL DEFAULT 0,
	`expected_ad_value_score` int NOT NULL DEFAULT 0,
	`freshness_score` int NOT NULL DEFAULT 0,
	`policy_risk_score` int NOT NULL DEFAULT 0,
	`duplication_score` int NOT NULL DEFAULT 0,
	`opportunity_score` int NOT NULL DEFAULT 0,
	`status` enum('candidate','accepted','rejected','generating','done') NOT NULL DEFAULT 'candidate',
	`rejection_reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topics_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_topics_keyword_language` UNIQUE(`keyword`,`language`)
);
--> statement-breakpoint
ALTER TABLE `admin_audit_log` ADD CONSTRAINT `admin_audit_log_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_pages` ADD CONSTRAINT `content_pages_topic_id_topics_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD CONSTRAINT `generation_jobs_topic_id_topics_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD CONSTRAINT `generation_jobs_page_id_content_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `content_pages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `page_events` ADD CONSTRAINT `page_events_page_id_content_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `content_pages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `page_metrics_daily` ADD CONSTRAINT `page_metrics_daily_page_id_content_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `content_pages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `system_settings` ADD CONSTRAINT `system_settings_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_audit_created_at` ON `admin_audit_log` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_pages_status` ON `content_pages` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pages_published_at` ON `content_pages` (`published_at`);--> statement-breakpoint
CREATE INDEX `idx_pages_topic_id` ON `content_pages` (`topic_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `generation_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_topic_id` ON `generation_jobs` (`topic_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_created_at` ON `generation_jobs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_events_page_id` ON `page_events` (`page_id`);--> statement-breakpoint
CREATE INDEX `idx_events_created_at` ON `page_events` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_events_type` ON `page_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_metrics_date` ON `page_metrics_daily` (`date`);--> statement-breakpoint
CREATE INDEX `idx_topics_status_score` ON `topics` (`status`,`opportunity_score`);