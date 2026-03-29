CREATE TABLE `offset_correction_history` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`ecuId` varchar(255) NOT NULL,
	`vehicleType` varchar(255) NOT NULL,
	`offsetDelta` int NOT NULL,
	`confidence` int NOT NULL,
	`status` enum('applied','failed','manual') NOT NULL,
	`notes` text,
	`appliedAt` bigint NOT NULL,
	CONSTRAINT `offset_correction_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `offset_profiles` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`ecuId` varchar(255) NOT NULL,
	`vehicleType` varchar(255) NOT NULL,
	`offsetDelta` int NOT NULL,
	`confidence` int NOT NULL,
	`tableSignaturesMatched` text NOT NULL,
	`notes` text,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `offset_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_history_user` ON `offset_correction_history` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_history_ecu` ON `offset_correction_history` (`ecuId`);--> statement-breakpoint
CREATE INDEX `idx_history_status` ON `offset_correction_history` (`status`);--> statement-breakpoint
CREATE INDEX `idx_history_applied` ON `offset_correction_history` (`appliedAt`);--> statement-breakpoint
CREATE INDEX `idx_offset_user` ON `offset_profiles` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_offset_ecu` ON `offset_profiles` (`ecuId`);--> statement-breakpoint
CREATE INDEX `idx_offset_vehicle` ON `offset_profiles` (`vehicleType`);--> statement-breakpoint
CREATE INDEX `idx_offset_user_ecu_vehicle` ON `offset_profiles` (`userId`,`ecuId`,`vehicleType`);