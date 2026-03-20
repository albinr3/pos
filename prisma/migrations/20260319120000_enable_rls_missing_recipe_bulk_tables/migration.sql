DO $$
DECLARE
  r record;
  service_role_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
    INTO service_role_exists;

  FOR r IN
    SELECT unnest(ARRAY[
      'SaleItemRecipeAdjustment',
      'QuoteItemRecipeAdjustment',
      'ProductRecipeItem',
      'SaleItemConsumption',
      'InventoryBulkOperation',
      'InventoryBulkSnapshot'
    ]) AS tablename
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = r.tablename
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;',
        r.tablename
      );

      IF service_role_exists
         AND NOT EXISTS (
           SELECT 1
           FROM pg_policies
           WHERE schemaname = 'public'
             AND tablename = r.tablename
             AND policyname = 'Service role full access'
         ) THEN
        EXECUTE format(
          'CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
          r.tablename
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = r.tablename
          AND policyname = 'Postgres full access'
      ) THEN
        EXECUTE format(
          'CREATE POLICY "Postgres full access" ON public.%I FOR ALL TO postgres USING (true) WITH CHECK (true);',
          r.tablename
        );
      END IF;
    END IF;
  END LOOP;
END $$;
