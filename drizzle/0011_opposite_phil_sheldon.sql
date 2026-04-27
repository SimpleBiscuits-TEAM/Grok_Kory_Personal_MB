CREATE TABLE `stream_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`eventType` enum('event_marker','code_clear','code_read','override_start','override_end','connection','error') NOT NULL,
	`data` json,
	`label` varchar(255),
	`success` boolean,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stream_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stream_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`shareKey` varchar(64) NOT NULL,
	`streamStatus` enum('connecting','scanning','live','paused','ended') NOT NULL DEFAULT 'connecting',
	`stormChaseActive` boolean NOT NULL DEFAULT false,
	`settings` json,
	`summary` json,
	`emergencyOverrideActive` boolean NOT NULL DEFAULT false,
	`emergencyOverrideStartedAt` timestamp,
	`peakViewerCount` int NOT NULL DEFAULT 0,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stream_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `stream_sessions_shareKey_unique` UNIQUE(`shareKey`)
);
--> statement-breakpoint
CREATE TABLE `stream_telemetry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`data` json,
	`healthStatus` enum('green','yellow','red') DEFAULT 'green',
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stream_telemetry_id` PRIMARY KEY(`id`)
);
