DO $$
DECLARE
  prisma_migrations_exists boolean;
  service_role_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = '_prisma_migrations'
  ) INTO prisma_migrations_exists;

  IF prisma_migrations_exists THEN
    EXECUTE 'ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;

  SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
    INTO service_role_exists;

  IF prisma_migrations_exists
    AND service_role_exists
    AND NOT EXISTS (
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

  IF prisma_migrations_exists
    AND NOT EXISTS (
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
