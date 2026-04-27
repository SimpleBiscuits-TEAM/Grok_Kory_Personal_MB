CREATE TABLE IF NOT EXISTS `access_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`label` varchar(255),
	`createdBy` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`maxUses` int,
	`currentUses` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `access_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`adminId` int NOT NULL,
	`subject` varchar(255) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`isRead` boolean NOT NULL DEFAULT false,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admin_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderId` int NOT NULL,
	`senderType` enum('admin','user') NOT NULL,
	`content` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cast_chat` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int,
	`platform` varchar(64),
	`username` varchar(128) NOT NULL,
	`message` text NOT NULL,
	`type` enum('chat','system','ai_host','highlight','question') NOT NULL DEFAULT 'chat',
	`pinned` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cast_chat_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cast_dyno_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`rpm` decimal(10,2),
	`hp` decimal(10,2),
	`torque` decimal(10,2),
	`boost` decimal(10,2),
	`egt` decimal(10,2),
	`speed` decimal(10,2),
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cast_dyno_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cast_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`description` text,
	`bannerUrl` text,
	`vehicleInfo` json,
	`scheduledAt` timestamp NOT NULL,
	`estimatedDuration` int DEFAULT 60,
	`status` enum('upcoming','live','completed','cancelled') NOT NULL DEFAULT 'upcoming',
	`sessionId` int,
	`rsvpCount` int DEFAULT 0,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cast_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cast_reactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int,
	`reaction` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cast_reactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cast_rsvps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cast_rsvps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cast_seat_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','approved','denied') NOT NULL DEFAULT 'pending',
	`requestedSection` enum('front_row','lower_bowl') NOT NULL DEFAULT 'front_row',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cast_seat_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cast_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`description` text,
	`mode` enum('standard','dyno','event') NOT NULL DEFAULT 'standard',
	`status` enum('scheduled','lobby','live','ended') NOT NULL DEFAULT 'scheduled',
	`hostId` int NOT NULL,
	`eventId` int,
	`mediaConfig` json,
	`activePlatforms` json,
	`dynoConfig` json,
	`peakStats` json,
	`vodUrl` text,
	`peakViewers` int DEFAULT 0,
	`totalUniqueViewers` int DEFAULT 0,
	`startedAt` timestamp,
	`endedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cast_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cast_viewers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int NOT NULL,
	`seatSection` enum('front_row','lower_bowl','upper_deck','skybox') NOT NULL DEFAULT 'upper_deck',
	`seatIndex` int NOT NULL DEFAULT 0,
	`cameraOn` boolean NOT NULL DEFAULT false,
	`peerId` varchar(128),
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`leftAt` timestamp,
	CONSTRAINT `cast_viewers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `datalog_cache` (
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `debug_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`actorId` int,
	`actorType` enum('user','admin','mara','system') NOT NULL,
	`action` varchar(128) NOT NULL,
	`details` text,
	`tokensUsed` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `debug_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `debug_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`grantedBy` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`tokenBudget` int DEFAULT 5000,
	`tokensUsed` int DEFAULT 0,
	`note` text,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `debug_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `debug_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`status` enum('submitted','analyzing','tier1_auto_fix','tier2_pending','tier2_approved','tier2_rejected','fixing','awaiting_retest','confirmed_fixed','still_broken','escalated','closed') NOT NULL DEFAULT 'submitted',
	`tier` enum('tier1','tier2') DEFAULT 'tier1',
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`stepsToReproduce` text,
	`expectedBehavior` text,
	`actualBehavior` text,
	`featureArea` varchar(128),
	`screenshotUrl` text,
	`browserInfo` text,
	`analysisResult` text,
	`rootCause` text,
	`proposedFix` text,
	`fixApplied` text,
	`estimatedTokens` int,
	`actualTokens` int,
	`retestFeedback` text,
	`retestCount` int DEFAULT 0,
	`reviewedBy` int,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`resolvedAt` timestamp,
	CONSTRAINT `debug_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `drag_callouts` (
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
CREATE TABLE IF NOT EXISTS `drag_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challengerId` int NOT NULL,
	`opponentId` int,
	`status` enum('open','accepted','challenger_submitted','opponent_submitted','complete','cancelled','expired') NOT NULL DEFAULT 'open',
	`challengeType` enum('eighth','quarter') NOT NULL DEFAULT 'quarter',
	`entryFee` decimal(10,2) DEFAULT '0',
	`prizePool` decimal(10,2) DEFAULT '0',
	`platformFee` decimal(10,2) DEFAULT '0',
	`challengerRunId` int,
	`opponentRunId` int,
	`winnerId` int,
	`animationUrl` text,
	`expiresAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drag_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `drag_leaderboard` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`category` varchar(64) NOT NULL,
	`vehicleClass` varchar(64) DEFAULT 'open',
	`bestValue` decimal(8,4) NOT NULL,
	`runId` int NOT NULL,
	`season` varchar(16),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drag_leaderboard_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `drag_league_members` (
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
CREATE TABLE IF NOT EXISTS `drag_league_seasons` (
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
CREATE TABLE IF NOT EXISTS `drag_league_standings` (
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
CREATE TABLE IF NOT EXISTS `drag_leagues` (
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
CREATE TABLE IF NOT EXISTS `drag_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`vehicleDesc` varchar(255),
	`vehicleClass` varchar(64),
	`bestEt` decimal(6,4),
	`bestMph` decimal(6,2),
	`totalRuns` int DEFAULT 0,
	`wins` int DEFAULT 0,
	`losses` int DEFAULT 0,
	`elo` int DEFAULT 1200,
	`subscriptionStatus` enum('none','active','expired','cancelled') NOT NULL DEFAULT 'none',
	`subscriptionExpiresAt` timestamp,
	`avatarUrl` text,
	`vehiclePhotoUrl` text,
	`bio` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drag_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `drag_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`runType` enum('eighth','quarter') NOT NULL DEFAULT 'quarter',
	`reactionTime` decimal(5,4),
	`sixtyFt` decimal(5,4),
	`threeThirtyFt` decimal(5,4),
	`eighthEt` decimal(6,4),
	`eighthMph` decimal(6,2),
	`thousandFt` decimal(6,4),
	`quarterEt` decimal(6,4),
	`quarterMph` decimal(6,2),
	`peakBoost` decimal(5,1),
	`peakEgt` decimal(6,1),
	`peakRpm` int,
	`intakeTemp` decimal(5,1),
	`ambientTemp` decimal(5,1),
	`densityAltitude` int,
	`dataSource` enum('vop_obd','manual','dragy','racepak') NOT NULL DEFAULT 'vop_obd',
	`rawDataUrl` text,
	`aiReport` text,
	`timeslipUrl` text,
	`isVerified` boolean DEFAULT false,
	`verificationHash` varchar(64),
	`trackName` varchar(255),
	`trackLocation` varchar(255),
	`weatherConditions` varchar(128),
	`notes` text,
	`isPublic` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drag_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `drag_subscriptions` (
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
CREATE TABLE IF NOT EXISTS `drag_tournaments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`tournamentType` enum('bracket','best_et','king_of_hill') NOT NULL DEFAULT 'bracket',
	`raceType` enum('eighth','quarter') NOT NULL DEFAULT 'quarter',
	`vehicleClass` varchar(64),
	`maxParticipants` int DEFAULT 32,
	`currentParticipants` int DEFAULT 0,
	`entryFee` decimal(10,2) DEFAULT '0',
	`prizePool` decimal(10,2) DEFAULT '0',
	`status` enum('registration','active','complete','cancelled') NOT NULL DEFAULT 'registration',
	`rules` text,
	`startDate` timestamp,
	`endDate` timestamp,
	`winnerId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drag_tournaments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `drag_transactions` (
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
CREATE TABLE IF NOT EXISTS `drag_wallets` (
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
CREATE TABLE IF NOT EXISTS `fca_calibrations` (
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('feedback','error') NOT NULL,
	`name` varchar(255),
	`email` varchar(320),
	`rating` int,
	`message` text NOT NULL,
	`errorType` varchar(255),
	`stepsToReproduce` text,
	`context` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fleet_access_tokens` (
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
CREATE TABLE IF NOT EXISTS `fleet_ai_insights` (
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
CREATE TABLE IF NOT EXISTS `fleet_alert_rules` (
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
CREATE TABLE IF NOT EXISTS `fleet_alerts` (
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
CREATE TABLE IF NOT EXISTS `fleet_device_syncs` (
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
CREATE TABLE IF NOT EXISTS `fleet_events` (
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
CREATE TABLE IF NOT EXISTS `fleet_fuel_logs` (
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
CREATE TABLE IF NOT EXISTS `fleet_geofences` (
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
CREATE TABLE IF NOT EXISTS `fleet_maintenance` (
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
CREATE TABLE IF NOT EXISTS `fleet_members` (
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
CREATE TABLE IF NOT EXISTS `fleet_orgs` (
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
CREATE TABLE IF NOT EXISTS `fleet_remote_sessions` (
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
CREATE TABLE IF NOT EXISTS `fleet_sensors` (
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
CREATE TABLE IF NOT EXISTS `fleet_trips` (
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
CREATE TABLE IF NOT EXISTS `fleet_vehicles` (
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `forum_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`description` text,
	`icon` varchar(64),
	`color` varchar(32),
	`sortOrder` int DEFAULT 0,
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forum_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `forum_categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `forum_channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`description` text,
	`createdBy` int NOT NULL,
	`isOfficial` boolean DEFAULT false,
	`isPinned` boolean DEFAULT false,
	`memberCount` int DEFAULT 0,
	`postCount` int DEFAULT 0,
	`lastActivityAt` timestamp DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forum_channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `forum_likes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`postId` int,
	`threadId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forum_likes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `forum_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`channelId` int NOT NULL,
	`role` enum('member','moderator','owner') NOT NULL DEFAULT 'member',
	`notificationsEnabled` boolean DEFAULT true,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forum_memberships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `forum_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`authorId` int NOT NULL,
	`content` text NOT NULL,
	`replyToId` int,
	`likeCount` int DEFAULT 0,
	`isEdited` boolean DEFAULT false,
	`editedAt` timestamp,
	`imageUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forum_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `forum_threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` int NOT NULL,
	`authorId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`isPinned` boolean DEFAULT false,
	`isLocked` boolean DEFAULT false,
	`viewCount` int DEFAULT 0,
	`replyCount` int DEFAULT 0,
	`likeCount` int DEFAULT 0,
	`lastReplyAt` timestamp,
	`lastReplyBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `forum_threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `generated_a2l` (
	`id` int AUTO_INCREMENT NOT NULL,
	`osNumber` varchar(32) NOT NULL,
	`ecuFamily` varchar(64) NOT NULL,
	`version` varchar(32) NOT NULL DEFAULT '1.0.0',
	`a2lContent` text NOT NULL,
	`fileSize` int NOT NULL,
	`mapCount` int NOT NULL,
	`confidence` decimal(3,2) NOT NULL,
	`binaryHash` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generated_a2l_id` PRIMARY KEY(`id`),
	CONSTRAINT `generated_a2l_osNumber_unique` UNIQUE(`osNumber`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `geofence_user_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`zoneId` int,
	`overrideType` enum('exempt','enforce') NOT NULL DEFAULT 'exempt',
	`reason` text,
	`grantedBy` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `geofence_user_overrides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `geofence_zones` (
	`id` varchar(36) NOT NULL,
	`created_by` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`polygon_coords` json NOT NULL,
	`scope` enum('global','tuner') DEFAULT 'tuner',
	`block_upload` boolean DEFAULT true,
	`block_download` boolean DEFAULT true,
	`restricted_user_id` int,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `geofence_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `knox_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(512) NOT NULL,
	`fileType` varchar(32) NOT NULL,
	`sizeMb` decimal(10,2) NOT NULL,
	`sizeBytes` int NOT NULL,
	`s3Key` varchar(512) NOT NULL,
	`s3Url` text NOT NULL,
	`platform` varchar(256) NOT NULL,
	`ecuId` varchar(128),
	`projectId` varchar(128),
	`projectName` varchar(256),
	`version` varchar(256),
	`epk` text,
	`cpuType` varchar(64),
	`totalCalibratables` int DEFAULT 0,
	`totalMeasurements` int DEFAULT 0,
	`totalFunctions` int DEFAULT 0,
	`analysisJson` json,
	`sourceCollection` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knox_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `nda_submissions` (
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pitch_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`eventType` enum('tab_view','chat_message','prompt_click','session_end') NOT NULL,
	`metadata` json,
	`sessionId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pitch_analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `share_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`allowedPath` varchar(512) NOT NULL,
	`label` varchar(255),
	`createdBy` int,
	`consumed` boolean NOT NULL DEFAULT false,
	`consumedAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `share_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `share_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stream_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`rtmpUrl` text NOT NULL,
	`streamKey` text NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stream_keys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `waitlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255),
	`interest` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waitlist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_audit_log` (
	`id` varchar(36) NOT NULL,
	`admin_id` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`target_type` varchar(50),
	`target_id` varchar(255),
	`details` text,
	`ip_address` varchar(45),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `admin_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hardware_devices` (
	`id` varchar(36) NOT NULL,
	`hardware_id` varchar(255) NOT NULL,
	`customer_email` varchar(255),
	`customer_name` varchar(255),
	`vehicle_vin` varchar(17),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`registered_at` timestamp DEFAULT (now()),
	`last_request_at` timestamp,
	`total_deliveries` int DEFAULT 0,
	CONSTRAINT `hardware_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `hardware_devices_hardware_id_unique` UNIQUE(`hardware_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mara_map_changes` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`project_id` varchar(36),
	`map_name` varchar(255) NOT NULL,
	`map_address` int,
	`change_type` varchar(50) NOT NULL,
	`change_description` text NOT NULL,
	`original_values` json,
	`proposed_values` json,
	`cell_range` json,
	`reasoning` text,
	`status` enum('pending','approved','rejected','auto_approved') DEFAULT 'pending',
	`approved_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `mara_map_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_comparisons` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`stock_binary_hash` varchar(64),
	`tuned_binary_hash` varchar(64),
	`differences_count` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `project_comparisons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_files` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`file_type` enum('binary','a2l','csv','reference','comparison') NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_size` int,
	`file_hash` varchar(64),
	`s3_key` varchar(500),
	`s3_url` varchar(500),
	`uploaded_at` timestamp DEFAULT (now()),
	CONSTRAINT `project_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_file_hash` UNIQUE(`file_hash`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_metadata` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`current_binary_hash` varchar(64),
	`current_version` int,
	`total_maps_modified` int DEFAULT 0,
	`last_edited_by` varchar(255),
	`last_edited_at` timestamp,
	`checksum_status` enum('valid','invalid','unchecked') DEFAULT 'unchecked',
	`tags` json,
	`notes` text,
	CONSTRAINT `project_metadata_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_metadata_project_id_unique` UNIQUE(`project_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_versions` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`version_number` int NOT NULL,
	`binary_hash` varchar(64),
	`changes_summary` text,
	`maps_modified` json,
	`checksums_applied` boolean DEFAULT false,
	`created_by` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `project_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_project_version` UNIQUE(`project_id`,`version_number`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `projects` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`ecu_family` varchar(100),
	`ecu_id` varchar(100),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`is_archived` boolean DEFAULT false,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `saved_tunes` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`folder_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`description` text,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`ecu_family` varchar(100),
	`ecu_id` varchar(100),
	`os_version` varchar(50),
	`ecu_part_number` varchar(100),
	`binary_hash` varchar(64),
	`a2l_hash` varchar(64),
	`s3_binary_key` varchar(500),
	`s3_binary_url` varchar(500),
	`s3_a2l_key` varchar(500),
	`s3_a2l_url` varchar(500),
	`file_size` int,
	`tune_stage` varchar(50),
	`power_level` varchar(100),
	`fuel_type` varchar(50),
	`modifications` text,
	`checksum_status` enum('valid','invalid','unchecked') DEFAULT 'unchecked',
	`is_dispatch_ready` boolean DEFAULT false,
	`dispatch_priority` int DEFAULT 0,
	`tags` json,
	`notes` text,
	`is_favorite` boolean DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_tunes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `support_metrics` (
	`id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`response_time` int,
	`resolution_status` enum('resolved','partial','escalated','pending') DEFAULT 'pending',
	`resolution_notes` text,
	`customer_satisfaction` int,
	`customer_feedback` text,
	`total_participants` int,
	`total_duration` int,
	`screen_share_time` int,
	`audio_time` int,
	`video_time` int,
	`chat_messages` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `support_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `support_session_recordings` (
	`id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`screen_recording_url` varchar(500),
	`webcam_recording_url` varchar(500),
	`audio_recording_url` varchar(500),
	`combined_video_url` varchar(500),
	`chat_transcript` json,
	`duration` int,
	`file_size` varchar(50),
	`is_educational` boolean DEFAULT false,
	`course_title` varchar(255),
	`course_topic` varchar(255),
	`tags` json,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `support_session_recordings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `support_sessions` (
	`id` varchar(36) NOT NULL,
	`invite_link` varchar(255) NOT NULL,
	`created_by` int NOT NULL,
	`customer_name` varchar(255) NOT NULL,
	`customer_email` varchar(255),
	`status` enum('active','ended','expired') DEFAULT 'active',
	`expires_at` timestamp NOT NULL,
	`started_at` timestamp,
	`ended_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `support_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `support_sessions_invite_link_unique` UNIQUE(`invite_link`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tune_deliveries` (
	`id` varchar(36) NOT NULL,
	`tune_library_id` varchar(36) NOT NULL,
	`hardware_id` varchar(255),
	`vehicle_vin` varchar(17),
	`requested_at` timestamp DEFAULT (now()),
	`delivered_at` timestamp,
	`delivery_status` enum('pending','delivered','failed','rejected') DEFAULT 'pending',
	`failure_reason` text,
	`customer_email` varchar(255),
	CONSTRAINT `tune_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tune_folders` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`parent_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`folder_type` enum('root','make','model','year','ecu_family','ecu_variant','custom') DEFAULT 'custom',
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`ecu_family` varchar(100),
	`ecu_variant` varchar(100),
	`os_version` varchar(50),
	`ecu_part_number` varchar(100),
	`hardware_revision` varchar(50),
	`sort_order` int DEFAULT 0,
	`is_auto_generated` boolean DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tune_folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tune_library` (
	`id` varchar(36) NOT NULL,
	`vehicle_make` varchar(100) NOT NULL,
	`vehicle_model` varchar(100) NOT NULL,
	`vehicle_year` int,
	`ecu_family` varchar(100) NOT NULL,
	`ecu_part_number` varchar(100) NOT NULL,
	`os_version` varchar(50) NOT NULL,
	`hardware_revision` varchar(50),
	`tune_name` varchar(255) NOT NULL,
	`tune_description` text,
	`tune_version` varchar(50),
	`binary_hash` varchar(64) NOT NULL,
	`a2l_hash` varchar(64),
	`s3_binary_key` varchar(500) NOT NULL,
	`s3_a2l_key` varchar(500),
	`file_size` int,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`is_active` boolean DEFAULT true,
	`created_by` varchar(255),
	CONSTRAINT `tune_library_id` PRIMARY KEY(`id`),
	CONSTRAINT `tune_library_binary_hash_unique` UNIQUE(`binary_hash`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tune_shares` (
	`id` varchar(36) NOT NULL,
	`tune_id` varchar(36) NOT NULL,
	`owner_id` int NOT NULL,
	`shared_with_id` int NOT NULL,
	`permission` enum('view','download','edit') DEFAULT 'view',
	`expires_at` timestamp,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `tune_shares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_map_layouts` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`ecu_family` varchar(100),
	`map_list` json NOT NULL,
	`is_default` boolean DEFAULT false,
	`sort_order` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_map_layouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `a2l_definitions` (
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
CREATE TABLE IF NOT EXISTS `binary_analysis` (
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
CREATE TABLE IF NOT EXISTS `calibration_characteristics` (
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
CREATE TABLE IF NOT EXISTS `calibration_values` (
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
CREATE TABLE IF NOT EXISTS `ecu_models` (
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
CREATE TABLE IF NOT EXISTS `admin_notifications` (
	`id` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`description` text,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('draft','scheduled','sent','archived') NOT NULL DEFAULT 'draft',
	`createdBy` int NOT NULL,
	`createdAt` bigint NOT NULL,
	`scheduledFor` bigint,
	`sentAt` bigint,
	`expiresAt` bigint,
	`actionLabel` varchar(255),
	`actionUrl` varchar(512),
	`targetAudience` enum('all','admins','users') NOT NULL DEFAULT 'all',
	CONSTRAINT `admin_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_deliveries` (
	`id` varchar(64) NOT NULL,
	`notificationId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','delivered','read','dismissed') NOT NULL DEFAULT 'pending',
	`deliveredAt` bigint,
	`readAt` bigint,
	`dismissedAt` bigint,
	`actionClickedAt` bigint,
	CONSTRAINT `notification_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `qa_checklists` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`version` varchar(32),
	`createdBy` int NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	`status` enum('active','completed','archived') NOT NULL DEFAULT 'active',
	CONSTRAINT `qa_checklists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `qa_item_comments` (
	`id` varchar(64) NOT NULL,
	`testItemId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`message` text NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `qa_item_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `qa_test_items` (
	`id` varchar(64) NOT NULL,
	`checklistId` varchar(64) NOT NULL,
	`category` varchar(100) NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`status` enum('pending','pass','fail','blocked','skipped') NOT NULL DEFAULT 'pending',
	`assignedTo` int,
	`testedBy` int,
	`testedAt` bigint,
	`comment` text,
	`errorDetails` text,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `qa_test_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_notification_prefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`enablePush` boolean NOT NULL DEFAULT true,
	`enableWhatsNew` boolean NOT NULL DEFAULT true,
	`minPriority` enum('low','medium','high','critical') NOT NULL DEFAULT 'low',
	`mutedUntil` bigint,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `user_notification_prefs_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_notification_prefs_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `offset_correction_history` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`ecuId` varchar(255) NOT NULL,
	`vehicleType` varchar(255) NOT NULL,
	`offsetDelta` int NOT NULL,
	`confidence` int NOT NULL,
	`status` enum('applied','failed','manual') NOT NULL,
	`notes` text,
	`appliedAt` bigint NOT NULL,
	CONSTRAINT `offset_correction_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `offset_profiles` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`ecuId` varchar(255) NOT NULL,
	`vehicleType` varchar(255) NOT NULL,
	`offsetDelta` int NOT NULL,
	`confidence` int NOT NULL,
	`tableSignaturesMatched` text NOT NULL,
	`notes` text,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `offset_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `a2l_library` (
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
CREATE TABLE IF NOT EXISTS `binary_analysis_results` (
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
CREATE TABLE IF NOT EXISTS `binary_signatures` (
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
CREATE TABLE IF NOT EXISTS `calibration_maps` (
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
CREATE TABLE IF NOT EXISTS `document_knowledge_index` (
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
CREATE TABLE IF NOT EXISTS `reference_documents` (
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
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','super_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `advancedAccess` enum('none','pending','approved','revoked') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `accessLevel` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `accessApprovedBy` int;--> statement-breakpoint
ALTER TABLE `users` ADD `accessApprovedAt` timestamp;--> statement-breakpoint
ALTER TABLE `geofence_zones` ADD CONSTRAINT `geofence_zones_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `geofence_zones` ADD CONSTRAINT `geofence_zones_restricted_user_id_users_id_fk` FOREIGN KEY (`restricted_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `admin_audit_log` ADD CONSTRAINT `admin_audit_log_admin_id_users_id_fk` FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mara_map_changes` ADD CONSTRAINT `mara_map_changes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mara_map_changes` ADD CONSTRAINT `mara_map_changes_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_comparisons` ADD CONSTRAINT `project_comparisons_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_files` ADD CONSTRAINT `project_files_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_metadata` ADD CONSTRAINT `project_metadata_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_versions` ADD CONSTRAINT `project_versions_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_tunes` ADD CONSTRAINT `saved_tunes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_tunes` ADD CONSTRAINT `saved_tunes_folder_id_tune_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `tune_folders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_metrics` ADD CONSTRAINT `support_metrics_session_id_support_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `support_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_session_recordings` ADD CONSTRAINT `support_session_recordings_session_id_support_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `support_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_sessions` ADD CONSTRAINT `support_sessions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tune_deliveries` ADD CONSTRAINT `tune_deliveries_tune_library_id_tune_library_id_fk` FOREIGN KEY (`tune_library_id`) REFERENCES `tune_library`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tune_folders` ADD CONSTRAINT `tune_folders_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tune_shares` ADD CONSTRAINT `tune_shares_tune_id_saved_tunes_id_fk` FOREIGN KEY (`tune_id`) REFERENCES `saved_tunes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tune_shares` ADD CONSTRAINT `tune_shares_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tune_shares` ADD CONSTRAINT `tune_shares_shared_with_id_users_id_fk` FOREIGN KEY (`shared_with_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_map_layouts` ADD CONSTRAINT `user_map_layouts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `a2l_definitions` ADD CONSTRAINT `a2l_definitions_ecu_model_id_ecu_models_id_fk` FOREIGN KEY (`ecu_model_id`) REFERENCES `ecu_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `binary_analysis` ADD CONSTRAINT `binary_analysis_ecu_model_id_ecu_models_id_fk` FOREIGN KEY (`ecu_model_id`) REFERENCES `ecu_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_characteristics` ADD CONSTRAINT `calibration_characteristics_ecu_model_id_ecu_models_id_fk` FOREIGN KEY (`ecu_model_id`) REFERENCES `ecu_models`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_values` ADD CONSTRAINT `calibration_values_binary_analysis_id_binary_analysis_id_fk` FOREIGN KEY (`binary_analysis_id`) REFERENCES `binary_analysis`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_values` ADD CONSTRAINT `cal_values_char_id_cal_chars_id_fk` FOREIGN KEY (`characteristic_id`) REFERENCES `calibration_characteristics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `a2l_library` ADD CONSTRAINT `a2l_library_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `binary_analysis_results` ADD CONSTRAINT `binary_analysis_results_analyzedBy_users_id_fk` FOREIGN KEY (`analyzedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_maps` ADD CONSTRAINT `calibration_maps_sourceDocumentId_reference_documents_id_fk` FOREIGN KEY (`sourceDocumentId`) REFERENCES `reference_documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_maps` ADD CONSTRAINT `calibration_maps_sourceA2LId_a2l_library_id_fk` FOREIGN KEY (`sourceA2LId`) REFERENCES `a2l_library`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_knowledge_index` ADD CONSTRAINT `document_knowledge_index_documentId_reference_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `reference_documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reference_documents` ADD CONSTRAINT `reference_documents_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_geofence_created_by` ON `geofence_zones` (`created_by`);--> statement-breakpoint
CREATE INDEX `idx_geofence_scope` ON `geofence_zones` (`scope`,`is_active`);--> statement-breakpoint
CREATE INDEX `idx_admin_action` ON `admin_audit_log` (`admin_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_target` ON `admin_audit_log` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_hardware_id` ON `hardware_devices` (`hardware_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_email` ON `hardware_devices` (`customer_email`);--> statement-breakpoint
CREATE INDEX `idx_mara_user_changes` ON `mara_map_changes` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_mara_project_changes` ON `mara_map_changes` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_comparisons` ON `project_comparisons` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_files` ON `project_files` (`project_id`,`file_type`);--> statement-breakpoint
CREATE INDEX `idx_project_metadata` ON `project_metadata` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_versions` ON `project_versions` (`project_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `idx_user_projects` ON `projects` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_archived` ON `projects` (`is_archived`);--> statement-breakpoint
CREATE INDEX `idx_user_tunes` ON `saved_tunes` (`user_id`,`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_dispatch_match` ON `saved_tunes` (`vehicle_make`,`vehicle_model`,`ecu_family`,`os_version`,`ecu_part_number`);--> statement-breakpoint
CREATE INDEX `idx_favorite` ON `saved_tunes` (`user_id`,`is_favorite`);--> statement-breakpoint
CREATE INDEX `idx_dispatch_ready` ON `saved_tunes` (`is_dispatch_ready`,`dispatch_priority`);--> statement-breakpoint
CREATE INDEX `idx_metrics_session` ON `support_metrics` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_metrics_resolution` ON `support_metrics` (`resolution_status`);--> statement-breakpoint
CREATE INDEX `idx_recording_session` ON `support_session_recordings` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_recording_educational` ON `support_session_recordings` (`is_educational`);--> statement-breakpoint
CREATE INDEX `idx_recording_topic` ON `support_session_recordings` (`course_topic`);--> statement-breakpoint
CREATE INDEX `idx_support_created_by` ON `support_sessions` (`created_by`);--> statement-breakpoint
CREATE INDEX `idx_support_status` ON `support_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_support_invite_link` ON `support_sessions` (`invite_link`);--> statement-breakpoint
CREATE INDEX `idx_hardware_deliveries` ON `tune_deliveries` (`hardware_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `idx_vin_deliveries` ON `tune_deliveries` (`vehicle_vin`);--> statement-breakpoint
CREATE INDEX `idx_delivery_status` ON `tune_deliveries` (`delivery_status`);--> statement-breakpoint
CREATE INDEX `idx_user_folders` ON `tune_folders` (`user_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_folder_type` ON `tune_folders` (`folder_type`);--> statement-breakpoint
CREATE INDEX `idx_auto_match` ON `tune_folders` (`vehicle_make`,`vehicle_model`,`ecu_family`);--> statement-breakpoint
CREATE INDEX `idx_tune_match` ON `tune_library` (`vehicle_make`,`vehicle_model`,`ecu_family`,`os_version`);--> statement-breakpoint
CREATE INDEX `idx_ecu_part` ON `tune_library` (`ecu_part_number`,`os_version`);--> statement-breakpoint
CREATE INDEX `idx_active` ON `tune_library` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_tune_share` ON `tune_shares` (`tune_id`,`shared_with_id`);--> statement-breakpoint
CREATE INDEX `idx_owner_shares` ON `tune_shares` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_shared_with` ON `tune_shares` (`shared_with_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `idx_user_layouts` ON `user_map_layouts` (`user_id`,`ecu_family`);--> statement-breakpoint
CREATE INDEX `idx_default_layout` ON `user_map_layouts` (`user_id`,`is_default`);--> statement-breakpoint
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
CREATE INDEX `idx_variant` ON `ecu_models` (`variant`);--> statement-breakpoint
CREATE INDEX `idx_qa_checklist_status` ON `qa_checklists` (`status`);--> statement-breakpoint
CREATE INDEX `idx_qa_checklist_created_by` ON `qa_checklists` (`createdBy`);--> statement-breakpoint
CREATE INDEX `idx_qa_comment_item` ON `qa_item_comments` (`testItemId`);--> statement-breakpoint
CREATE INDEX `idx_qa_comment_user` ON `qa_item_comments` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_qa_item_checklist` ON `qa_test_items` (`checklistId`);--> statement-breakpoint
CREATE INDEX `idx_qa_item_status` ON `qa_test_items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_qa_item_category` ON `qa_test_items` (`category`);--> statement-breakpoint
CREATE INDEX `idx_qa_item_assigned` ON `qa_test_items` (`assignedTo`);--> statement-breakpoint
CREATE INDEX `idx_notif_prefs_user` ON `user_notification_prefs` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_history_user` ON `offset_correction_history` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_history_ecu` ON `offset_correction_history` (`ecuId`);--> statement-breakpoint
CREATE INDEX `idx_history_status` ON `offset_correction_history` (`status`);--> statement-breakpoint
CREATE INDEX `idx_history_applied` ON `offset_correction_history` (`appliedAt`);--> statement-breakpoint
CREATE INDEX `idx_offset_user` ON `offset_profiles` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_offset_ecu` ON `offset_profiles` (`ecuId`);--> statement-breakpoint
CREATE INDEX `idx_offset_vehicle` ON `offset_profiles` (`vehicleType`);--> statement-breakpoint
CREATE INDEX `idx_offset_user_ecu_vehicle` ON `offset_profiles` (`userId`,`ecuId`,`vehicleType`);--> statement-breakpoint
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