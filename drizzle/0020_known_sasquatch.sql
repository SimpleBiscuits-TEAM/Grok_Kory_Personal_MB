CREATE TABLE `cast_chat` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int,
	`platform` varchar(64),
	`username` varchar(128) NOT NULL,
	`message` text NOT NULL,
	`type` enum('chat','system','ai_host','highlight','question') NOT NULL DEFAULT 'chat',
	`pinned` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cast_chat_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cast_dyno_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`rpm` decimal(10,2),
	`hp` decimal(10,2),
	`torque` decimal(10,2),
	`boost` decimal(10,2),
	`egt` decimal(10,2),
	`speed` decimal(10,2),
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cast_dyno_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cast_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`description` text,
	`bannerUrl` text,
	`vehicleInfo` json,
	`scheduledAt` timestamp NOT NULL,
	`estimatedDuration` int DEFAULT 60,
	`status` enum('upcoming','live','completed','cancelled') NOT NULL DEFAULT 'upcoming',
	`sessionId` int,
	`rsvpCount` int DEFAULT 0,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cast_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cast_reactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int,
	`reaction` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cast_reactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cast_rsvps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cast_rsvps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cast_seat_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','approved','denied') NOT NULL DEFAULT 'pending',
	`requestedSection` enum('front_row','lower_bowl') NOT NULL DEFAULT 'front_row',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cast_seat_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cast_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`description` text,
	`mode` enum('standard','dyno','event') NOT NULL DEFAULT 'standard',
	`status` enum('scheduled','lobby','live','ended') NOT NULL DEFAULT 'scheduled',
	`hostId` int NOT NULL,
	`eventId` int,
	`mediaConfig` json,
	`activePlatforms` json,
	`dynoConfig` json,
	`peakStats` json,
	`vodUrl` text,
	`peakViewers` int DEFAULT 0,
	`totalUniqueViewers` int DEFAULT 0,
	`startedAt` timestamp,
	`endedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cast_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cast_viewers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int NOT NULL,
	`seatSection` enum('front_row','lower_bowl','upper_deck','skybox') NOT NULL DEFAULT 'upper_deck',
	`seatIndex` int NOT NULL DEFAULT 0,
	`cameraOn` boolean NOT NULL DEFAULT false,
	`peerId` varchar(128),
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`leftAt` timestamp,
	CONSTRAINT `cast_viewers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stream_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`rtmpUrl` text NOT NULL,
	`streamKey` text NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stream_keys_id` PRIMARY KEY(`id`)
);
