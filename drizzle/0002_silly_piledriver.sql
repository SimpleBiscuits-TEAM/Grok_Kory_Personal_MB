CREATE TABLE `ecu_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`snapshotType` enum('pre_flash','post_flash') NOT NULL,
	`ecuType` varchar(32) NOT NULL,
	`vin` varchar(32),
	`softwareVersions` json,
	`hardwareNumber` varchar(64),
	`dtcSnapshot` json,
	`didResponses` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ecu_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `file_fingerprints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileHash` varchar(64) NOT NULL,
	`ecuType` varchar(32) NOT NULL,
	`fileName` varchar(256),
	`fileSize` int,
	`flashCount` int NOT NULL DEFAULT 0,
	`lastSessionId` int,
	`lastResult` enum('success','failed'),
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `file_fingerprints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flash_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ecuType` varchar(32) NOT NULL,
	`flashMode` enum('full_flash','calibration','patch_only') NOT NULL,
	`status` enum('queued','processing','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`priority` int NOT NULL DEFAULT 10,
	`fileHash` varchar(64),
	`fileUrl` varchar(512),
	`fileName` varchar(256),
	`sessionId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flash_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flash_session_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`timestampMs` int NOT NULL,
	`phase` varchar(32) NOT NULL,
	`type` varchar(16) NOT NULL,
	`message` text NOT NULL,
	`blockId` int,
	`nrcCode` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flash_session_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flash_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uuid` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`ecuType` varchar(32) NOT NULL,
	`ecuName` varchar(128),
	`flashMode` enum('full_flash','calibration','patch_only') NOT NULL,
	`connectionMode` enum('simulator','pcan') NOT NULL,
	`status` enum('pending','running','success','failed','aborted') NOT NULL DEFAULT 'pending',
	`fileHash` varchar(64),
	`fileName` varchar(256),
	`fileSize` int,
	`vin` varchar(32),
	`fileId` varchar(128),
	`totalBlocks` int DEFAULT 0,
	`totalBytes` int DEFAULT 0,
	`progress` int DEFAULT 0,
	`durationMs` int,
	`errorMessage` text,
	`nrcCode` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flash_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `flash_sessions_uuid_unique` UNIQUE(`uuid`)
);
--> statement-breakpoint
CREATE TABLE `flash_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ecuType` varchar(32) NOT NULL,
	`totalAttempts` int NOT NULL DEFAULT 0,
	`successCount` int NOT NULL DEFAULT 0,
	`failCount` int NOT NULL DEFAULT 0,
	`avgDurationMs` int DEFAULT 0,
	`lastFlashAt` timestamp,
	`commonNrc` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flash_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `calibration_values` DROP FOREIGN KEY `cal_values_char_id_cal_chars_id_fk`;
--> statement-breakpoint
ALTER TABLE `calibration_values` ADD CONSTRAINT `calibration_values_characteristic_id_calibration_characteristics_id_fk` FOREIGN KEY (`characteristic_id`) REFERENCES `calibration_characteristics`(`id`) ON DELETE no action ON UPDATE no action;