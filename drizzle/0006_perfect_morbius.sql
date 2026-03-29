CREATE TABLE `support_metrics` (
	`id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`response_time` int,
	`resolution_status` enum('resolved','partial','escalated','pending') DEFAULT 'pending',
	`resolution_notes` text,
	`customer_satisfaction` int,
	`customer_feedback` text,
	`total_participants` int,
	`total_duration` int,
	`screen_share_time` int,
	`audio_time` int,
	`video_time` int,
	`chat_messages` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `support_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_session_recordings` (
	`id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`screen_recording_url` varchar(500),
	`webcam_recording_url` varchar(500),
	`audio_recording_url` varchar(500),
	`combined_video_url` varchar(500),
	`chat_transcript` json,
	`duration` int,
	`file_size` varchar(50),
	`is_educational` boolean DEFAULT false,
	`course_title` varchar(255),
	`course_topic` varchar(255),
	`tags` json,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `support_session_recordings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_sessions` (
	`id` varchar(36) NOT NULL,
	`invite_link` varchar(255) NOT NULL,
	`created_by` int NOT NULL,
	`customer_name` varchar(255) NOT NULL,
	`customer_email` varchar(255),
	`status` enum('active','ended','expired') DEFAULT 'active',
	`expires_at` timestamp NOT NULL,
	`started_at` timestamp,
	`ended_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `support_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `support_sessions_invite_link_unique` UNIQUE(`invite_link`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','super_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `support_metrics` ADD CONSTRAINT `support_metrics_session_id_support_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `support_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_session_recordings` ADD CONSTRAINT `support_session_recordings_session_id_support_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `support_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_sessions` ADD CONSTRAINT `support_sessions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_metrics_session` ON `support_metrics` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_metrics_resolution` ON `support_metrics` (`resolution_status`);--> statement-breakpoint
CREATE INDEX `idx_recording_session` ON `support_session_recordings` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_recording_educational` ON `support_session_recordings` (`is_educational`);--> statement-breakpoint
CREATE INDEX `idx_recording_topic` ON `support_session_recordings` (`course_topic`);--> statement-breakpoint
CREATE INDEX `idx_support_created_by` ON `support_sessions` (`created_by`);--> statement-breakpoint
CREATE INDEX `idx_support_status` ON `support_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_support_invite_link` ON `support_sessions` (`invite_link`);