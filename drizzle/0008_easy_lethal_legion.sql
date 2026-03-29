CREATE TABLE `admin_notifications` (
	`id` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`description` text,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('draft','scheduled','sent','archived') NOT NULL DEFAULT 'draft',
	`createdBy` int NOT NULL,
	`createdAt` bigint NOT NULL,
	`scheduledFor` bigint,
	`sentAt` bigint,
	`expiresAt` bigint,
	`actionLabel` varchar(255),
	`actionUrl` varchar(512),
	`targetAudience` enum('all','admins','users') NOT NULL DEFAULT 'all',
	CONSTRAINT `admin_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` varchar(64) NOT NULL,
	`notificationId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','delivered','read','dismissed') NOT NULL DEFAULT 'pending',
	`deliveredAt` bigint,
	`readAt` bigint,
	`dismissedAt` bigint,
	`actionClickedAt` bigint,
	CONSTRAINT `notification_deliveries_id` PRIMARY KEY(`id`)
);
