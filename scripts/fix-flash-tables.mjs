/**
 * Fix flash tables — drop old schema and recreate with correct Drizzle schema.
 * All 6 tables are empty (0 rows) so this is safe.
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL + '&ssl={"rejectUnauthorized":true}');

console.log('Dropping old flash tables...');

// Drop in dependency order (logs/snapshots first, then sessions, then standalone)
const dropStatements = [
  'DROP TABLE IF EXISTS `flash_session_logs`',
  'DROP TABLE IF EXISTS `ecu_snapshots`',
  'DROP TABLE IF EXISTS `flash_queue`',
  'DROP TABLE IF EXISTS `flash_stats`',
  'DROP TABLE IF EXISTS `file_fingerprints`',
  'DROP TABLE IF EXISTS `flash_sessions`',
];

for (const sql of dropStatements) {
  console.log('  ', sql);
  await conn.query(sql);
}

console.log('\nCreating tables with correct schema...');

const createStatements = [
  // 1. flash_sessions (referenced by others)
  `CREATE TABLE \`flash_sessions\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`uuid\` varchar(64) NOT NULL,
    \`userId\` int NOT NULL,
    \`ecuType\` varchar(32) NOT NULL,
    \`ecuName\` varchar(128),
    \`flashMode\` enum('full_flash','calibration','patch_only') NOT NULL,
    \`connectionMode\` enum('simulator','pcan') NOT NULL,
    \`status\` enum('pending','running','success','failed','aborted') NOT NULL DEFAULT 'pending',
    \`fileHash\` varchar(64),
    \`fileName\` varchar(256),
    \`fileSize\` int,
    \`vin\` varchar(32),
    \`fileId\` varchar(128),
    \`totalBlocks\` int DEFAULT 0,
    \`totalBytes\` int DEFAULT 0,
    \`progress\` int DEFAULT 0,
    \`durationMs\` int,
    \`errorMessage\` text,
    \`nrcCode\` int,
    \`metadata\` json,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`flash_sessions_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`flash_sessions_uuid_unique\` UNIQUE(\`uuid\`)
  )`,

  // 2. flash_session_logs
  `CREATE TABLE \`flash_session_logs\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`sessionId\` int NOT NULL,
    \`timestampMs\` int NOT NULL,
    \`phase\` varchar(32) NOT NULL,
    \`type\` varchar(16) NOT NULL,
    \`message\` text NOT NULL,
    \`blockId\` int,
    \`nrcCode\` int,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`flash_session_logs_id\` PRIMARY KEY(\`id\`)
  )`,

  // 3. flash_queue
  `CREATE TABLE \`flash_queue\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`userId\` int NOT NULL,
    \`ecuType\` varchar(32) NOT NULL,
    \`flashMode\` enum('full_flash','calibration','patch_only') NOT NULL,
    \`status\` enum('queued','processing','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
    \`priority\` int NOT NULL DEFAULT 10,
    \`fileHash\` varchar(64),
    \`fileUrl\` varchar(512),
    \`fileName\` varchar(256),
    \`sessionId\` int,
    \`metadata\` json,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`flash_queue_id\` PRIMARY KEY(\`id\`)
  )`,

  // 4. ecu_snapshots
  `CREATE TABLE \`ecu_snapshots\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`sessionId\` int NOT NULL,
    \`snapshotType\` enum('pre_flash','post_flash') NOT NULL,
    \`ecuType\` varchar(32) NOT NULL,
    \`vin\` varchar(32),
    \`softwareVersions\` json,
    \`hardwareNumber\` varchar(64),
    \`dtcSnapshot\` json,
    \`didResponses\` json,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`ecu_snapshots_id\` PRIMARY KEY(\`id\`)
  )`,

  // 5. flash_stats
  `CREATE TABLE \`flash_stats\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`ecuType\` varchar(32) NOT NULL,
    \`totalAttempts\` int NOT NULL DEFAULT 0,
    \`successCount\` int NOT NULL DEFAULT 0,
    \`failCount\` int NOT NULL DEFAULT 0,
    \`avgDurationMs\` int DEFAULT 0,
    \`lastFlashAt\` timestamp,
    \`commonNrc\` int,
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`flash_stats_id\` PRIMARY KEY(\`id\`)
  )`,

  // 6. file_fingerprints
  `CREATE TABLE \`file_fingerprints\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`fileHash\` varchar(64) NOT NULL,
    \`ecuType\` varchar(32) NOT NULL,
    \`fileName\` varchar(256),
    \`fileSize\` int,
    \`flashCount\` int NOT NULL DEFAULT 0,
    \`lastSessionId\` int,
    \`lastResult\` enum('success','failed'),
    \`uploadedBy\` int NOT NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`file_fingerprints_id\` PRIMARY KEY(\`id\`)
  )`,
];

for (const sql of createStatements) {
  const tableName = sql.match(/CREATE TABLE `(\w+)`/)?.[1];
  console.log('  Creating', tableName);
  await conn.query(sql);
}

console.log('\nVerifying tables...');
for (const t of ['flash_sessions','flash_session_logs','flash_queue','flash_stats','ecu_snapshots','file_fingerprints']) {
  const [rows] = await conn.query('DESCRIBE ' + t);
  const cols = rows.map(r => r.Field);
  console.log(`  ${t}: ${cols.join(', ')}`);
}

await conn.end();
console.log('\nDone! All flash tables recreated with correct schema.');
