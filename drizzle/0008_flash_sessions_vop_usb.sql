-- Add V-OP USB2CAN as a recorded flash transport (Web Serial), alongside simulator and PCAN.
ALTER TABLE `flash_sessions` MODIFY COLUMN `connectionMode` enum('simulator','pcan','vop_usb') NOT NULL;
