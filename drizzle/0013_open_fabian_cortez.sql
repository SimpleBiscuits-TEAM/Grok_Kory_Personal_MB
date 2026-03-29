CREATE TABLE `admin_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`adminId` int NOT NULL,
	`subject` varchar(255) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`isRead` boolean NOT NULL DEFAULT false,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admin_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderId` int NOT NULL,
	`senderType` enum('admin','user') NOT NULL,
	`content` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_messages_id` PRIMARY KEY(`id`)
);
