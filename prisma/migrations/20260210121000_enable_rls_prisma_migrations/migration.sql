-- Enable RLS for Prisma migrations table in public schema (PostgREST-exposed)
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  service_role_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
    INTO service_role_exists;

  IF service_role_exists AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = '_prisma_migrations'
      AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access"
      ON public."_prisma_migrations"
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = '_prisma_migrations'
      AND policyname = 'Postgres full access'
  ) THEN
    CREATE POLICY "Postgres full access"
      ON public."_prisma_migrations"
      FOR ALL
      TO postgres
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
