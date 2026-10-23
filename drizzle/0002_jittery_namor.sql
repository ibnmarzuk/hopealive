ALTER TABLE `registrations` ADD `guardianEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `registrations` ADD `dedupeKey` varchar(64);--> statement-breakpoint
ALTER TABLE `registrations` ADD `emailStatus` enum('pending','sent','failed','skipped') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `registrations` ADD `emailMessageId` varchar(64);--> statement-breakpoint
ALTER TABLE `registrations` ADD `emailSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `registrations` ADD `emailError` varchar(255);--> statement-breakpoint
UPDATE `registrations` SET `emailStatus` = 'skipped' WHERE `guardianEmail` IS NULL;--> statement-breakpoint
UPDATE `registrations` AS `r` JOIN (SELECT MIN(`id`) AS `keepId`, SHA2(CONCAT(LOWER(TRIM(REGEXP_REPLACE(`studentName`, '\\s+', ' '))), '|', CONCAT(IF(REGEXP_REPLACE(`guardianPhone`, '[^0-9+]', '') LIKE '+%', '+', ''), REPLACE(REGEXP_REPLACE(`guardianPhone`, '[^0-9+]', ''), '+', '')), '|', LOWER(TRIM(`schoolClass`))), 256) AS `fingerprint` FROM `registrations` GROUP BY `fingerprint`) AS `d` ON `r`.`id` = `d`.`keepId` SET `r`.`dedupeKey` = `d`.`fingerprint`;--> statement-breakpoint
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_dedupeKey_unique` UNIQUE(`dedupeKey`);
