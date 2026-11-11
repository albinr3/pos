// Todas las comprobaciones de la etapa comparten un único plazo, incluido el arranque.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"

const deadline=Date.now()+295000
process.on("uncaughtException",error=>{console.error(error);console.error(`Tiempo de comprobaciones: ${((Date.now()-(deadline-295000))/1000).toFixed(1)} segundos`);process.exitCode=1})
function run(label,args,env=process.env) {
  const remaining=deadline-Date.now()
  if(remaining<=1000) throw Error(`Plazo agotado antes de ${label}`)
  console.log(`\nComprobación: ${label}`)
  const result=spawnSync(process.execPath,args,{env,stdio:"inherit",windowsHide:true,timeout:remaining})
  if(result.error||result.status!==0) throw Error(`${label}: ${result.error?.message??result.status}`)
}
const source=new URL(dotenv.parse(fs.readFileSync(".env.fiscal-test")).TEST_DATABASE_URL)
if(!["localhost","127.0.0.1"].includes(source.hostname)||source.port!=="55439"||source.pathname!=="/movopos_fiscal_test_2")throw Error("Instancia fiscal no autorizada")
const status=spawnSync(process.execPath,["scripts/fiscal-test-pg17.mjs","status"],{stdio:"ignore",windowsHide:true,timeout:Math.max(1000,deadline-Date.now())})
// pg_ctl start devuelve error si la instancia aislada ya está funcionando.
if(status.status!==0)run("iniciar PostgreSQL local",["scripts/fiscal-test-pg17.mjs","start"])
const suffix=Date.now(),name=`cash_test_stage14_${suffix}`
if(!/^cash_test_stage14_\d+$/.test(name))throw Error("Nombre de base inválido")
const adminUrl=new URL(source);adminUrl.pathname="/postgres";adminUrl.search=""
const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}})
try{await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)}finally{await admin.$disconnect()}
const url=new URL(source);url.pathname=`/${name}`
const env={...process.env,DATABASE_URL:url.toString(),TEST_DATABASE_URL:url.toString()}
for(const key of Object.keys(env))if(/^(CLERK|NEXT_PUBLIC_CLERK|LEMON|RESEND|WHATSAPP|UPLOADTHING|OPENAI|SUPABASE|KAPSO|META|EXPO)/i.test(key))env[key]=""
run("validar esquema Prisma actual",["node_modules/prisma/build/index.js","validate","--schema","prisma/schema.prisma"],env)
let schema=fs.readFileSync("prisma/schema.prisma","utf8")
schema=schema.replace(/^  fiscalReceivedDocuments FiscalReceivedDocument\[\]\r?\n/m,"").replace(/^  fiscalReceivedOperations FiscalReceivedOperation\[\]\r?\n/m,"")
for(const model of ["FiscalReceivedDocument","FiscalReceivedOperation"])schema=schema.replace(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}\\r?\\n`),"")
const schemaPath=path.resolve(`tmp/fiscal-stage14-prior-${suffix}.prisma`)
fs.writeFileSync(schemaPath,schema)
try{run("crear esquema anterior aislado",["node_modules/prisma/build/index.js","db","push","--schema",schemaPath,"--skip-generate"],env)}finally{fs.unlinkSync(schemaPath)}
const migration=fs.readFileSync("prisma/migrations/20261112000000_fiscal_received_metadata/migration.sql","utf8")
const psql=spawnSync(path.resolve("tmp/fiscal-postgres17/pgsql/bin/psql.exe"),["-X","-1","-v","ON_ERROR_STOP=1","-h",source.hostname,"-p",source.port,"-U",decodeURIComponent(source.username),"-d",name],{input:migration,encoding:"utf8",windowsHide:true,timeout:Math.max(1000,deadline-Date.now()),env:{...env,PGPASSWORD:decodeURIComponent(source.password),PGSSLMODE:"disable"}})
if(psql.error||psql.status!==0)throw Error(`Migración etapa 14: ${psql.error?.message??psql.stderr}`)
console.log("Migración de etapa 14 aplicada a esquema local anterior")
run("integración fiscal y móvil",["--import","tsx","--test","scripts/fiscal-stage14.integration.test.mts"],env)
run("regresiones ordinarias existentes",["--test","--experimental-test-isolation=none","scripts/sales-save-regression.test.mjs","scripts/sale-notes-api-print.test.mjs"],env)
const tsConfig=path.resolve(`tmp/fiscal-stage14-tsconfig-${suffix}.json`)
fs.writeFileSync(tsConfig,JSON.stringify({extends:"../tsconfig.fiscal-test.json",include:["../next-env.d.ts","../src/**/*.ts","../src/**/*.tsx"],exclude:["../node_modules","../tmp","../blogcreator"]}))
try{run("tipos de fuentes",["node_modules/typescript/bin/tsc","--project",tsConfig,"--noEmit","--incremental","false"],env)}finally{fs.unlinkSync(tsConfig)}
console.log(`Comprobaciones completadas en ${((Date.now()-(deadline-295000))/1000).toFixed(1)} segundos`)
