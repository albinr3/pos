import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import dotenv from "dotenv"

const name=process.argv[2]
if(!/^cash_test_fiscal_next_\d+$/.test(name??""))throw Error("Base aislada requerida")
const env=dotenv.parse(readFileSync(".env.fiscal-test")), url=new URL(env.TEST_DATABASE_URL)
if(!["localhost","127.0.0.1"].includes(url.hostname)||url.port!=="55439"||url.pathname!=="/movopos_fiscal_test_2")throw Error("Servidor local no autorizado")
url.pathname=`/${name}`;process.env.DATABASE_URL=url.toString()
const {prisma}=await import("@/lib/db")
const {discardSaleFiscalDraft}=await import("@/lib/fiscal/core/preparation")
try {
 const accountId="baseline-account-doprep", user=await prisma.user.findFirstOrThrow({where:{accountId}}), actor={...user,isOwner:true}
 const [sale]=await prisma.$queryRaw<Array<{id:string}>>`SELECT s.id FROM "Sale" s WHERE s."accountId"=${accountId} AND NOT EXISTS (SELECT 1 FROM "FiscalDocument" d WHERE d."saleId"=s.id AND d.state<>'DESCARTADO') LIMIT 1`
 assert.ok(sale)
 const id=randomUUID(),policy=await prisma.fiscalSettings.findUniqueOrThrow({where:{accountId}})
 await prisma.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","saleId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES (${id},${accountId},${sale.id},'E44','BORRADOR',${policy.version},'test','{}'::jsonb,now())`
 const command={operationId:`discard-${randomUUID()}`,expectedRevision:1,reason:"Nueva revisión"}
 const result=await discardSaleFiscalDraft(actor,id,command),repeat=await discardSaleFiscalDraft(actor,id,command)
 assert.deepEqual(result,repeat);assert.equal(result.state,"DESCARTADO")
 assert.equal((await prisma.fiscalDocument.findUniqueOrThrow({where:{id}})).state,"DESCARTADO")
 assert.equal(await prisma.fiscalDocumentEvent.count({where:{accountId,documentId:id,state:"DESCARTADO"}}),1)
 const prepared=await prisma.fiscalDocument.findFirstOrThrow({where:{accountId,state:"PREPARADO_PENDIENTE_CONEXION"}})
 await assert.rejects(()=>discardSaleFiscalDraft(actor,prepared.id,{...command,operationId:`discard-${randomUUID()}`}),/sin preparar/)
 console.log("Descarte idempotente, historial y protección de documento preparado: aprobados")
} finally {await prisma.$disconnect()}
