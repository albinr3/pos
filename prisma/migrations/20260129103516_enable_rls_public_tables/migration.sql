-- Enable Row Level Security on all public tables
-- Excludes _prisma_migrations to prevent migration issues
-- Creates policies for service_role (if exists) and postgres to maintain backend access

DO $$
DECLARE 
  r record;
  service_role_exists boolean;
BEGIN
  -- Check if service_role exists (only exists in Supabase, not in local PostgreSQL)
  SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role') INTO service_role_exists;

  FOR r IN 
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename != '_prisma_migrations'
  LOOP
    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    
    -- Policy for service_role (only in Supabase production)
    IF service_role_exists THEN
      EXECUTE format('CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', r.tablename);
    END IF;
    
    -- Policy for postgres role (direct DB access, migrations, admin)
    EXECUTE format('CREATE POLICY "Postgres full access" ON public.%I FOR ALL TO postgres USING (true) WITH CHECK (true);', r.tablename);
  END LOOP;
END $$;