ALTER TABLE "registrations" ADD COLUMN "familyCode" varchar(16);--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "familyPaymentLead" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "verifiedAmountNgn" integer;