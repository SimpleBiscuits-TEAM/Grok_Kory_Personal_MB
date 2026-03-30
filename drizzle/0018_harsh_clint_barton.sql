CREATE TABLE `drag_callouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`locationType` enum('state','city','zip','county','region','country') NOT NULL,
	`locationValue` varchar(128) NOT NULL,
	`locationState` varchar(64),
	`vehicleClass` varchar(64),
	`raceType` enum('eighth','quarter') NOT NULL DEFAULT 'quarter',
	`currentChampionId` int,
	`challengeCount` int DEFAULT 0,
	`isActive` boolean DEFAULT true,
	`shareUrl` text,
	`coverImageUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drag_callouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_league_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leagueId` int NOT NULL,
	`profileId` int NOT NULL,
	`role` enum('member','moderator','commissioner') NOT NULL DEFAULT 'member',
	`seasonPoints` int DEFAULT 0,
	`seasonWins` int DEFAULT 0,
	`seasonLosses` int DEFAULT 0,
	`seasonBestEt` decimal(6,4),
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drag_league_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_league_seasons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leagueId` int NOT NULL,
	`seasonNumber` int NOT NULL DEFAULT 1,
	`name` varchar(255),
	`status` enum('upcoming','active','playoffs','complete') NOT NULL DEFAULT 'upcoming',
	`totalRounds` int DEFAULT 8,
	`currentRound` int DEFAULT 0,
	`prizePool` decimal(10,2) DEFAULT '0',
	`championId` int,
	`startDate` timestamp,
	`endDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drag_league_seasons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_league_standings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`seasonId` int NOT NULL,
	`profileId` int NOT NULL,
	`rank` int DEFAULT 0,
	`points` int DEFAULT 0,
	`wins` int DEFAULT 0,
	`losses` int DEFAULT 0,
	`bestEt` decimal(6,4),
	`bestMph` decimal(6,2),
	`roundsCompleted` int DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drag_league_standings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_leagues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`commissionerId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`rules` text,
	`vehicleClass` varchar(64),
	`raceType` enum('eighth','quarter') NOT NULL DEFAULT 'quarter',
	`locationType` enum('state','city','zip','region','national','open') DEFAULT 'open',
	`locationValue` varchar(128),
	`maxMembers` int DEFAULT 64,
	`memberCount` int DEFAULT 0,
	`isPublic` boolean DEFAULT true,
	`entryFee` decimal(10,2) DEFAULT '0',
	`pointsForWin` int DEFAULT 3,
	`pointsForLoss` int DEFAULT 0,
	`pointsForDraw` int DEFAULT 1,
	`bonusPointBestEt` boolean DEFAULT true,
	`status` enum('setup','active','paused','completed','archived') NOT NULL DEFAULT 'setup',
	`logoUrl` text,
	`bannerUrl` text,
	`shareUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drag_leagues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`tier` enum('free','racer','competitor') NOT NULL DEFAULT 'free',
	`priceUsd` decimal(6,2) DEFAULT '0',
	`paymentMethod` enum('btc','usdc','eth','fiat') DEFAULT 'btc',
	`freeRunsUsed` int DEFAULT 0,
	`status` enum('active','expired','cancelled','trial') NOT NULL DEFAULT 'trial',
	`currentPeriodStart` timestamp,
	`currentPeriodEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drag_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`txType` enum('deposit','withdrawal','wager_lock','wager_win','wager_refund','rake','subscription','tournament_entry','tournament_prize') NOT NULL,
	`amount` decimal(18,8) NOT NULL,
	`currency` enum('btc','usdc','eth') NOT NULL DEFAULT 'btc',
	`usdValueAtTime` decimal(10,2),
	`challengeId` int,
	`tournamentId` int,
	`walletId` int,
	`txHash` varchar(128),
	`blockConfirmations` int DEFAULT 0,
	`status` enum('pending','confirmed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`confirmedAt` timestamp,
	CONSTRAINT `drag_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drag_wallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`walletType` enum('btc','btc_lightning','usdc','eth') NOT NULL,
	`walletAddress` varchar(255) NOT NULL,
	`label` varchar(128),
	`isDefault` boolean DEFAULT false,
	`isVerified` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drag_wallets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_access_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`label` varchar(255),
	`role` enum('viewer','driver','mechanic') NOT NULL DEFAULT 'viewer',
	`maxUses` int,
	`usedCount` int DEFAULT 0,
	`expiresAt` timestamp,
	`isActive` boolean DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_access_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `fleet_access_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `fleet_ai_insights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`vehicleId` int,
	`insightType` enum('fuel_efficiency','driver_coaching','maintenance_prediction','route_optimization','cost_analysis','safety_alert','fleet_summary') NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`severity` enum('info','suggestion','warning','critical') DEFAULT 'info',
	`isActionable` boolean DEFAULT false,
	`isRead` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_ai_insights_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_alert_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`alertType` varchar(64) NOT NULL,
	`isEnabled` boolean DEFAULT true,
	`threshold` decimal(10,2),
	`cooldownMinutes` int DEFAULT 30,
	`notifyEmail` boolean DEFAULT true,
	`notifyPush` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_alert_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`vehicleId` int,
	`driverId` int,
	`alertType` enum('dtc','maintenance_due','speeding','hard_brake','hard_accel','geofence_exit','geofence_enter','idle_excessive','fuel_low','battery_low','device_offline','tire_pressure','temp_high') NOT NULL,
	`severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
	`title` varchar(255) NOT NULL,
	`message` text,
	`isRead` boolean DEFAULT false,
	`isResolved` boolean DEFAULT false,
	`resolvedBy` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_device_syncs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`deviceId` varchar(128),
	`syncType` enum('obd','bluetooth','wifi','cellular','manual') DEFAULT 'obd',
	`protocol` enum('j1939','can','kline','obd2','uds') DEFAULT 'obd2',
	`pidsCollected` int DEFAULT 0,
	`dataSize` int DEFAULT 0,
	`duration` int DEFAULT 0,
	`status` enum('success','partial','failed') DEFAULT 'success',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_device_syncs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`eventType` enum('maintenance','repair','inspection','incident','fuel_fill','tire_rotation','oil_change','dtc_alert') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`cost` decimal(10,2),
	`odometerAtEvent` int,
	`performedBy` int,
	`scheduledDate` timestamp,
	`completedDate` timestamp,
	`status` enum('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_fuel_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`driverId` int,
	`gallons` decimal(8,3) NOT NULL,
	`pricePerGallon` decimal(5,3),
	`totalCost` decimal(8,2),
	`odometer` int,
	`fuelType` enum('diesel','gasoline','e85','electric','propane') DEFAULT 'diesel',
	`station` varchar(255),
	`isFull` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_fuel_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_geofences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`geoType` enum('circle','polygon') DEFAULT 'circle',
	`centerLat` decimal(10,7),
	`centerLng` decimal(10,7),
	`radiusMeters` int,
	`polygonCoords` text,
	`alertOnEnter` boolean DEFAULT false,
	`alertOnExit` boolean DEFAULT true,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_geofences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_maintenance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`serviceType` varchar(128) NOT NULL,
	`intervalMiles` int,
	`intervalDays` int,
	`lastServiceMiles` int,
	`lastServiceDate` timestamp,
	`nextDueMiles` int,
	`nextDueDate` timestamp,
	`estimatedCost` decimal(8,2),
	`notes` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_maintenance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`userId` int,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(32),
	`role` enum('driver','mechanic','manager','admin','viewer') NOT NULL DEFAULT 'driver',
	`licenseNumber` varchar(64),
	`licenseExpiry` timestamp,
	`assignedVehicleId` int,
	`driverScore` int DEFAULT 100,
	`totalTrips` int DEFAULT 0,
	`totalMiles` int DEFAULT 0,
	`hardBrakes` int DEFAULT 0,
	`hardAccels` int DEFAULT 0,
	`speedingEvents` int DEFAULT 0,
	`idleMinutes` int DEFAULT 0,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_orgs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`industry` enum('diesel_trucks','agriculture','powersports','golf_carts','heavy_equipment','construction','rental','mixed') NOT NULL DEFAULT 'diesel_trucks',
	`tier` enum('self_service','goose_standard','goose_pro') NOT NULL DEFAULT 'self_service',
	`maxVehicles` int DEFAULT 25,
	`maxDrivers` int DEFAULT 50,
	`logoUrl` text,
	`timezone` varchar(64) DEFAULT 'America/Chicago',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_orgs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_remote_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`mechanicId` int,
	`sessionType` enum('diagnostic','live_data','dtc_read','dtc_clear','bidirectional') NOT NULL DEFAULT 'diagnostic',
	`status` enum('requested','active','completed','failed') NOT NULL DEFAULT 'requested',
	`aiDiagnosis` text,
	`dtcCodes` text,
	`recommendations` text,
	`datalogUrl` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_remote_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_sensors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`sensorType` enum('tpms','egt_probe','trans_temp','coolant_temp','oil_pressure','oil_temp','fuel_level','battery_voltage','ambient_temp','humidity','gps_tracker') NOT NULL,
	`sensorId` varchar(128),
	`label` varchar(128),
	`lastValue` decimal(10,2),
	`lastUnit` varchar(32),
	`lastReadAt` timestamp,
	`minThreshold` decimal(10,2),
	`maxThreshold` decimal(10,2),
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_sensors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_trips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`driverId` int,
	`startTime` timestamp NOT NULL,
	`endTime` timestamp,
	`startOdometer` int,
	`endOdometer` int,
	`distanceMiles` decimal(8,1),
	`fuelUsedGallons` decimal(8,2),
	`avgMpg` decimal(5,1),
	`maxSpeed` int,
	`hardBrakes` int DEFAULT 0,
	`hardAccels` int DEFAULT 0,
	`idleMinutes` int DEFAULT 0,
	`routeDataUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_trips_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`vin` varchar(17),
	`year` int,
	`make` varchar(64),
	`model` varchar(128),
	`engine` varchar(128),
	`vehicleType` enum('truck','tractor','utv','atv','golf_cart','excavator','loader','skid_steer','generator','other') DEFAULT 'truck',
	`status` enum('active','maintenance','inactive','retired') NOT NULL DEFAULT 'active',
	`deviceId` varchar(128),
	`lastOdometerMiles` int,
	`lastEngineHours` decimal(10,1),
	`lastLatitude` decimal(10,7),
	`lastLongitude` decimal(10,7),
	`lastSyncAt` timestamp,
	`nextServiceMiles` int,
	`nextServiceDate` timestamp,
	`photoUrl` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_vehicles_id` PRIMARY KEY(`id`)
);
