CREATE TABLE `strat_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`rating` int NOT NULL,
	`comment` text,
	`productCategory` varchar(64),
	`resolved` boolean,
	`messageCount` int,
	`conversationSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `strat_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `flash_sessions` MODIFY COLUMN `connectionMode` enum('simulator','pcan','vop_usb') NOT NULL;--> statement-breakpoint
ALTER TABLE `cloud_enrollments` ADD `programmerSerial` varchar(128);--> statement-breakpoint
ALTER TABLE `cloud_enrollments` ADD `ecuSerial` varchar(128);--> statement-breakpoint
ALTER TABLE `tune_deploy_devices` ADD `ecuSerial` varchar(128);