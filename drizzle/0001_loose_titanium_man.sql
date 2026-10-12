CREATE TABLE `registration_counters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`classGroup` varchar(32) NOT NULL,
	`lastNumber` int NOT NULL DEFAULT 0,
	CONSTRAINT `registration_counters_id` PRIMARY KEY(`id`),
	CONSTRAINT `registration_counters_classGroup_unique` UNIQUE(`classGroup`)
);
--> statement-breakpoint
CREATE TABLE `registrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentName` varchar(160) NOT NULL,
	`guardianPhone` varchar(32) NOT NULL,
	`schoolClass` varchar(64) NOT NULL,
	`classGroup` varchar(32) NOT NULL,
	`registrationNumber` varchar(32) NOT NULL,
	`paymentStatus` enum('pending_payment','payment_claimed','under_review','verified','rejected','completed') NOT NULL DEFAULT 'pending_payment',
	`receiptStatus` enum('not_submitted','submitted') NOT NULL DEFAULT 'not_submitted',
	`verificationStatus` enum('pending','verified','rejected','clarification') NOT NULL DEFAULT 'pending',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `registrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `registrations_registrationNumber_unique` UNIQUE(`registrationNumber`)
);
