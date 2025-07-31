CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text DEFAULT 'anthropic',
	`api_key` text,
	`refresh_token` text NOT NULL,
	`access_token` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`last_used` integer,
	`request_count` integer DEFAULT 0,
	`total_requests` integer DEFAULT 0,
	`account_tier` integer DEFAULT 1,
	`rate_limited_until` integer,
	`session_start` integer,
	`session_request_count` integer DEFAULT 0,
	`paused` integer DEFAULT 0,
	`rate_limit_reset` integer,
	`rate_limit_status` text,
	`rate_limit_remaining` integer
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`account_used` text,
	`status_code` integer,
	`success` integer,
	`error_message` text,
	`response_time_ms` integer,
	`failover_attempts` integer DEFAULT 0,
	`model` text,
	`prompt_tokens` integer DEFAULT 0,
	`completion_tokens` integer DEFAULT 0,
	`total_tokens` integer DEFAULT 0,
	`cost_usd` real DEFAULT 0,
	`output_tokens_per_second` real,
	`input_tokens` integer DEFAULT 0,
	`cache_read_input_tokens` integer DEFAULT 0,
	`cache_creation_input_tokens` integer DEFAULT 0,
	`output_tokens` integer DEFAULT 0,
	`agent_used` text,
	FOREIGN KEY (`account_used`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_requests_timestamp` ON `requests` ("timestamp" desc);--> statement-breakpoint
CREATE INDEX `idx_requests_account_used` ON `requests` (`account_used`);--> statement-breakpoint
CREATE INDEX `idx_requests_timestamp_account` ON `requests` ("timestamp" desc,`account_used`);--> statement-breakpoint
CREATE TABLE `oauth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_name` text NOT NULL,
	`verifier` text NOT NULL,
	`mode` text NOT NULL,
	`tier` integer DEFAULT 1,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_sessions_expires` ON `oauth_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `agent_preferences` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_payloads` (
	`id` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade
);
