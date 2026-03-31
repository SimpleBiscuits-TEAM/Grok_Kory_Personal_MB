CREATE TABLE `knox_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(512) NOT NULL,
	`fileType` varchar(32) NOT NULL,
	`sizeMb` decimal(10,2) NOT NULL,
	`sizeBytes` int NOT NULL,
	`s3Key` varchar(512) NOT NULL,
	`s3Url` text NOT NULL,
	`platform` varchar(256) NOT NULL,
	`ecuId` varchar(128),
	`projectId` varchar(128),
	`projectName` varchar(256),
	`version` varchar(256),
	`epk` text,
	`cpuType` varchar(64),
	`totalCalibratables` int DEFAULT 0,
	`totalMeasurements` int DEFAULT 0,
	`totalFunctions` int DEFAULT 0,
	`analysisJson` json,
	`sourceCollection` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knox_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `drag_profiles` ADD `vehiclePhotoUrl` text;