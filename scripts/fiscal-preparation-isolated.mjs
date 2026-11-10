import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
const config=dotenv.parse(fs.readFileSync('.env.fiscal-test'))
const source=new URL(config.TEST_DATABASE_URL)
if(!['localhost','127.0.0.1'].includes(source.hostname)||source.port!=='55439'||source.pathname!=='/movopos_fiscal_test_2')throw Error('Se requiere PostgreSQL fiscal local aislado')
const name=`cash_test_fiscal_stage6_${Date.now()}`, adminUrl=new URL(source),testUrl=new URL(source);adminUrl.pathname='/postgres';adminUrl.search='';testUrl.pathname=`/${name}`
const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}})
try {const found=await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname=${name}`;if(found.length||!/^cash_test_fiscal_stage6_\d+$/.test(name))throw Error('Base ya existente');await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)}finally{await admin.$disconnect()}
const env={...process.env,DATABASE_URL:testUrl.toString(),TEST_DATABASE_URL:testUrl.toString()}
for(const key of Object.keys(env))if(/^(CLERK|NEXT_PUBLIC_CLERK|LEMON|RESEND|WHATSAPP|UPLOADTHING|OPENAI|SUPABASE|KAPSO|META|EXPO)/i.test(key))env[key]=''
const setup=spawnSync(process.execPath,['scripts/setup-fiscal-baseline-db.mjs'],{env,stdio:'inherit',windowsHide:true,timeout:120000})
if(setup.error||setup.status!==0)throw Error('Falló preparación de base aislada')
const stage4=fs.readFileSync('prisma/migrations/20261109170000_fiscal_document_core/migration.sql','utf8').replaceAll('CREATE UNIQUE INDEX "Sale_accountId_id_key"','CREATE UNIQUE INDEX IF NOT EXISTS "Sale_accountId_id_key"').replaceAll('CREATE UNIQUE INDEX "Purchase_accountId_id_key"','CREATE UNIQUE INDEX IF NOT EXISTS "Purchase_accountId_id_key"').replaceAll('CREATE UNIQUE INDEX "Return_accountId_id_key"','CREATE UNIQUE INDEX IF NOT EXISTS "Return_accountId_id_key"').replaceAll('CREATE UNIQUE INDEX "OperatingExpense_accountId_id_key"','CREATE UNIQUE INDEX IF NOT EXISTS "OperatingExpense_accountId_id_key"')
// Solo se sustituyen tablas fiscales recién creadas por db push en esta base desechable.
const sql='DROP TABLE "FiscalPreparationOperation", "FiscalDocumentRevision", "FiscalSequenceEvent", "FiscalNumberAllocation", "FiscalSequence", "FiscalDocumentLine", "FiscalDocumentReference", "FiscalDocumentEvent", "FiscalDocument" CASCADE;\n'+stage4+'\n'+fs.readFileSync('prisma/migrations/20261109180000_fiscal_sequences/migration.sql','utf8')+'\n'+fs.readFileSync('prisma/migrations/20261110120000_fiscal_preparation/migration.sql','utf8')+'\n'+fs.readFileSync('prisma/migrations/20261110130000_fiscal_sequence_rollover/migration.sql','utf8')
const result=spawnSync(path.resolve('tmp/fiscal-postgres17/pgsql/bin/psql.exe'),['-X','-1','-v','ON_ERROR_STOP=1','-h',source.hostname,'-p',source.port,'-U',decodeURIComponent(source.username),'-d',name],{input:sql,encoding:'utf8',windowsHide:true,env:{...env,PGPASSWORD:decodeURIComponent(source.password),PGSSLMODE:'disable'},timeout:60000})
if(result.error||result.status!==0)throw Error(`Falló migración aislada: ${result.error?.message||result.stderr}`)
const test=spawnSync(process.execPath,['--import','tsx','--test','scripts/fiscal-preparation.integration.test.mts'],{env,stdio:'inherit',windowsHide:true,timeout:120000})
if(test.error||test.status!==0)throw Error(`Falló prueba fiscal etapa 6: ${test.error?.message||test.status}`)
