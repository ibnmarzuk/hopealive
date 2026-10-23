CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending_payment', 'payment_claimed', 'under_review', 'verified', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('not_submitted', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'verified', 'rejected', 'clarification');--> statement-breakpoint
CREATE TYPE "public"."verified_by" AS ENUM('ai', 'admin');--> statement-breakpoint
CREATE TABLE "registration_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"classGroup" varchar(32) NOT NULL,
	"lastNumber" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "registration_counters_classGroup_unique" UNIQUE("classGroup")
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentName" varchar(160) NOT NULL,
	"guardianEmail" varchar(320),
	"guardianPhone" varchar(32) NOT NULL,
	"schoolClass" varchar(64) NOT NULL,
	"classGroup" varchar(32) NOT NULL,
	"registrationNumber" varchar(32) NOT NULL,
	"dedupeKey" varchar(64),
	"paymentStatus" "payment_status" DEFAULT 'pending_payment' NOT NULL,
	"receiptStatus" "receipt_status" DEFAULT 'not_submitted' NOT NULL,
	"verificationStatus" "verification_status" DEFAULT 'pending' NOT NULL,
	"emailStatus" "email_status" DEFAULT 'pending' NOT NULL,
	"emailMessageId" varchar(64),
	"emailSentAt" timestamp with time zone,
	"emailError" varchar(255),
	"receiptImage" text,
	"receiptSubmittedAt" timestamp with time zone,
	"receiptAttempts" integer DEFAULT 0 NOT NULL,
	"receiptAnalysis" jsonb,
	"verifiedAt" timestamp with time zone,
	"verifiedBy" "verified_by",
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_registrationNumber_unique" UNIQUE("registrationNumber"),
	CONSTRAINT "registrations_dedupeKey_unique" UNIQUE("dedupeKey")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
