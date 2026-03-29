CREATE TABLE `a2l_definitions` (
	`id` varchar(50) NOT NULL,
	`ecu_model_id` varchar(50) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`version` varchar(100),
	`project_no` varchar(100),
	`content` text,
	`characteristic_count` int,
	`uploaded_at` timestamp DEFAULT (now()),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `a2l_definitions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `binary_analysis` (
	`id` varchar(50) NOT NULL,
	`ecu_model_id` varchar(50),
	`filename` varchar(255) NOT NULL,
	`file_size` int NOT NULL,
	`file_hash` varchar(64),
	`uploaded_at` timestamp DEFAULT (now()),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `binary_analysis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calibration_characteristics` (
	`id` varchar(100) NOT NULL,
	`ecu_model_id` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`ecu_address` varchar(20) NOT NULL,
	`ecu_address_int` int NOT NULL,
	`bin_offset` varchar(20) NOT NULL,
	`bin_offset_int` int NOT NULL,
	`data_type` varchar(50) NOT NULL,
	`size` int,
	`category` varchar(100),
	`subcategory` varchar(100),
	`min_value` decimal(20,6),
	`max_value` decimal(20,6),
	`unit` varchar(50),
	`scale` decimal(10,6),
	`offset` decimal(10,6),
	`is_table` int DEFAULT 0,
	`table_rows` int,
	`table_cols` int,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calibration_characteristics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calibration_values` (
	`id` varchar(100) NOT NULL,
	`binary_analysis_id` varchar(50) NOT NULL,
	`characteristic_id` varchar(100) NOT NULL,
	`raw_value` text,
	`interpreted_value` decimal(20,6),
	`unit` varchar(50),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `calibration_values_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ecu_models` (
	`id` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`manufacturer` varchar(100) NOT NULL,
	`family` varchar(100) NOT NULL,
	`variant` varchar(100) NOT NULL,
	`base_address` varchar(20) NOT NULL,
	`base_address_int` int NOT NULL,
	`binary_size` int NOT NULL,
	`description` text,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ecu_models_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `a2l_definitions` ADD CONSTRAINT `a2l_definitions_ecu_model_id_ecu_models_id_fk` FOREIGN KEY (`ecu_model_id`) REFERENCES `ecu_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `binary_analysis` ADD CONSTRAINT `binary_analysis_ecu_model_id_ecu_models_id_fk` FOREIGN KEY (`ecu_model_id`) REFERENCES `ecu_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_characteristics` ADD CONSTRAINT `calibration_characteristics_ecu_model_id_ecu_models_id_fk` FOREIGN KEY (`ecu_model_id`) REFERENCES `ecu_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_values` ADD CONSTRAINT `calibration_values_binary_analysis_id_binary_analysis_id_fk` FOREIGN KEY (`binary_analysis_id`) REFERENCES `binary_analysis`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_values` ADD CONSTRAINT `calibration_values_characteristic_id_calibration_characteristics_id_fk` FOREIGN KEY (`characteristic_id`) REFERENCES `calibration_characteristics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_ecu_model` ON `a2l_definitions` (`ecu_model_id`);--> statement-breakpoint
CREATE INDEX `idx_filename` ON `a2l_definitions` (`filename`);--> statement-breakpoint
CREATE INDEX `idx_ecu_model` ON `binary_analysis` (`ecu_model_id`);--> statement-breakpoint
CREATE INDEX `idx_filename` ON `binary_analysis` (`filename`);--> statement-breakpoint
CREATE INDEX `idx_hash` ON `binary_analysis` (`file_hash`);--> statement-breakpoint
CREATE INDEX `idx_ecu_model` ON `calibration_characteristics` (`ecu_model_id`);--> statement-breakpoint
CREATE INDEX `idx_name` ON `calibration_characteristics` (`name`);--> statement-breakpoint
CREATE INDEX `idx_category` ON `calibration_characteristics` (`category`);--> statement-breakpoint
CREATE INDEX `idx_bin_offset` ON `calibration_characteristics` (`bin_offset_int`);--> statement-breakpoint
CREATE INDEX `idx_binary_analysis` ON `calibration_values` (`binary_analysis_id`);--> statement-breakpoint
CREATE INDEX `idx_characteristic` ON `calibration_values` (`characteristic_id`);--> statement-breakpoint
CREATE INDEX `idx_family` ON `ecu_models` (`family`);--> statement-breakpoint
CREATE INDEX `idx_variant` ON `ecu_models` (`variant`);