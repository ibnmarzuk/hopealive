ALTER TABLE "registrations" ADD COLUMN "checkedInAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "checkedInBy" varchar(320);--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "entitlementsIssuedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "entitlementsIssuedBy" varchar(320);