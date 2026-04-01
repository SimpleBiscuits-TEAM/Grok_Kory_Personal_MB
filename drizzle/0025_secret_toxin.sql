CREATE TABLE `pitch_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`eventType` enum('tab_view','chat_message','prompt_click','session_end') NOT NULL,
	`metadata` json,
	`sessionId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pitch_analytics_id` PRIMARY KEY(`id`)
);
