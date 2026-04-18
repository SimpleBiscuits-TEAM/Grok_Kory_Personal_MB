CREATE TABLE `auto_deploy_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`deviceId` int,
	`deployType` enum('combo','ecm_only','tcm_only') NOT NULL,
	`comboId` int,
	`ecmCalibrationId` int,
	`tcmCalibrationId` int,
	`vehicleEcmOs` varchar(256),
	`vehicleTcmOs` varchar(256),
	`vehiclePartNumbers` text,
	`userAccessLevel` int,
	`result` enum('success','no_match','access_denied','error') NOT NULL,
	`resultMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auto_deploy_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calibration_auto_deploy_meta` (
	`id` int AUTO_INCREMENT NOT NULL,
	`calibrationId` int NOT NULL,
	`folderId` int,
	`moduleType` enum('ecm','tcm') NOT NULL DEFAULT 'ecm',
	`autoDeploy` boolean NOT NULL DEFAULT false,
	`autoDeployAccessLevel` int NOT NULL DEFAULT 1,
	`notes` text,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calibration_auto_deploy_meta_id` PRIMARY KEY(`id`),
	CONSTRAINT `calibration_auto_deploy_meta_calibrationId_unique` UNIQUE(`calibrationId`)
);
--> statement-breakpoint
CREATE TABLE `calibration_combos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ecmCalibrationId` int NOT NULL,
	`tcmCalibrationId` int NOT NULL,
	`label` varchar(512),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calibration_combos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calibration_folders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentId` int,
	`name` varchar(255) NOT NULL,
	`folderType` enum('vehicle_type','os','part_number','custom') NOT NULL DEFAULT 'custom',
	`fullPath` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calibration_folders_id` PRIMARY KEY(`id`)
);
