import { createHash, randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { FiscalDocumentError } from "./document"

type Actor = PermissionAwareUser & { id: string; accountId: string }
type Kind = "PURCHASE" | "PAYABLE" | "EXPENSE"
type Row = { id: string; sourceKind: Kind; sourceId: string; data: Record<string,unknown>; revision: number; createdBy: string; updatedBy: string; createdAt: Date; updatedAt: Date }
type Data = { number: string; type: string; issueDate: string; supplierName: string; supplierIdentification: string; currency: string; baseCents: number; taxCents: number; withheldCents: number; totalCents: number }
const fail = (code:string, message:string, status:number, field?:string):never => { throw new FiscalDocumentError(code,message,status,field ? [{field,message}] : []) }
const kinds:Kind[] = ["PURCHASE", "PAYABLE", "EXPENSE"]
function object(value:unknown):Record<string,unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return fail("INVALID_INPUT","Se esperaba un objeto",400); return value as Record<string,unknown> }
function str(value:unknown, field:string, max:number) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) return fail("INVALID_INPUT",`Indica ${field}`,400,field); return value.trim() }
function cents(value:unknown, field:string) { if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 2147483647) return fail("INVALID_INPUT","El importe debe ser un número entero de centavos",400,field); return value as number }
function parseData(value:unknown):Data {
  const data=object(value), allowed=["number","type","issueDate","supplierName","supplierIdentification","currency","baseCents","taxCents","withheldCents","totalCents"]
  if (Object.keys(data).some(key=>!allowed.includes(key))) fail("INVALID_INPUT","El documento solo admite datos escritos conocidos",400)
  const issueDate=str(data.issueDate,"issueDate",10), date=new Date(`${issueDate}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0,10)!==issueDate) fail("INVALID_INPUT","Fecha inválida",400,"issueDate")
  const currency=str(data.currency,"currency",3).toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) fail("INVALID_INPUT","Moneda inválida",400,"currency")
  return {number:str(data.number,"number",50),type:str(data.type,"type",40),issueDate,supplierName:str(data.supplierName,"supplierName",150),supplierIdentification:str(data.supplierIdentification,"supplierIdentification",50),currency,baseCents:cents(data.baseCents,"baseCents"),taxCents:cents(data.taxCents,"taxCents"),withheldCents:cents(data.withheldCents,"withheldCents"),totalCents:cents(data.totalCents,"totalCents")}
}
function canSource(actor:Actor,kind:Kind) { return kind === "EXPENSE" ? hasPermission(actor,"canManageExpenses") : kind === "PAYABLE" ? hasPermission(actor,"canManagePurchases") && hasPermission(actor,"canAccessAccountsPayable") : hasPermission(actor,"canManagePurchases") }
function permit(actor:Actor,kind:Kind,write=false) {
  if (!hasPermission(actor,"canViewFiscalDocuments") || !canSource(actor,kind) || (write && !hasPermission(actor,"canPrepareFiscalDocuments"))) fail("FORBIDDEN","Sin permiso para el comprobante recibido",403)
}
function parseKind(value:unknown):Kind { if (typeof value!=="string" || !kinds.includes(value as Kind)) return fail("INVALID_INPUT","Origen inválido",400,"sourceKind"); return value as Kind }

async function source(tx:Prisma.TransactionClient,actor:Actor,kind:Kind,id:string, includeCancelled=false) {
  if (kind === "PURCHASE") {
    const row=await tx.purchase.findFirst({where:{accountId:actor.accountId,id,...(includeCancelled?{}:{cancelledAt:null})},select:{id:true,totalCents:true,supplierReceiptNumber:true,supplierNetPaidCents:true}})
    return row ?? fail("NOT_FOUND","Compra no encontrada",404)
  }
  if (kind === "PAYABLE") {
    // Una compra y su deuda son el mismo origen; no permitir dos comprobantes para el mismo hecho.
    const row=await tx.accountPayable.findFirst({where:{accountId:actor.accountId,id,purchaseId:null},select:{id:true,totalCents:true,supplierReceiptNumber:true}})
    return row ?? fail("NOT_FOUND","Obligación no encontrada o vinculada a una compra",404)
  }
  const row=await tx.operatingExpense.findFirst({where:{accountId:actor.accountId,id,...(includeCancelled?{}:{cancelledAt:null})},select:{id:true,amountCents:true}})
  return row ? { ...row, totalCents:row.amountCents, supplierReceiptNumber:null } : fail("NOT_FOUND","Gasto no encontrado",404)
}

export async function saveReceivedDocument(actor:Actor,raw:unknown) {
  const body=object(raw), kind=parseKind(body.sourceKind), sourceId=str(body.sourceId,"sourceId",100), operationId=str(body.operationId,"operationId",100), data=parseData(body.data)
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(operationId)) fail("INVALID_INPUT","Identificador de operación inválido",400,"operationId")
  if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number)<0) fail("INVALID_INPUT","Revisión inválida",400,"expectedRevision")
  if (Object.keys(body).some(key=>!["sourceKind","sourceId","operationId","expectedRevision","data"].includes(key))) fail("INVALID_INPUT","Campo no admitido",400)
  permit(actor,kind,true)
  const digest=createHash("sha256").update(JSON.stringify({kind,sourceId,expectedRevision:body.expectedRevision,data})).digest("hex")
  return prisma.$transaction(async tx=>{
    // El mismo bloqueo que preparar E41 impide que una captura y una preparación se crucen.
    const accounts=await tx.$queryRaw<Array<{deletionRequestedAt:Date|null}>>`SELECT "deletionRequestedAt" FROM "Account" WHERE id=${actor.accountId} FOR NO KEY UPDATE`
    if(!accounts.length||accounts[0].deletionRequestedAt) fail("ACCOUNT_DELETING","La empresa está en proceso de baja",403)
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.accountId},517))::text`
    const previous=await tx.$queryRaw<Array<{actorUserId:string;payloadHash:string;result:unknown}>>`SELECT "actorUserId","payloadHash",result FROM "FiscalReceivedOperation" WHERE "accountId"=${actor.accountId} AND "operationId"=${operationId}`
    if (previous[0]) { if(previous[0].actorUserId!==actor.id || previous[0].payloadHash!==digest) fail("OPERATION_CONFLICT","El identificador corresponde a otra operación",409); return previous[0].result }
    const settings=await tx.fiscalSettings.findUnique({where:{accountId:actor.accountId}})
    if (!settings?.enabled || settings.jurisdiction!=="DO" || settings.regime!=="DO_ECF") fail("PROFILE_UNAVAILABLE","Activa la configuración fiscal para registrar documentos",409)
    const origin=await source(tx,actor,kind,sourceId)
    // Un pago neto declarado para E41 no puede convertirse en comprobante recibido sin conciliar la compra.
    if(kind==="PURCHASE" && "supplierNetPaidCents" in origin && origin.supplierNetPaidCents!==null) fail("DOCUMENT_CONFLICT","La compra tiene un pago neto declarado para E41; concilia la operación primero",409)
    const existing=(await tx.$queryRaw<Row[]>`SELECT * FROM "FiscalReceivedDocument" WHERE "accountId"=${actor.accountId} AND "sourceKind"=${kind} AND "sourceId"=${sourceId}`)[0]
    if ((existing?.revision??0)!==body.expectedRevision) fail("VERSION_CONFLICT","El documento cambió; vuelve a cargarlo",409,"expectedRevision")
    const linked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "FiscalDocument" WHERE "accountId"=${actor.accountId} AND state <> 'DESCARTADO' AND ((${kind}='PURCHASE' AND "purchaseId"=${sourceId} AND type='E41') OR (${kind}='PAYABLE' AND "payableId"=${sourceId} AND type='E41') OR (${kind}='EXPENSE' AND "expenseId"=${sourceId} AND state='PREPARADO_PENDIENTE_CONEXION')) LIMIT 1`
    if(linked.length) fail("DOCUMENT_CONFLICT","La operación ya tiene un documento fiscal propio; revisa o descarta el borrador antes de registrar uno recibido",409)
    const id=existing?.id??randomUUID(), revision=(existing?.revision??0)+1
    // Solo cambia una referencia administrativa: no debe tratarse como movimiento de caja ni crear un turno.
    if (kind==="PURCHASE") await tx.$executeRaw`UPDATE "Purchase" SET "supplierReceiptNumber"=${data.number},"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${sourceId}`
    if (kind==="PAYABLE") await tx.$executeRaw`UPDATE "AccountPayable" SET "supplierReceiptNumber"=${data.number},"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${sourceId}`
    await tx.$executeRaw`INSERT INTO "FiscalReceivedDocument" (id,"accountId","sourceKind","sourceId",data,revision,"createdBy","updatedBy","updatedAt") VALUES (${id},${actor.accountId},${kind},${sourceId},${JSON.stringify(data)}::jsonb,${revision},${actor.id},${actor.id},now()) ON CONFLICT ("accountId","sourceKind","sourceId") DO UPDATE SET data=EXCLUDED.data,revision=EXCLUDED.revision,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=now()`
    const result={id,sourceKind:kind,sourceId,revision,data,operationTotalCents:origin.totalCents,differenceCents:data.currency==="DOP" ? data.totalCents-origin.totalCents : null}
    await tx.$executeRaw`INSERT INTO "FiscalReceivedOperation" (id,"accountId","operationId","documentId","actorUserId","payloadHash",revision,data,result) VALUES (${randomUUID()},${actor.accountId},${operationId},${id},${actor.id},${digest},${revision},${JSON.stringify(data)}::jsonb,${JSON.stringify(result)}::jsonb)`
    return result
  })
}

export async function getReceivedDocument(actor:Actor,id:string) {
  const rows=await prisma.$queryRaw<Row[]>`SELECT * FROM "FiscalReceivedDocument" WHERE "accountId"=${actor.accountId} AND id=${id}`
  const row=rows[0] ?? fail("NOT_FOUND","Documento no encontrado",404); permit(actor,row.sourceKind)
  const origin=await source(prisma,actor,row.sourceKind,row.sourceId,true)
  const revisions=await prisma.$queryRaw<Array<{revision:number;actorUserId:string;actorName:string|null;data:unknown;createdAt:Date}>>`SELECT o.revision,o."actorUserId",coalesce(u.name,u.username) AS "actorName",o.data,o."createdAt" FROM "FiscalReceivedOperation" o LEFT JOIN "User" u ON u."accountId"=o."accountId" AND u.id=o."actorUserId" WHERE o."accountId"=${actor.accountId} AND o."documentId"=${id} ORDER BY o.revision DESC`
  const total=row.data.totalCents
  return {...row,revisions,operationTotalCents:origin.totalCents,differenceCents:row.data.currency==="DOP" && typeof total==="number" ? total-origin.totalCents : null}
}

export async function listReceivedDocuments(actor:Actor,params:URLSearchParams) {
  if (!hasPermission(actor,"canViewFiscalDocuments")) fail("FORBIDDEN","Sin permiso fiscal",403)
  const allowed=kinds.filter(kind=>canSource(actor,kind)), kind=params.get("sourceKind"), sourceId=params.get("sourceId"), cursor=params.get("cursor"), take=Number(params.get("take")??"50")
  if (!Number.isSafeInteger(take)||take<1||take>200) fail("INVALID_INPUT","Paginación inválida",400,"take")
  if (kind) { const parsed=parseKind(kind); permit(actor,parsed) }
  if (cursor && !(await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "FiscalReceivedDocument" WHERE "accountId"=${actor.accountId} AND id=${cursor} AND "sourceKind" IN (${Prisma.join(allowed.length?allowed:[""])})`).length) fail("NOT_FOUND","Cursor no encontrado",404)
  const rows=await prisma.$queryRaw<Row[]>`SELECT * FROM "FiscalReceivedDocument" WHERE "accountId"=${actor.accountId} AND "sourceKind" IN (${Prisma.join(allowed.length?allowed:[""])}) AND (${kind}::text IS NULL OR "sourceKind"=${kind}) AND (${sourceId}::text IS NULL OR "sourceId"=${sourceId}) AND (${cursor}::text IS NULL OR ("createdAt",id)<(SELECT "createdAt",id FROM "FiscalReceivedDocument" WHERE "accountId"=${actor.accountId} AND id=${cursor})) ORDER BY "createdAt" DESC,id DESC LIMIT ${take+1}`
  const data=rows.slice(0,take); return {data,nextCursor:rows.length>take?data[data.length-1].id:null}
}
