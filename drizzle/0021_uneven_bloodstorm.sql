CREATE TABLE `fca_calibrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`calibration` text NOT NULL,
	`moduleType` varchar(32) NOT NULL,
	`newPartNumber` varchar(32) NOT NULL,
	`oldPartNumbers` json NOT NULL,
	`tsbs` json NOT NULL,
	`recalls` json NOT NULL,
	`yearStart` int,
	`yearEnd` int,
	`platformCodes` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fca_calibrations_id` PRIMARY KEY(`id`)
);
