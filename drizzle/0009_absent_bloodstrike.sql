CREATE TABLE `qa_checklists` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`version` varchar(32),
	`createdBy` int NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	`status` enum('active','completed','archived') NOT NULL DEFAULT 'active',
	CONSTRAINT `qa_checklists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qa_item_comments` (
	`id` varchar(64) NOT NULL,
	`testItemId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`message` text NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `qa_item_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qa_test_items` (
	`id` varchar(64) NOT NULL,
	`checklistId` varchar(64) NOT NULL,
	`category` varchar(100) NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`status` enum('pending','pass','fail','blocked','skipped') NOT NULL DEFAULT 'pending',
	`assignedTo` int,
	`testedBy` int,
	`testedAt` bigint,
	`comment` text,
	`errorDetails` text,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `qa_test_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_notification_prefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`enablePush` boolean NOT NULL DEFAULT true,
	`enableWhatsNew` boolean NOT NULL DEFAULT true,
	`minPriority` enum('low','medium','high','critical') NOT NULL DEFAULT 'low',
	`mutedUntil` bigint,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `user_notification_prefs_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_notification_prefs_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `idx_qa_checklist_status` ON `qa_checklists` (`status`);--> statement-breakpoint
CREATE INDEX `idx_qa_checklist_created_by` ON `qa_checklists` (`createdBy`);--> statement-breakpoint
CREATE INDEX `idx_qa_comment_item` ON `qa_item_comments` (`testItemId`);--> statement-breakpoint
CREATE INDEX `idx_qa_comment_user` ON `qa_item_comments` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_qa_item_checklist` ON `qa_test_items` (`checklistId`);--> statement-breakpoint
CREATE INDEX `idx_qa_item_status` ON `qa_test_items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_qa_item_category` ON `qa_test_items` (`category`);--> statement-breakpoint
CREATE INDEX `idx_qa_item_assigned` ON `qa_test_items` (`assignedTo`);--> statement-breakpoint
CREATE INDEX `idx_notif_prefs_user` ON `user_notification_prefs` (`userId`);