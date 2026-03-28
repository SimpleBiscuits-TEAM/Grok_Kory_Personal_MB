CREATE TABLE `hardware_devices` (
	`id` varchar(36) NOT NULL,
	`hardware_id` varchar(255) NOT NULL,
	`customer_email` varchar(255),
	`customer_name` varchar(255),
	`vehicle_vin` varchar(17),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`registered_at` timestamp DEFAULT (now()),
	`last_request_at` timestamp,
	`total_deliveries` int DEFAULT 0,
	CONSTRAINT `hardware_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `hardware_devices_hardware_id_unique` UNIQUE(`hardware_id`)
);
--> statement-breakpoint
CREATE TABLE `project_comparisons` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`stock_binary_hash` varchar(64),
	`tuned_binary_hash` varchar(64),
	`differences_count` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `project_comparisons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_files` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`file_type` enum('binary','a2l','csv','reference','comparison') NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_size` int,
	`file_hash` varchar(64),
	`s3_key` varchar(500),
	`s3_url` varchar(500),
	`uploaded_at` timestamp DEFAULT (now()),
	CONSTRAINT `project_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_file_hash` UNIQUE(`file_hash`)
);
--> statement-breakpoint
CREATE TABLE `project_metadata` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`current_binary_hash` varchar(64),
	`current_version` int,
	`total_maps_modified` int DEFAULT 0,
	`last_edited_by` varchar(255),
	`last_edited_at` timestamp,
	`checksum_status` enum('valid','invalid','unchecked') DEFAULT 'unchecked',
	`tags` json,
	`notes` text,
	CONSTRAINT `project_metadata_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_metadata_project_id_unique` UNIQUE(`project_id`)
);
--> statement-breakpoint
CREATE TABLE `project_versions` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`version_number` int NOT NULL,
	`binary_hash` varchar(64),
	`changes_summary` text,
	`maps_modified` json,
	`checksums_applied` boolean DEFAULT false,
	`created_by` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `project_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_project_version` UNIQUE(`project_id`,`version_number`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`ecu_family` varchar(100),
	`ecu_id` varchar(100),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`is_archived` boolean DEFAULT false,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tune_deliveries` (
	`id` varchar(36) NOT NULL,
	`tune_library_id` varchar(36) NOT NULL,
	`hardware_id` varchar(255),
	`vehicle_vin` varchar(17),
	`requested_at` timestamp DEFAULT (now()),
	`delivered_at` timestamp,
	`delivery_status` enum('pending','delivered','failed','rejected') DEFAULT 'pending',
	`failure_reason` text,
	`customer_email` varchar(255),
	CONSTRAINT `tune_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tune_library` (
	`id` varchar(36) NOT NULL,
	`vehicle_make` varchar(100) NOT NULL,
	`vehicle_model` varchar(100) NOT NULL,
	`vehicle_year` int,
	`ecu_family` varchar(100) NOT NULL,
	`ecu_part_number` varchar(100) NOT NULL,
	`os_version` varchar(50) NOT NULL,
	`hardware_revision` varchar(50),
	`tune_name` varchar(255) NOT NULL,
	`tune_description` text,
	`tune_version` varchar(50),
	`binary_hash` varchar(64) NOT NULL,
	`a2l_hash` varchar(64),
	`s3_binary_key` varchar(500) NOT NULL,
	`s3_a2l_key` varchar(500),
	`file_size` int,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`is_active` boolean DEFAULT true,
	`created_by` varchar(255),
	CONSTRAINT `tune_library_id` PRIMARY KEY(`id`),
	CONSTRAINT `tune_library_binary_hash_unique` UNIQUE(`binary_hash`)
);
--> statement-breakpoint
ALTER TABLE `project_comparisons` ADD CONSTRAINT `project_comparisons_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_files` ADD CONSTRAINT `project_files_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_metadata` ADD CONSTRAINT `project_metadata_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_versions` ADD CONSTRAINT `project_versions_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tune_deliveries` ADD CONSTRAINT `tune_deliveries_tune_library_id_tune_library_id_fk` FOREIGN KEY (`tune_library_id`) REFERENCES `tune_library`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_hardware_id` ON `hardware_devices` (`hardware_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_email` ON `hardware_devices` (`customer_email`);--> statement-breakpoint
CREATE INDEX `idx_project_comparisons` ON `project_comparisons` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_files` ON `project_files` (`project_id`,`file_type`);--> statement-breakpoint
CREATE INDEX `idx_project_metadata` ON `project_metadata` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_versions` ON `project_versions` (`project_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `idx_user_projects` ON `projects` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_archived` ON `projects` (`is_archived`);--> statement-breakpoint
CREATE INDEX `idx_hardware_deliveries` ON `tune_deliveries` (`hardware_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `idx_vin_deliveries` ON `tune_deliveries` (`vehicle_vin`);--> statement-breakpoint
CREATE INDEX `idx_delivery_status` ON `tune_deliveries` (`delivery_status`);--> statement-breakpoint
CREATE INDEX `idx_tune_match` ON `tune_library` (`vehicle_make`,`vehicle_model`,`ecu_family`,`os_version`);--> statement-breakpoint
CREATE INDEX `idx_ecu_part` ON `tune_library` (`ecu_part_number`,`os_version`);--> statement-breakpoint
CREATE INDEX `idx_active` ON `tune_library` (`is_active`);