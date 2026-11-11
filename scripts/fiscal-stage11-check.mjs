// Reutiliza una base aislada existente; no usa DATABASE_URL ni borra datos.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
const source=new URL(dotenv.parse(fs.readFileSync(".env.fiscal-test")).TEST_DATABASE_URL)
if (!["localhost","127.0.0.1"].includes(source.hostname) || source.port!=="55439" || source.pathname!=="/movopos_fiscal_test_2") throw Error("Instancia fiscal de pruebas no autorizada")
const adminUrl=new URL(source);adminUrl.pathname="/postgres"
const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}})
const rows=await admin.$queryRaw`SELECT datname FROM pg_database WHERE datname LIKE 'cash_test_stage10_%' ORDER BY datname DESC LIMIT 1`
await admin.$disconnect()
const name=rows[0]?.datname
if (!name || !/^cash_test_stage10_\d+$/.test(name)) throw Error("No existe una base aislada de la etapa anterior")
const url=new URL(source);url.pathname=`/${name}`
const db=new PrismaClient({datasources:{db:{url:url.toString()}}})
const columns=await db.$queryRaw`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (table_name='Purchase' OR table_name='AccountPayable' OR table_name='FiscalDocument')`
const tables=await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='FiscalForeignOperation'`
const guards=await db.$queryRaw`SELECT tgname FROM pg_trigger WHERE tgname='AccountPayable_e41_fiscal_protected' AND NOT tgisinternal`
await db.$disconnect()
const has=(table,column)=>columns.some(row=>row.table_name===table&&row.column_name===column)
const steps=[['Purchase','supplierReceiptNumber','20261110190000_purchase_supplier_receipt'],['AccountPayable','description','20261110200000_payable_without_inventory'],['FiscalDocument','payableId','20261110210000_fiscal_payable_source'],['Purchase','supplierNetPaidCents','20261110220000_fiscal_purchase_cash_net'],['AccountPayable','supplierReceiptNumber','20261110230000_payable_supplier_receipt'],...(!guards.length?[['FiscalGuard','id','20261110240000_fiscal_payable_protection']]:[]),...(fs.existsSync('prisma/migrations/20261111190000_fiscal_foreign_payments/migration.sql')&&!tables.length?[['FiscalForeignOperation','id','20261111190000_fiscal_foreign_payments']]:[])]
for(const [table,column,dir] of steps) if(!has(table,column)) {
 const sql=fs.readFileSync(`prisma/migrations/${dir}/migration.sql`,'utf8')
 const run=spawnSync(path.resolve('tmp/fiscal-postgres17/pgsql/bin/psql.exe'),['-X','-1','-v','ON_ERROR_STOP=1','-h',source.hostname,'-p',source.port,'-U',decodeURIComponent(source.username),'-d',name],{input:sql,encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,PGPASSWORD:decodeURIComponent(source.password),PGSSLMODE:'disable'}})
 if(run.error||run.status!==0) throw Error(`No se pudo actualizar la base aislada: ${run.error?.message || run.stderr}`)
}
const env={...process.env,DATABASE_URL:url.toString(),TEST_DATABASE_URL:url.toString()}
for(const key of Object.keys(env)) if(/^(CLERK|NEXT_PUBLIC_CLERK|LEMON|RESEND|WHATSAPP|UPLOADTHING|OPENAI|SUPABASE|KAPSO|META|EXPO)/i.test(key)) env[key]=''
const run=spawnSync(process.execPath,['--import','tsx','--test','scripts/fiscal-stage11.integration.test.mts'],{env,stdio:'inherit',windowsHide:true,timeout:90000})
if(run.error||run.status!==0) throw Error(`Falló la prueba de etapa 11: ${run.error?.message || run.status}`)
