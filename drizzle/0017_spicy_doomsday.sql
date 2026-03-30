CREATE TABLE `drag_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challengerId` int NOT NULL,
	`opponentId` int,
	`status` enum('open','accepted','challenger_submitted','opponent_submitted','complete','cancelled','expired') NOT NULL DEFAULT 'open',
	`challengeType` enum('eighth','quarter') NOT NULL DEFAULT 'quarter',
	`entryFee` decimal(10,2) DEFAULT '0',
	`prizePool` decimal(10,2) DEFAULT '0',
	`platformFee` decimal(10,2) DEFAULT '0',
	`challengerRunId` int,
	`opponentRunId` int,
	`winnerId` int,
	`animationUrl` text,
	`expiresAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drag_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_leaderboard` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`category` varchar(64) NOT NULL,
	`vehicleClass` varchar(64) DEFAULT 'open',
	`bestValue` decimal(8,4) NOT NULL,
	`runId` int NOT NULL,
	`season` varchar(16),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drag_leaderboard_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`vehicleDesc` varchar(255),
	`vehicleClass` varchar(64),
	`bestEt` decimal(6,4),
	`bestMph` decimal(6,2),
	`totalRuns` int DEFAULT 0,
	`wins` int DEFAULT 0,
	`losses` int DEFAULT 0,
	`elo` int DEFAULT 1200,
	`subscriptionStatus` enum('none','active','expired','cancelled') NOT NULL DEFAULT 'none',
	`subscriptionExpiresAt` timestamp,
	`avatarUrl` text,
	`bio` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drag_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`runType` enum('eighth','quarter') NOT NULL DEFAULT 'quarter',
	`reactionTime` decimal(5,4),
	`sixtyFt` decimal(5,4),
	`threeThirtyFt` decimal(5,4),
	`eighthEt` decimal(6,4),
	`eighthMph` decimal(6,2),
	`thousandFt` decimal(6,4),
	`quarterEt` decimal(6,4),
	`quarterMph` decimal(6,2),
	`peakBoost` decimal(5,1),
	`peakEgt` decimal(6,1),
	`peakRpm` int,
	`intakeTemp` decimal(5,1),
	`ambientTemp` decimal(5,1),
	`densityAltitude` int,
	`dataSource` enum('vop_obd','manual','dragy','racepak') NOT NULL DEFAULT 'vop_obd',
	`rawDataUrl` text,
	`aiReport` text,
	`timeslipUrl` text,
	`isVerified` boolean DEFAULT false,
	`verificationHash` varchar(64),
	`trackName` varchar(255),
	`trackLocation` varchar(255),
	`weatherConditions` varchar(128),
	`notes` text,
	`isPublic` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drag_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_tournaments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`tournamentType` enum('bracket','best_et','king_of_hill') NOT NULL DEFAULT 'bracket',
	`raceType` enum('eighth','quarter') NOT NULL DEFAULT 'quarter',
	`vehicleClass` varchar(64),
	`maxParticipants` int DEFAULT 32,
	`currentParticipants` int DEFAULT 0,
	`entryFee` decimal(10,2) DEFAULT '0',
	`prizePool` decimal(10,2) DEFAULT '0',
	`status` enum('registration','active','complete','cancelled') NOT NULL DEFAULT 'registration',
	`rules` text,
	`startDate` timestamp,
	`endDate` timestamp,
	`winnerId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drag_tournaments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forum_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`description` text,
	`icon` varchar(64),
	`color` varchar(32),
	`sortOrder` int DEFAULT 0,
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forum_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `forum_categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `forum_channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`description` text,
	`createdBy` int NOT NULL,
	`isOfficial` boolean DEFAULT false,
	`isPinned` boolean DEFAULT false,
	`memberCount` int DEFAULT 0,
	`postCount` int DEFAULT 0,
	`lastActivityAt` timestamp DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forum_channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forum_likes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`postId` int,
	`threadId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forum_likes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forum_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`channelId` int NOT NULL,
	`role` enum('member','moderator','owner') NOT NULL DEFAULT 'member',
	`notificationsEnabled` boolean DEFAULT true,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forum_memberships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forum_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`authorId` int NOT NULL,
	`content` text NOT NULL,
	`replyToId` int,
	`likeCount` int DEFAULT 0,
	`isEdited` boolean DEFAULT false,
	`editedAt` timestamp,
	`imageUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forum_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forum_threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` int NOT NULL,
	`authorId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`isPinned` boolean DEFAULT false,
	`isLocked` boolean DEFAULT false,
	`viewCount` int DEFAULT 0,
	`replyCount` int DEFAULT 0,
	`likeCount` int DEFAULT 0,
	`lastReplyAt` timestamp,
	`lastReplyBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `forum_threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `waitlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255),
	`interest` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waitlist_id` PRIMARY KEY(`id`)
);
