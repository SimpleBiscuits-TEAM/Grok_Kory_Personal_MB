CREATE TABLE `nda_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenId` int NOT NULL,
	`signerName` varchar(255) NOT NULL,
	`signerEmail` varchar(320),
	`signatureImageUrl` text,
	`uploadedDocUrl` text,
	`status` enum('pending','verified','rejected') NOT NULL DEFAULT 'pending',
	`verifiedBy` int,
	`verifiedAt` timestamp,
	`rejectionReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nda_submissions_id` PRIMARY KEY(`id`)
);
