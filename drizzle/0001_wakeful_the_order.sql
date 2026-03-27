CREATE TABLE `feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('feedback','error') NOT NULL,
	`name` varchar(255),
	`email` varchar(320),
	`rating` int,
	`message` text NOT NULL,
	`errorType` varchar(255),
	`stepsToReproduce` text,
	`context` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feedback_id` PRIMARY KEY(`id`)
);
