// Base nueva en PostgreSQL local: no reutilizar ni modificar la base de otro chat.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
const source=new URL(dotenv.parse(fs.readFileSync(".env.fiscal-test")).TEST_DATABASE_URL)
if(!["localhost","127.0.0.1"].includes(source.hostname)||source.port!=="55439"||source.pathname!=="/movopos_fiscal_test_2") throw Error("Instancia fiscal no autorizada")
const name=`cash_test_stage12_${Date.now()}`
if(!/^cash_test_stage12_\d+$/.test(name)) throw Error("Nombre inválido")
const adminUrl=new URL(source);adminUrl.pathname="/postgres";adminUrl.search=""
const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}})
try { await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`) } finally { await admin.$disconnect() }
const url=new URL(source);url.pathname=`/${name}`
const env={...process.env,DATABASE_URL:url.toString(),TEST_DATABASE_URL:url.toString()}
for(const key of Object.keys(env)) if(/^(CLERK|NEXT_PUBLIC_CLERK|LEMON|RESEND|WHATSAPP|UPLOADTHING|OPENAI|SUPABASE|KAPSO|META|EXPO)/i.test(key)) env[key]=""
function run(args,timeout=60000) { const result=spawnSync(process.execPath,args,{env,stdio:"inherit",windowsHide:true,timeout}); if(result.error||result.status!==0)throw Error(`Falló ${args[0]}: ${result.error?.message || result.status}`) }
run(["scripts/setup-fiscal-baseline-db.mjs"])
// db push no instala triggers: aplicar la protección de gastos incluida en la migración.
const migration=fs.readFileSync("prisma/migrations/20261111180000_fiscal_employee_expenses/migration.sql","utf8")
const sql=migration.slice(migration.indexOf("CREATE FUNCTION fiscal_protect_employee_expense"))
const psql=spawnSync(path.resolve("tmp/fiscal-postgres17/pgsql/bin/psql.exe"),["-X","-1","-v","ON_ERROR_STOP=1","-h",source.hostname,"-p",source.port,"-U",decodeURIComponent(source.username),"-d",name],{input:sql,encoding:"utf8",windowsHide:true,timeout:15000,env:{...env,PGPASSWORD:decodeURIComponent(source.password),PGSSLMODE:"disable"}})
if(psql.error||psql.status!==0) throw Error(psql.error?.message||psql.stderr)
run(["--import","tsx","--test","scripts/fiscal-stage12.integration.test.mts"])
