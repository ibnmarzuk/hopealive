ALTER TABLE `registrations` ADD `receiptImage` mediumtext;--> statement-breakpoint
ALTER TABLE `registrations` ADD `receiptSubmittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `registrations` ADD `receiptAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `registrations` ADD `receiptAnalysis` json;--> statement-breakpoint
ALTER TABLE `registrations` ADD `verifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `registrations` ADD `verifiedBy` enum('ai','admin');