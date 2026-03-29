CREATE TABLE `generated_a2l` (
	`id` int AUTO_INCREMENT NOT NULL,
	`osNumber` varchar(32) NOT NULL,
	`ecuFamily` varchar(64) NOT NULL,
	`version` varchar(32) NOT NULL DEFAULT '1.0.0',
	`a2lContent` text NOT NULL,
	`fileSize` int NOT NULL,
	`mapCount` int NOT NULL,
	`confidence` decimal(3,2) NOT NULL,
	`binaryHash` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generated_a2l_id` PRIMARY KEY(`id`),
	CONSTRAINT `generated_a2l_osNumber_unique` UNIQUE(`osNumber`)
);
--> statement-breakpoint
CREATE TABLE `mara_map_changes` (
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
	CONSTRAINT `mara_map_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP TABLE `erika_map_changes`;--> statement-breakpoint
ALTER TABLE `debug_audit_log` MODIFY COLUMN `actorType` enum('user','admin','mara','system') NOT NULL;--> statement-breakpoint
ALTER TABLE `mara_map_changes` ADD CONSTRAINT `mara_map_changes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mara_map_changes` ADD CONSTRAINT `mara_map_changes_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_mara_user_changes` ON `mara_map_changes` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_mara_project_changes` ON `mara_map_changes` (`project_id`);