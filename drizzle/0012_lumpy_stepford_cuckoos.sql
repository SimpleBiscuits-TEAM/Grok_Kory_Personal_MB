ALTER TABLE `live_weather_streams` MODIFY COLUMN `status` enum('testing','live','paused','ended') NOT NULL DEFAULT 'testing';--> statement-breakpoint
ALTER TABLE `live_weather_streams` ADD `stormChaseActive` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `live_weather_streams` ADD `emergencyOverrideActive` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `live_weather_streams` ADD `emergencyOverrideStartedAt` timestamp;--> statement-breakpoint
ALTER TABLE `live_weather_streams` ADD `streamSettings` json;--> statement-breakpoint
ALTER TABLE `live_weather_streams` ADD `sessionSummary` json;--> statement-breakpoint
ALTER TABLE `live_weather_streams` ADD `healthStatus` enum('green','yellow','red') DEFAULT 'green';--> statement-breakpoint
ALTER TABLE `live_weather_streams` ADD `peakValues` json;--> statement-breakpoint
ALTER TABLE `live_weather_streams` ADD `peakViewerCount` int DEFAULT 0 NOT NULL;