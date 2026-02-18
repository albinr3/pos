-- Enable RLS for CategorySequence (created after global RLS migration)
ALTER TABLE "CategorySequence" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  service_role_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role') INTO service_role_exists;

  IF service_role_exists
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'CategorySequence'
         AND policyname = 'Service role full access'
     ) THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "CategorySequence" FOR ALL TO service_role USING (true) WITH CHECK (true);';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'CategorySequence'
         AND policyname = 'Postgres full access'
     ) THEN
    EXECUTE 'CREATE POLICY "Postgres full access" ON "CategorySequence" FOR ALL TO postgres USING (true) WITH CHECK (true);';
  END IF;
END $$;
