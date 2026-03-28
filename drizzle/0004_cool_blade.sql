CREATE TABLE `saved_tunes` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`folder_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`description` text,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`ecu_family` varchar(100),
	`ecu_id` varchar(100),
	`os_version` varchar(50),
	`ecu_part_number` varchar(100),
	`binary_hash` varchar(64),
	`a2l_hash` varchar(64),
	`s3_binary_key` varchar(500),
	`s3_binary_url` varchar(500),
	`s3_a2l_key` varchar(500),
	`s3_a2l_url` varchar(500),
	`file_size` int,
	`tune_stage` varchar(50),
	`power_level` varchar(100),
	`fuel_type` varchar(50),
	`modifications` text,
	`checksum_status` enum('valid','invalid','unchecked') DEFAULT 'unchecked',
	`is_dispatch_ready` boolean DEFAULT false,
	`dispatch_priority` int DEFAULT 0,
	`tags` json,
	`notes` text,
	`is_favorite` boolean DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_tunes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tune_folders` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`parent_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`folder_type` enum('root','make','model','year','ecu_family','ecu_variant','custom') DEFAULT 'custom',
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`ecu_family` varchar(100),
	`ecu_variant` varchar(100),
	`os_version` varchar(50),
	`ecu_part_number` varchar(100),
	`hardware_revision` varchar(50),
	`sort_order` int DEFAULT 0,
	`is_auto_generated` boolean DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tune_folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `saved_tunes` ADD CONSTRAINT `saved_tunes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_tunes` ADD CONSTRAINT `saved_tunes_folder_id_tune_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `tune_folders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tune_folders` ADD CONSTRAINT `tune_folders_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_user_tunes` ON `saved_tunes` (`user_id`,`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_dispatch_match` ON `saved_tunes` (`vehicle_make`,`vehicle_model`,`ecu_family`,`os_version`,`ecu_part_number`);--> statement-breakpoint
CREATE INDEX `idx_favorite` ON `saved_tunes` (`user_id`,`is_favorite`);--> statement-breakpoint
CREATE INDEX `idx_dispatch_ready` ON `saved_tunes` (`is_dispatch_ready`,`dispatch_priority`);--> statement-breakpoint
CREATE INDEX `idx_user_folders` ON `tune_folders` (`user_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_folder_type` ON `tune_folders` (`folder_type`);--> statement-breakpoint
CREATE INDEX `idx_auto_match` ON `tune_folders` (`vehicle_make`,`vehicle_model`,`ecu_family`);