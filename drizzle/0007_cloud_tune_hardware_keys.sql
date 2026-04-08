-- Optional hardware link keys: cloud enrollment ↔ Tune Deploy devices (VIN, programmer S/N, ECU S/N).
-- Apply with your migration workflow (e.g. drizzle-kit migrate) or run manually against MySQL.

ALTER TABLE `cloud_enrollments`
  ADD `programmerSerial` varchar(128),
  ADD `ecuSerial` varchar(128);

ALTER TABLE `tune_deploy_devices`
  ADD `ecuSerial` varchar(128);
