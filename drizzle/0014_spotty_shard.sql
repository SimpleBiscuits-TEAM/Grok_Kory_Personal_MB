CREATE TABLE `shared_dynos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shareToken` varchar(32) NOT NULL,
	`userId` int,
	`pdfUrl` text NOT NULL,
	`peakHp` decimal(6,1),
	`peakTorque` decimal(6,1),
	`peakHpRpm` int,
	`peakTorqueRpm` int,
	`turboType` varchar(32),
	`fuelType` varchar(32),
	`injectorType` varchar(32),
	`has3BarMap` boolean DEFAULT false,
	`fileName` varchar(512),
	`views` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shared_dynos_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_dynos_shareToken_unique` UNIQUE(`shareToken`)
);
