CREATE TABLE `admin_audit_log` (
	`id` varchar(36) NOT NULL,
	`admin_id` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`target_type` varchar(50),
	`target_id` varchar(255),
	`details` text,
	`ip_address` varchar(45),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `admin_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `erika_map_changes` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`project_id` varchar(36),
	`map_name` varchar(255) NOT NULL,
	`map_address` int,
	`change_type` varchar(50) NOT NULL,
	`change_description` text NOT NULL,
	`original_values` json,
	`proposed_values` json,
	`cell_range` json,
	`reasoning` text,
	`status` enum('pending','approved','rejected','auto_approved') DEFAULT 'pending',
	`approved_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `erika_map_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `geofence_zones` (
	`id` varchar(36) NOT NULL,
	`created_by` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`polygon_coords` json NOT NULL,
	`scope` enum('global','tuner') DEFAULT 'tuner',
	`block_upload` boolean DEFAULT true,
	`block_download` boolean DEFAULT true,
	`restricted_user_id` int,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `geofence_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tune_shares` (
	`id` varchar(36) NOT NULL,
	`tune_id` varchar(36) NOT NULL,
	`owner_id` int NOT NULL,
	`shared_with_id` int NOT NULL,
	`permission` enum('view','download','edit') DEFAULT 'view',
	`expires_at` timestamp,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `tune_shares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_map_layouts` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`ecu_family` varchar(100),
	`map_list` json NOT NULL,
	`is_default` boolean DEFAULT false,
	`sort_order` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_map_layouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `admin_audit_log` ADD CONSTRAINT `admin_audit_log_admin_id_users_id_fk` FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `erika_map_changes` ADD CONSTRAINT `erika_map_changes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `erika_map_changes` ADD CONSTRAINT `erika_map_changes_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `geofence_zones` ADD CONSTRAINT `geofence_zones_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `geofence_zones` ADD CONSTRAINT `geofence_zones_restricted_user_id_users_id_fk` FOREIGN KEY (`restricted_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tune_shares` ADD CONSTRAINT `tune_shares_tune_id_saved_tunes_id_fk` FOREIGN KEY (`tune_id`) REFERENCES `saved_tunes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tune_shares` ADD CONSTRAINT `tune_shares_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tune_shares` ADD CONSTRAINT `tune_shares_shared_with_id_users_id_fk` FOREIGN KEY (`shared_with_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_map_layouts` ADD CONSTRAINT `user_map_layouts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_admin_action` ON `admin_audit_log` (`admin_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_target` ON `admin_audit_log` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_erika_user_changes` ON `erika_map_changes` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_erika_project_changes` ON `erika_map_changes` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_geofence_created_by` ON `geofence_zones` (`created_by`);--> statement-breakpoint
CREATE INDEX `idx_geofence_scope` ON `geofence_zones` (`scope`,`is_active`);--> statement-breakpoint
CREATE INDEX `idx_tune_share` ON `tune_shares` (`tune_id`,`shared_with_id`);--> statement-breakpoint
CREATE INDEX `idx_owner_shares` ON `tune_shares` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_shared_with` ON `tune_shares` (`shared_with_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `idx_user_layouts` ON `user_map_layouts` (`user_id`,`ecu_family`);--> statement-breakpoint
CREATE INDEX `idx_default_layout` ON `user_map_layouts` (`user_id`,`is_default`);