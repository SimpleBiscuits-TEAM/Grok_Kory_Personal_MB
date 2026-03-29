CREATE TABLE `a2l_library` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`ecuFamily` varchar(64) NOT NULL,
	`version` varchar(64),
	`mapCount` int,
	`measurementCount` int,
	`storageUrl` text NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`rawContent` text,
	`parsedMaps` json,
	`uploadedBy` int NOT NULL,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `a2l_library_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `binary_analysis_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`binaryFileName` varchar(255) NOT NULL,
	`binaryHash` varchar(64) NOT NULL,
	`detectedEcuFamily` varchar(64),
	`detectionConfidence` decimal(3,2),
	`binarySize` int,
	`analysisStatus` enum('pending','in_progress','completed','failed') NOT NULL,
	`discoveredMaps` json,
	`suggestedA2LStructure` text,
	`analysisNotes` text,
	`analyzedBy` int,
	`analyzedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `binary_analysis_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `binary_signatures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ecuFamily` varchar(64) NOT NULL,
	`signatureName` varchar(255) NOT NULL,
	`magicBytes` varchar(32),
	`patternOffset` int,
	`patternHex` varchar(512) NOT NULL,
	`patternMask` varchar(512),
	`confidenceScore` decimal(3,2),
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `binary_signatures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calibration_maps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mapName` varchar(255) NOT NULL,
	`ecuFamily` varchar(64) NOT NULL,
	`address` int NOT NULL,
	`size` int NOT NULL,
	`dataType` varchar(64) NOT NULL,
	`dimensions` varchar(64),
	`description` text,
	`category` varchar(128),
	`sourceType` enum('a2l','document','reverse_engineered') NOT NULL,
	`sourceDocumentId` int,
	`sourceA2LId` int,
	`xAxisName` varchar(255),
	`yAxisName` varchar(255),
	`zAxisName` varchar(255),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calibration_maps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_knowledge_index` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`contentExcerpt` text NOT NULL,
	`relevanceScore` decimal(3,2),
	`chunkIndex` int,
	`mapReferences` json,
	`functionReferences` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_knowledge_index_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reference_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`fileType` enum('pdf','txt','doc','patent','video_transcript') NOT NULL,
	`ecuFamily` varchar(64) NOT NULL,
	`documentType` enum('function_sheet','patent','reverse_engineering_guide','calibration_reference','technical_specification','other') NOT NULL,
	`title` varchar(255),
	`description` text,
	`storageUrl` text NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`fileSize` int,
	`extractedText` text,
	`metadata` json,
	`uploadedBy` int NOT NULL,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reference_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `a2l_library` ADD CONSTRAINT `a2l_library_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `binary_analysis_results` ADD CONSTRAINT `binary_analysis_results_analyzedBy_users_id_fk` FOREIGN KEY (`analyzedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_maps` ADD CONSTRAINT `calibration_maps_sourceDocumentId_reference_documents_id_fk` FOREIGN KEY (`sourceDocumentId`) REFERENCES `reference_documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_maps` ADD CONSTRAINT `calibration_maps_sourceA2LId_a2l_library_id_fk` FOREIGN KEY (`sourceA2LId`) REFERENCES `a2l_library`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_knowledge_index` ADD CONSTRAINT `document_knowledge_index_documentId_reference_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `reference_documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reference_documents` ADD CONSTRAINT `reference_documents_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_a2l_ecu_family` ON `a2l_library` (`ecuFamily`);--> statement-breakpoint
CREATE INDEX `idx_a2l_uploaded_by` ON `a2l_library` (`uploadedBy`);--> statement-breakpoint
CREATE INDEX `idx_binary_hash` ON `binary_analysis_results` (`binaryHash`);--> statement-breakpoint
CREATE INDEX `idx_analysis_ecu_family` ON `binary_analysis_results` (`detectedEcuFamily`);--> statement-breakpoint
CREATE INDEX `idx_sig_ecu_family` ON `binary_signatures` (`ecuFamily`);--> statement-breakpoint
CREATE INDEX `idx_cal_ecu_family` ON `calibration_maps` (`ecuFamily`);--> statement-breakpoint
CREATE INDEX `idx_map_name` ON `calibration_maps` (`mapName`);--> statement-breakpoint
CREATE INDEX `idx_address` ON `calibration_maps` (`address`);--> statement-breakpoint
CREATE INDEX `idx_doc_knowledge_doc_id` ON `document_knowledge_index` (`documentId`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_keyword` ON `document_knowledge_index` (`keyword`);--> statement-breakpoint
CREATE INDEX `idx_ecu_family` ON `reference_documents` (`ecuFamily`);--> statement-breakpoint
CREATE INDEX `idx_document_type` ON `reference_documents` (`documentType`);--> statement-breakpoint
CREATE INDEX `idx_uploaded_by` ON `reference_documents` (`uploadedBy`);