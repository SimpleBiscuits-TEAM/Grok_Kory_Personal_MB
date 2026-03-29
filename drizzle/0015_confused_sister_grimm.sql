CREATE TABLE `datalog_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`s3Key` varchar(512) NOT NULL,
	`s3Url` text NOT NULL,
	`fileSize` int NOT NULL,
	`sourcePage` varchar(128) DEFAULT 'analyzer',
	`uploadedBy` varchar(128),
	`uploaderName` varchar(256),
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `datalog_cache_id` PRIMARY KEY(`id`)
);
