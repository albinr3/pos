import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

const url = new URL(dotenv.parse(fs.readFileSync('.env.fiscal-test')).TEST_DATABASE_URL)
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost','127.0.0.1'].includes(url.hostname) || url.port !== '55439' || !/^\/movopos_fiscal_test(?:_\d+)?$/.test(url.pathname) || (url.searchParams.get('schema') && url.searchParams.get('schema') !== 'public')) throw Error('Solo se admite la base fiscal local aislada')
const db = new PrismaClient({datasources:{db:{url:url.toString()}}})
const psql = path.resolve('tmp/fiscal-postgres17/pgsql/bin/psql.exe')
function run(sql) {
  const result=spawnSync(psql,['-X','-1','-v','ON_ERROR_STOP=1','-h',url.hostname,'-p',url.port,'-U',decodeURIComponent(url.username),'-d',url.pathname.slice(1)],{input:sql,encoding:'utf8',windowsHide:true,env:{...process.env,PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'disable'}})
  if(result.error) throw result.error
  if(result.status !== 0) throw Error(`Falló SQL local: ${result.stderr}`)
}
try {
  const existing = await db.$queryRaw`SELECT to_regclass('public."FiscalDocument"')::text AS name`
  if (!existing[0].name) {
    run(fs.readFileSync('prisma/migrations/20261109170000_fiscal_document_core/migration.sql','utf8'))
    console.log('Migración de etapa 4 aplicada a la base fiscal local.')
  } else console.log('Tablas de etapa 4 ya presentes; no se reaplica la migración.')
  run(`
    BEGIN;
    DO $test$
    DECLARE a text; b text; u text; rejected boolean; sid text := 'fiscal-stage4-test-sale'; did text := 'fiscal-stage4-test-doc';
    BEGIN
      SELECT id INTO a FROM "Account" ORDER BY id LIMIT 1;
      SELECT id INTO b FROM "Account" WHERE id <> a ORDER BY id LIMIT 1;
      SELECT id INTO u FROM "User" WHERE "accountId" = a LIMIT 1;
      IF a IS NULL OR b IS NULL OR u IS NULL THEN RAISE EXCEPTION 'Faltan fixtures'; END IF;
      INSERT INTO "Sale" (id,"accountId","updatedAt","invoiceNumber","invoiceCode",type,"userId","subtotalCents","itbisCents","totalCents") VALUES (sid,a,now(),1999999998,'TEST-FISCAL-4','CONTADO',u,100,0,100);
      rejected := false;
      BEGIN
        INSERT INTO "FiscalDocument" (id,"accountId","saleId",type,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES ('cross',b,sid,'E31',1,'test','{}',now());
      EXCEPTION WHEN foreign_key_violation THEN rejected := true; END;
      IF NOT rejected THEN RAISE EXCEPTION 'El origen cruzó empresas'; END IF;
      INSERT INTO "FiscalDocument" (id,"accountId","saleId",type,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES (did,a,sid,'E31',1,'test','{"issuer":"original"}',now());
      INSERT INTO "FiscalDocumentLine" (id,"accountId","documentId",position,snapshot) VALUES ('fiscal-stage4-test-line',a,did,1,'{"name":"original"}');
      rejected := false;
      BEGIN
        INSERT INTO "FiscalDocumentLine" (id,"accountId","documentId",position,snapshot) VALUES ('crossline',b,did,1,'{}');
      EXCEPTION WHEN foreign_key_violation THEN rejected := true; END;
      IF NOT rejected THEN RAISE EXCEPTION 'El detalle cruzó empresas'; END IF;
      UPDATE "FiscalDocument" SET state='VALIDADO' WHERE id=did;
      UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION' WHERE id=did;
      rejected := false;
      BEGIN UPDATE "FiscalDocument" SET snapshot='{}' WHERE id=did; EXCEPTION WHEN raise_exception THEN rejected := true; END;
      IF NOT rejected THEN RAISE EXCEPTION 'La copia preparada pudo editarse'; END IF;
      rejected := false;
      BEGIN UPDATE "FiscalDocumentLine" SET snapshot='{}' WHERE "documentId"=did; EXCEPTION WHEN raise_exception THEN rejected := true; END;
      IF NOT rejected THEN RAISE EXCEPTION 'La línea preparada pudo editarse'; END IF;
    END $test$;
    ROLLBACK;
  `)
  console.log('Origen, aislamiento y congelación verificados; fixtures revertidos.')
} finally { await db.$disconnect() }
