ALTER TABLE `users` ADD `advancedAccess` enum('none','pending','approved','revoked') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `accessLevel` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `accessApprovedBy` int;--> statement-breakpoint
ALTER TABLE `users` ADD `accessApprovedAt` timestamp;