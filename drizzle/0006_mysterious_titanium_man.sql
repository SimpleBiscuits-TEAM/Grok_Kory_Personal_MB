CREATE TABLE `tune_deploy_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`calibrationId` int NOT NULL,
	`deviceId` int NOT NULL,
	`status` enum('pending','deployed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`notes` text,
	`deployedAt` timestamp,
	`assignedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tune_deploy_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tune_deploy_calibrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`r2Key` varchar(512) NOT NULL,
	`storageUrl` text,
	`sha256` varchar(64) NOT NULL,
	`sizeBytes` int NOT NULL,
	`vehicleFamily` varchar(128) NOT NULL,
	`vehicleSubType` varchar(128) NOT NULL,
	`modelYear` int,
	`osVersion` varchar(256),
	`ecuType` varchar(128),
	`ecuHardwareId` varchar(128),
	`partNumbersCsv` text,
	`parsedMeta` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tune_deploy_calibrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tune_deploy_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceType` enum('vop','pcan') NOT NULL,
	`serialNumber` varchar(128) NOT NULL,
	`label` varchar(255),
	`vehicleDescription` varchar(512),
	`vin` varchar(17),
	`lastSeenAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tune_deploy_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `tune_deploy_devices_serialNumber_unique` UNIQUE(`serialNumber`)
);
