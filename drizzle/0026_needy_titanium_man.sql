CREATE TABLE `geofence_user_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`zoneId` int,
	`overrideType` enum('exempt','enforce') NOT NULL DEFAULT 'exempt',
	`reason` text,
	`grantedBy` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `geofence_user_overrides_id` PRIMARY KEY(`id`)
);
