// Comparación de metadatos: nunca consultar filas comerciales ni modificar producción.
import fs from 'node:fs'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

const production = dotenv.parse(fs.readFileSync('.env')).DATABASE_URL_PROD
const test = dotenv.parse(fs.readFileSync('.env.fiscal-test')).TEST_DATABASE_URL
if (!production || !test) throw new Error('Faltan conexiones de producción o de prueba')
const localUrl = new URL(test)
if (!['postgres:', 'postgresql:'].includes(localUrl.protocol) || !['localhost', '127.0.0.1'].includes(localUrl.hostname) || !/^\/movopos_fiscal_test(?:_\d+)?$/.test(localUrl.pathname) || [...localUrl.searchParams.keys()].some(key => key !== 'schema') || (localUrl.searchParams.get('schema') && localUrl.searchParams.get('schema') !== 'public')) throw new Error('La conexión de prueba debe apuntar a una base local autorizada')

const metadata = `
SELECT 'column' kind, c.table_name object, c.column_name detail,
  jsonb_build_array(c.udt_schema,c.udt_name,c.is_nullable,c.column_default,c.character_maximum_length,c.numeric_precision,c.numeric_scale,c.datetime_precision,c.identity_generation,c.is_generated)::text definition
FROM information_schema.columns c WHERE c.table_schema='public'
UNION ALL SELECT 'index', tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public'
UNION ALL SELECT 'constraint', t.relname, con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con JOIN pg_class t ON t.oid=con.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND con.contype <> 'n'
UNION ALL SELECT 'relation', c.relname, c.relkind::text,
  jsonb_build_array(c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner))::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
UNION ALL SELECT 'trigger', t.relname, tr.tgname, pg_get_triggerdef(tr.oid)
FROM pg_trigger tr JOIN pg_class t ON t.oid=tr.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND NOT tr.tgisinternal
UNION ALL SELECT 'enum', ty.typname, en.enumlabel, (row_number() OVER (PARTITION BY ty.oid ORDER BY en.enumsortorder))::text
FROM pg_enum en JOIN pg_type ty ON ty.oid=en.enumtypid JOIN pg_namespace n ON n.oid=ty.typnamespace WHERE n.nspname='public'
UNION ALL SELECT 'policy', tablename, policyname, jsonb_build_array(permissive,roles,cmd,qual,with_check)::text FROM pg_policies WHERE schemaname='public'
UNION ALL SELECT 'view', viewname, '', definition FROM pg_views WHERE schemaname='public'
UNION ALL SELECT 'matview', matviewname, '', definition FROM pg_matviews WHERE schemaname='public'
UNION ALL SELECT 'routine', p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')
UNION ALL SELECT 'table_grant', c.relname, coalesce(grantee.rolname,'PUBLIC'),
  jsonb_agg(jsonb_build_array(x.privilege_type,x.is_grantable,pg_get_userbyid(x.grantor)) ORDER BY x.privilege_type,x.is_grantable,pg_get_userbyid(x.grantor))::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x LEFT JOIN pg_roles grantee ON grantee.oid=x.grantee
WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') GROUP BY c.relname, grantee.rolname
ORDER BY kind, object, detail`

async function readCatalog(url) {
  const db = new PrismaClient({ datasources: { db: { url } } })
  try {
    return await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'")
      const objects = await tx.$queryRawUnsafe(metadata)
      // El hash cubre únicamente el historial técnico de Prisma, sin imprimir logs ni datos.
      const migrations = await tx.$queryRaw`SELECT id, md5(row_to_json(m)::text) AS checksum FROM (SELECT id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count FROM "_prisma_migrations") m ORDER BY id`
      const server = await tx.$queryRaw`SELECT current_setting('server_version') AS version,current_setting('server_encoding') AS encoding,datcollate AS collation,datctype AS ctype FROM pg_database WHERE datname=current_database()`
      const extensions = await tx.$queryRaw`SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1`
      const roles = await tx.$queryRaw`SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role') ORDER BY rolname`
      return { objects, migrations, server: server[0], extensions, roles }
    }, { timeout: 30000 })
  } finally { await db.$disconnect() }
}

function compare(left, right, key, value) {
  const a = new Map(left.map(row => [key(row), value(row)]))
  const b = new Map(right.map(row => [key(row), value(row)]))
  if (a.size !== left.length || b.size !== right.length) throw new Error('El catálogo contiene claves duplicadas; comparación incompleta')
  return {
    soloPrueba: [...a.keys()].filter(k => !b.has(k)),
    soloProduccion: [...b.keys()].filter(k => !a.has(k)),
    distintas: [...a.keys()].filter(k => b.has(k) && a.get(k) !== b.get(k)),
  }
}

try {
  const [local, remote] = await Promise.all([readCatalog(test), readCatalog(production)])
  const objects = compare(local.objects, remote.objects, row => JSON.stringify([row.kind,row.object,row.detail]), row => row.definition)
  const migrations = compare(local.migrations, remote.migrations, row => row.id, row => row.checksum)
  const differences = Object.values(objects).reduce((n, xs) => n + xs.length, 0) + Object.values(migrations).reduce((n, xs) => n + xs.length, 0)
  const platformMatches = JSON.stringify(local.server) === JSON.stringify(remote.server) && JSON.stringify(local.extensions) === JSON.stringify(remote.extensions) && JSON.stringify(local.roles) === JSON.stringify(remote.roles)
  console.log(JSON.stringify({ objetos: { prueba: local.objects.length, produccion: remote.objects.length, ...objects }, migraciones: { prueba: local.migrations.length, produccion: remote.migrations.length, ...migrations }, plataforma: { coincide: platformMatches, prueba: { servidor: local.server, extensiones: local.extensions, roles: local.roles }, produccion: { servidor: remote.server, extensiones: remote.extensions, roles: remote.roles } } }, null, 2))
  // Un esquema público igual no convierte en idéntica una plataforma con otra versión o extensiones.
  if (differences || !platformMatches) process.exitCode = 1
} catch (error) {
  // Las excepciones del cliente pueden incluir cadenas de conexión; nunca imprimirlas.
  console.error(`Comparación incompleta (${error.code || error.name || 'error'})`)
  process.exitCode = 1
}
