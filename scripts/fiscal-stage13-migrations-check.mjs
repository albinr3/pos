// Verifica las migraciones reales sobre un esquema anterior creado en una base nueva local.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
const source=new URL(dotenv.parse(fs.readFileSync(".env.fiscal-test")).TEST_DATABASE_URL)
if(!["localhost","127.0.0.1"].includes(source.hostname)||source.port!=="55439"||source.pathname!=="/movopos_fiscal_test_2")throw Error("Instancia fiscal no autorizada")
const suffix=Date.now(),name=`cash_test_stage13_${suffix}`
if(!/^cash_test_stage13_\d+$/.test(name))throw Error("Nombre inválido")
const adminUrl=new URL(source);adminUrl.pathname="/postgres";adminUrl.search=""
const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}})
try{await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)}finally{await admin.$disconnect()}
const url=new URL(source);url.pathname=`/${name}`
const env={...process.env,DATABASE_URL:url.toString(),TEST_DATABASE_URL:url.toString()}
for(const key of Object.keys(env))if(/^(CLERK|NEXT_PUBLIC_CLERK|LEMON|RESEND|WHATSAPP|UPLOADTHING|OPENAI|SUPABASE|KAPSO|META|EXPO)/i.test(key))env[key]=""
let schema=fs.readFileSync("prisma/schema.prisma","utf8")
function editModel(name,change){const pattern=new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`);if(!pattern.test(schema))throw Error(`Falta modelo ${name}`);schema=schema.replace(pattern,block=>change(block))}
editModel("FiscalDocument",s=>s.replace(/^  supplierPaymentId String\?\r?\n/m,"").replace(/^  supplierPayment SupplierPayment\?.*\r?\n/m,""))
editModel("OperatingExpense",s=>s.replace(/^  fundingSource String.*\r?\n/m,"").replace(/^  fiscalExpenseDetails Json\?\r?\n/m,"").replace(/^  settlements EmployeeExpenseSettlement\[\].*\r?\n/m,""))
editModel("AccountPayable",s=>s.replace(/^  foreignOperation FiscalForeignOperation\?.*\r?\n/m,""))
editModel("SupplierPayment",s=>s.replace(/^  foreignAllocation FiscalForeignPayment\?.*\r?\n/m,"").replace(/^  fiscalDocuments FiscalDocument\[\].*\r?\n/m,"").replace(/^  @@unique\(\[accountId, id\]\)\r?\n/m,""))
for(const model of ["EmployeeExpenseSettlement","FiscalForeignOperation","FiscalForeignPayment"])schema=schema.replace(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}\\r?\\n`),"")
const schemaPath=path.resolve(`tmp/fiscal-stage13-prior-${suffix}.prisma`)
fs.writeFileSync(schemaPath,schema)
function run(args,timeout=60000){const r=spawnSync(process.execPath,args,{env,stdio:"inherit",windowsHide:true,timeout});if(r.error||r.status!==0)throw Error(`Falló ${args[0]}: ${r.error?.message||r.status}`)}
try{run(["node_modules/prisma/build/index.js","db","push","--schema",schemaPath,"--skip-generate"])}finally{fs.unlinkSync(schemaPath)}
const core=fs.readFileSync("prisma/migrations/20261109170000_fiscal_document_core/migration.sql","utf8")
const preparation=fs.readFileSync("prisma/migrations/20261110120000_fiscal_preparation/migration.sql","utf8")
const previousGuards=core.slice(core.indexOf("CREATE FUNCTION fiscal_protect_document()"))+"\n"+preparation.slice(preparation.indexOf("CREATE FUNCTION fiscal_protect_commercial_source()"))+"\n"+fs.readFileSync("prisma/migrations/20261110240000_fiscal_payable_protection/migration.sql","utf8")
const prior='ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_one_source" CHECK (num_nonnulls("saleId", "purchaseId", "returnId", "expenseId", "adjustmentId", "payableId") = 1);\n'
const sql=prior+previousGuards+"\n"+["20261111180000_fiscal_employee_expenses","20261111190000_fiscal_foreign_payments"].map(dir=>fs.readFileSync(`prisma/migrations/${dir}/migration.sql`,"utf8")).join("\n")
const psql=spawnSync(path.resolve("tmp/fiscal-postgres17/pgsql/bin/psql.exe"),["-X","-1","-v","ON_ERROR_STOP=1","-h",source.hostname,"-p",source.port,"-U",decodeURIComponent(source.username),"-d",name],{input:sql,encoding:"utf8",windowsHide:true,timeout:15000,env:{...env,PGPASSWORD:decodeURIComponent(source.password),PGSSLMODE:"disable"}})
if(psql.error||psql.status!==0)throw Error(psql.error?.message||psql.stderr)
console.log("Migraciones 12 y 13 aplicadas en base local nueva")
run(["--import","tsx","--test","scripts/fiscal-stage12.integration.test.mts"])
run(["--import","tsx","--test","scripts/fiscal-stage13.integration.test.mts"])
run(["--import","tsx","--test","scripts/fiscal-stage12-13-http.integration.test.mts"])
