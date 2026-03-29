CREATE TABLE `debug_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`actorId` int,
	`actorType` enum('user','admin','erika','system') NOT NULL,
	`action` varchar(128) NOT NULL,
	`details` text,
	`tokensUsed` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `debug_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `debug_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`grantedBy` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`tokenBudget` int DEFAULT 5000,
	`tokensUsed` int DEFAULT 0,
	`note` text,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `debug_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `debug_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`status` enum('submitted','analyzing','tier1_auto_fix','tier2_pending','tier2_approved','tier2_rejected','fixing','awaiting_retest','confirmed_fixed','still_broken','escalated','closed') NOT NULL DEFAULT 'submitted',
	`tier` enum('tier1','tier2') DEFAULT 'tier1',
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`stepsToReproduce` text,
	`expectedBehavior` text,
	`actualBehavior` text,
	`featureArea` varchar(128),
	`screenshotUrl` text,
	`browserInfo` text,
	`analysisResult` text,
	`rootCause` text,
	`proposedFix` text,
	`fixApplied` text,
	`estimatedTokens` int,
	`actualTokens` int,
	`retestFeedback` text,
	`retestCount` int DEFAULT 0,
	`reviewedBy` int,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`resolvedAt` timestamp,
	CONSTRAINT `debug_sessions_id` PRIMARY KEY(`id`)
);
