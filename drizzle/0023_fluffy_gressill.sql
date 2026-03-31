CREATE TABLE `share_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`allowedPath` varchar(512) NOT NULL,
	`label` varchar(255),
	`createdBy` int,
	`consumed` boolean NOT NULL DEFAULT false,
	`consumedAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `share_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `share_tokens_token_unique` UNIQUE(`token`)
);
