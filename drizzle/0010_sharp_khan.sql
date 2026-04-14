CREATE TABLE `task_overrides` (
	`taskId` varchar(128) NOT NULL,
	`status` varchar(32),
	`notes` text,
	`sectionOverride` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_overrides_taskId` PRIMARY KEY(`taskId`)
);
