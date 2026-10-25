DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'entitlementsIssuedAt'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'entitlementsEligibleAt'
    ) THEN
      UPDATE "registrations"
      SET "entitlementsEligibleAt" = COALESCE("entitlementsEligibleAt", "entitlementsIssuedAt");
      ALTER TABLE "registrations" DROP COLUMN "entitlementsIssuedAt";
    ELSE
      ALTER TABLE "registrations"
      RENAME COLUMN "entitlementsIssuedAt" TO "entitlementsEligibleAt";
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'entitlementsIssuedBy'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'entitlementsEligibleBy'
    ) THEN
      UPDATE "registrations"
      SET "entitlementsEligibleBy" = COALESCE("entitlementsEligibleBy", "entitlementsIssuedBy");
      ALTER TABLE "registrations" DROP COLUMN "entitlementsIssuedBy";
    ELSE
      ALTER TABLE "registrations"
      RENAME COLUMN "entitlementsIssuedBy" TO "entitlementsEligibleBy";
    END IF;
  END IF;
END $$;