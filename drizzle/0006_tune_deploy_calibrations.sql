-- Tune Deploy calibration library (run via your migration workflow or `drizzle-kit push`)
CREATE TABLE IF NOT EXISTS `tune_deploy_calibrations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `uploadedByUserId` int NOT NULL,
  `fileName` varchar(512) NOT NULL,
  `r2Key` varchar(512) NOT NULL,
  `storageUrl` text,
  `sha256` varchar(64) NOT NULL,
  `sizeBytes` int NOT NULL,
  `vehicleFamily` varchar(128) NOT NULL,
  `vehicleSubType` varchar(128) NOT NULL,
  `modelYear` int,
  `osVersion` varchar(256),
  `ecuType` varchar(128),
  `ecuHardwareId` varchar(128),
  `partNumbersCsv` text,
  `parsedMeta` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `tune_deploy_calibrations_id` PRIMARY KEY(`id`)
);
