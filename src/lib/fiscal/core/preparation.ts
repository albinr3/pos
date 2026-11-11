import { createHash, randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { previewFiscalDocument } from "./preview"
import { FiscalDocumentError } from "./document"
import { FiscalSequenceError, reserveFiscalNumber } from "./sequences"
import { decodeCashResult, type CashJson } from "@/lib/cash-money"

type Actor = PermissionAwareUser & { id: string; accountId: string }
type Tx = Prisma.TransactionClient
type Job = { id: string; operationId: string; actorUserId: string; kind: string; payloadHash: string; documentId: string | null; revision: number | null; status: string; result: unknown; error: unknown }
type Doc = { id: string; type: string; state: string; revision: number; snapshot: unknown; saleId: string | null; purchaseId: string | null; payableId: string | null; returnId: string | null; expenseId: string | null; supplierPaymentId: string | null }
const fail = (code: string, message: string, status: number, field?: string): never => { throw new FiscalDocumentError(code, message, status, field ? [{ field, message }] : []) }
const authorize = (actor: Actor, permission: "canPrepareFiscalDocuments" | "canViewFiscalDocuments") => { if (!hasPermission(actor, permission)) fail("FORBIDDEN", "Sin permiso fiscal", 403) }
function obj(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return fail("INVALID_INPUT", "Se esperaba un objeto", 400); return value as Record<string, unknown> }
function operationId(value: unknown) { if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) return fail("INVALID_INPUT", "Identificador de operación inválido", 400, "operationId"); return value }
// Ordenar las claves evita conflictos por cambios de serialización entre web y móvil.
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`; return JSON.stringify(value) ?? "null" }
function hash(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex") }
async function lockAccount(tx: Tx, accountId: string) { await tx.$queryRaw`SELECT id FROM "Account" WHERE id=${accountId} FOR NO KEY UPDATE`; await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${accountId},517))::text` }
async function job(tx: Tx, actor: Actor, id: string) { return (await tx.$queryRaw<Job[]>`SELECT * FROM "FiscalPreparationOperation" WHERE "accountId"=${actor.accountId} AND "operationId"=${id}`)[0] }
function matchJob(existing: Job, actor: Actor, kind: string, digest: string) { if (existing.actorUserId !== actor.id || existing.kind !== kind || existing.payloadHash !== digest) fail("OPERATION_CONFLICT", "El identificador corresponde a otro comando", 409) }
async function document(tx: Tx, actor: Actor, id: string, lock = false) { const rows = lock ? await tx.$queryRaw<Doc[]>`SELECT * FROM "FiscalDocument" WHERE "accountId"=${actor.accountId} AND id=${id} FOR UPDATE` : await tx.$queryRaw<Doc[]>`SELECT * FROM "FiscalDocument" WHERE "accountId"=${actor.accountId} AND id=${id}`; return rows[0] ?? fail("NOT_FOUND", "Documento no encontrado", 404) }
async function insertJob(tx: Tx, actor: Actor, id: string, kind: string, digest: string, documentId: string | null, revision: number | null, status: string, result: unknown = null) { await tx.$executeRaw`INSERT INTO "FiscalPreparationOperation" (id,"accountId","operationId","actorUserId",kind,"payloadHash","documentId",revision,status,result) VALUES (${randomUUID()},${actor.accountId},${id},${actor.id},${kind},${digest},${documentId},${revision},${status},${result === null ? null : JSON.stringify(result)}::jsonb)` }
async function policy(tx: Tx, actor: Actor, version: unknown) { const s = await tx.fiscalSettings.findUnique({ where: { accountId: actor.accountId } }); if (!s?.enabled || s.jurisdiction !== "DO" || s.regime !== "DO_ECF" || s.environment !== "TEST" || s.configurationStatus !== "VALIDATED") fail("PROFILE_UNAVAILABLE", "Activa una configuración fiscal válida de prueba", 409); if (!Number.isSafeInteger(version) || version !== s?.version) fail("VERSION_CONFLICT", "La política fiscal cambió; vuelve a cargarla", 409, "expectedPolicyVersion") }
function sourceFields(source: { kind: string; id: string } | null) { if (!source) return fail("INVALID_INPUT", "Indica una operación de origen", 400, "source"); return { saleId: source.kind === "SALE" ? source.id : null, purchaseId: source.kind === "PURCHASE" ? source.id : null, payableId: source.kind === "PAYABLE" ? source.id : null, returnId: source.kind === "RETURN" ? source.id : null, expenseId: source.kind === "EXPENSE" ? source.id : null, supplierPaymentId: source.kind === "SUPPLIER_PAYMENT" ? source.id : null } }
async function saleSourceFingerprint(tx: Tx, actor: Actor, source: { kind: string; id: string } | null) {
 if (!source || source.kind !== "SALE") return null
 const sale = await tx.sale.findFirst({ where: { id: source.id, accountId: actor.accountId }, select: {
  id:true, customerId:true, soldAt:true, type:true, paymentMethod:true, treasuryAccountId:true, transferBankName:true,
  subtotalCents:true, itbisCents:true, shippingCents:true, legalTipApplied:true, legalTipPercentBp:true,
  legalTipBaseCents:true, legalTipCents:true, discountSource:true, discountPercentBp:true,
  discountSubtotalCents:true, discountTotalCents:true, totalCents:true, salePricesIncludeItbis:true, cancelledAt:true,
  customer:{select:{id:true,name:true,isGeneric:true,cedula:true,fiscalIdentification:true,fiscalIdentificationCountry:true,fiscalLegalName:true}},
  items:{orderBy:{id:"asc"},select:{id:true,productId:true,qty:true,unitPriceCents:true,itbisRateBp:true,lineTotalCents:true,product:{select:{name:true,fiscalItemType:true,fiscalUnit:true,fiscalTaxTreatment:true}}}},
  payments:{orderBy:{id:"asc"},select:{id:true,method:true,amountCents:true,transferBankName:true,treasuryAccountId:true}},
  ar:{select:{customerId:true,totalCents:true,dueDate:true}},
 } })
 if (!sale) return fail("NOT_FOUND", "La venta no pertenece a la empresa", 404)
 // La revisión se invalida si cambia la venta o la ficha usada en la copia, aunque el total siga siendo el mismo.
 // No incluir el saldo de la cuenta por cobrar: los cobros no alteran la copia original.
 return hash(JSON.parse(JSON.stringify(sale)))
}
async function purchaseSourceFingerprint(tx: Tx, actor: Actor, source: { kind: string; id: string } | null) {
 if (!source || !["PURCHASE", "PAYABLE"].includes(source.kind)) return null
 const where = { id: source.id, accountId: actor.accountId }
 const supplier = { select: { id:true, name:true, fiscalIdentification:true, fiscalIdentificationCountry:true, fiscalLegalName:true, fiscalDeclaredCondition:true } } as const
 const row = source.kind === "PURCHASE" ? await tx.purchase.findFirst({ where, select: { id:true, type:true, supplierId:true, supplierReceiptNumber:true, supplierNetPaidCents:true, e41DeclaredUnregistered:true, purchasedAt:true, totalCents:true, cancelledAt:true, supplier, payable:{select:{id:true,dueDate:true}}, items:{orderBy:{id:"asc"},select:{productId:true,qty:true,lineTotalCents:true,product:{select:{name:true,fiscalItemType:true,fiscalUnit:true,fiscalTaxTreatment:true}}}} } }) : await tx.accountPayable.findFirst({ where:{...where,purchaseId:null}, select:{id:true,supplierId:true,description:true,supplierReceiptNumber:true,totalCents:true,dueDate:true,supplier} })
 if (!row) return fail("NOT_FOUND", "El origen no pertenece a la empresa", 404)
 // Los abonos no cambian la copia revisada; sí se reconcilian nuevamente al prepararla.
 return hash(JSON.parse(JSON.stringify(row)))
}
async function expenseSourceFingerprint(tx: Tx, actor: Actor, source: { kind: string; id: string } | null) {
 if (!source || source.kind !== "EXPENSE") return null
 const expense=await tx.operatingExpense.findFirst({where:{id:source.id,accountId:actor.accountId},select:{id:true,description:true,amountCents:true,expenseDate:true,fundingSource:true,fiscalExpenseDetails:true,cancelledAt:true}})
 if (!expense) return fail("NOT_FOUND","El gasto no pertenece a la empresa",404)
 // El reembolso no altera la copia; sí debe invalidarla un cambio en el detalle original.
 return hash(JSON.parse(JSON.stringify(expense)))
}
async function foreignPaymentFingerprint(tx: Tx, actor: Actor, source: { kind: string; id: string } | null) {
 if (!source || source.kind !== "SUPPLIER_PAYMENT") return null
 const allocation=await tx.fiscalForeignPayment.findFirst({where:{accountId:actor.accountId,supplierPaymentId:source.id},include:{foreignOperation:true,supplierPayment:{select:{id:true,amountCents:true,paidAt:true,cancelledAt:true}}}})
 if (!allocation) return fail("NOT_FOUND","El pago exterior no pertenece a la empresa",404)
 return hash(JSON.parse(JSON.stringify(allocation)))
}
async function snapshotWithSourceFingerprint(tx: Tx, actor: Actor, result: Awaited<ReturnType<typeof previewFiscalDocument>>) {
 const sourceFingerprint = await saleSourceFingerprint(tx, actor, result.source) ?? await purchaseSourceFingerprint(tx, actor, result.source) ?? await expenseSourceFingerprint(tx, actor, result.source) ?? await foreignPaymentFingerprint(tx, actor, result.source)
 return sourceFingerprint ? { ...result, sourceFingerprint } : result
}
async function event(tx: Tx, actor: Actor, id: string, state: string, details: unknown) { await tx.$executeRaw`INSERT INTO "FiscalDocumentEvent" (id,"accountId","documentId","actorUserId",state,details) VALUES (${randomUUID()},${actor.accountId},${id},${actor.id},${state},${JSON.stringify(details)}::jsonb)` }
async function revision(tx: Tx, actor: Actor, id: string, number: number, input: unknown) { await tx.$executeRaw`INSERT INTO "FiscalDocumentRevision" (id,"accountId","documentId",revision,"actorUserId",input) VALUES (${randomUUID()},${actor.accountId},${id},${number},${actor.id},${JSON.stringify(input)}::jsonb)` }

export async function createFiscalDraft(actor: Actor, raw: unknown) {
 authorize(actor,"canPrepareFiscalDocuments"); const body=obj(raw), op=operationId(body.operationId), input=obj(body.document), digest=hash({kind:"CREATE",document:input})
 return prisma.$transaction(async tx => { await lockAccount(tx,actor.accountId); const old=await job(tx,actor,op); if(old){matchJob(old,actor,"CREATE",digest); return old.result}
  const calculated=await previewFiscalDocument(actor,input,tx)
  // No bloquear una compra formal ni guardar una copia ajena o financieramente irreconciliable.
  if(calculated.type==="E41") await verifySource(tx,actor,calculated)
  const result=await snapshotWithSourceFingerprint(tx,actor,calculated); const src=sourceFields(result.source); const id=randomUUID()
  // El índice parcial protege también a los clientes concurrentes fuera de esta ruta.
  // La etapa 11 también se valida en bases anteriores a la columna de pagos exteriores.
  const duplicates=src.supplierPaymentId
   ? await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "FiscalDocument" WHERE "accountId"=${actor.accountId} AND state<>'DESCARTADO' AND "supplierPaymentId"=${src.supplierPaymentId} LIMIT 1`
   : await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "FiscalDocument" WHERE "accountId"=${actor.accountId} AND state<>'DESCARTADO' AND ((${src.saleId}::text IS NOT NULL AND "saleId"=${src.saleId}) OR (${src.purchaseId}::text IS NOT NULL AND "purchaseId"=${src.purchaseId}) OR (${src.payableId}::text IS NOT NULL AND "payableId"=${src.payableId}) OR (${src.returnId}::text IS NOT NULL AND "returnId"=${src.returnId}) OR (${src.expenseId}::text IS NOT NULL AND "expenseId"=${src.expenseId})) LIMIT 1`
  if(duplicates.length)fail("DOCUMENT_CONFLICT","La operación ya tiene un documento fiscal",409)
  if(src.supplierPaymentId) await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","supplierPaymentId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES (${id},${actor.accountId},${src.supplierPaymentId},${result.type},'BORRADOR',${result.policyVersion},${result.ruleVersion},${JSON.stringify(result)}::jsonb,now())`
  else await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","saleId","purchaseId","payableId","returnId","expenseId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES (${id},${actor.accountId},${src.saleId},${src.purchaseId},${src.payableId},${src.returnId},${src.expenseId},${result.type},'BORRADOR',${result.policyVersion},${result.ruleVersion},${JSON.stringify(result)}::jsonb,now())`
  await revision(tx,actor,id,1,input); await event(tx,actor,id,"BORRADOR",{revision:1,action:"CREATED"}); const response={id,revision:1,state:"BORRADOR"}; await insertJob(tx,actor,op,"CREATE",digest,id,1,"COMPLETED",response); return response
 })
}
export async function updateFiscalDraft(actor: Actor, id: string, raw: unknown) {
 authorize(actor,"canPrepareFiscalDocuments"); const body=obj(raw), op=operationId(body.operationId), input=obj(body.document), expected=body.expectedRevision, digest=hash({kind:"UPDATE",id,expected,document:input})
 if(!Number.isSafeInteger(expected) || (expected as number)<1) fail("INVALID_INPUT","Revisión inválida",400,"expectedRevision")
 return prisma.$transaction(async tx => { await lockAccount(tx,actor.accountId); const old=await job(tx,actor,op); if(old){matchJob(old,actor,"UPDATE",digest);return old.result} const doc=await document(tx,actor,id,true)
  if(doc.state === "PREPARADO_PENDIENTE_CONEXION" || doc.state === "DESCARTADO") fail("DOCUMENT_CONFLICT","El documento está congelado",409)
  if(doc.revision!==expected) fail("VERSION_CONFLICT","El borrador cambió",409,"expectedRevision")
  const preview=await previewFiscalDocument(actor,input,tx)
  if(preview.type==="E41") await verifySource(tx,actor,preview)
  const calculated=await snapshotWithSourceFingerprint(tx,actor,preview), src=sourceFields(calculated.source)
  if(doc.type!==calculated.type || doc.saleId!==src.saleId || doc.purchaseId!==src.purchaseId || doc.payableId!==src.payableId || doc.returnId!==src.returnId || doc.expenseId!==src.expenseId || (doc.supplierPaymentId ?? null)!==src.supplierPaymentId) fail("DOCUMENT_CONFLICT","El tipo y origen del borrador no se pueden cambiar",409)
  const next=doc.revision+1; await tx.$executeRaw`UPDATE "FiscalDocument" SET revision=${next},state='BORRADOR',"policyVersion"=${calculated.policyVersion},"ruleVersion"=${calculated.ruleVersion},snapshot=${JSON.stringify(calculated)}::jsonb,"updatedAt"=now() WHERE id=${id} AND "accountId"=${actor.accountId}`
  await revision(tx,actor,id,next,input); await event(tx,actor,id,"BORRADOR",{revision:next,action:"UPDATED"}); const response={id,revision:next,state:"BORRADOR"}; await insertJob(tx,actor,op,"UPDATE",digest,id,next,"COMPLETED",response); return response
 })
}

export async function discardSaleFiscalDraft(actor: Actor, id: string, raw: unknown) {
 authorize(actor,"canPrepareFiscalDocuments")
 const body=obj(raw), op=operationId(body.operationId), expected=body.expectedRevision
 const reason=typeof body.reason==="string" ? body.reason.trim() : ""
 if(!Number.isSafeInteger(expected) || (expected as number)<1) fail("INVALID_INPUT","Revisión inválida",400,"expectedRevision")
 if(reason.length<3 || reason.length>500) fail("INVALID_INPUT","Indica el motivo del descarte",400,"reason")
 const digest=hash({kind:"DISCARD_SALE_DRAFT",id,expected,reason})
 return prisma.$transaction(async tx=>{
  await lockAccount(tx,actor.accountId)
  const old=await job(tx,actor,op);if(old){matchJob(old,actor,"UPDATE",digest);return old.result}
  const settings=await tx.fiscalSettings.findUnique({where:{accountId:actor.accountId}})
  await policy(tx,actor,settings?.version)
  const doc=await document(tx,actor,id,true)
  // Nunca liberar una venta que ya tenga número reservado o una copia preparada.
  if(!doc.saleId || !["E44","E45","E46"].includes(doc.type) || !["BORRADOR","ERROR_VALIDACION"].includes(doc.state)) fail("DOCUMENT_CONFLICT","Solo se puede descartar un borrador de venta sin preparar",409)
  if(doc.revision!==expected) fail("VERSION_CONFLICT","El borrador cambió",409,"expectedRevision")
  const allocations=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "FiscalNumberAllocation" WHERE "accountId"=${actor.accountId} AND "documentId"=${id} LIMIT 1`
  if(allocations.length) fail("DOCUMENT_CONFLICT","El documento ya tiene numeración reservada",409)
  await tx.$executeRaw`UPDATE "FiscalDocument" SET state='DESCARTADO',"updatedAt"=now() WHERE id=${id} AND "accountId"=${actor.accountId}`
  await event(tx,actor,id,"DESCARTADO",{revision:doc.revision,action:"DISCARDED_SALE_DRAFT",reason})
  const result={id,revision:doc.revision,state:"DESCARTADO"}
  await insertJob(tx,actor,op,"UPDATE",digest,id,doc.revision,"COMPLETED",result)
  return result
 })
}

async function verifyE41Source(tx: Tx, actor: Actor, result: Awaited<ReturnType<typeof previewFiscalDocument>>) {
 if (!hasPermission(actor,"canManagePurchases")) fail("FORBIDDEN","Sin permiso para gestionar compras",403)
 const source=result.source!; const where={id:source.id,accountId:actor.accountId}
 if (source.kind === "PAYABLE" && !hasPermission(actor,"canAccessAccountsPayable")) fail("FORBIDDEN","Sin permiso para consultar cuentas por pagar",403)
 const purchase=source.kind==="PURCHASE" ? await tx.purchase.findFirst({where,include:{supplier:true,payable:true,items:{include:{product:true}}}}) : null
 const standalone=source.kind==="PAYABLE" ? await tx.accountPayable.findFirst({where:{...where,purchaseId:null},include:{supplier:true}}) : null
 if (standalone?.supplierReceiptNumber) fail("DOCUMENT_CONFLICT","La obligación tiene un comprobante recibido del proveedor",409,"source")
 if (standalone) {
  const available=await tx.$queryRaw<Array<{present:boolean}>>`SELECT to_regclass('"FiscalForeignOperation"') IS NOT NULL AS present`
  if(available[0]?.present && await tx.fiscalForeignOperation.findFirst({where:{accountId:actor.accountId,payableId:standalone.id},select:{id:true}})) fail("DOCUMENT_CONFLICT","La obligación pertenece a Pago al exterior",409,"source")
 }
 const payable=standalone ?? purchase?.payable
 const supplier=purchase?.supplier ?? standalone?.supplier
 if (!supplier || !result.supplier || result.supplier.id!==supplier.id || result.supplier.name!==(supplier.fiscalLegalName || supplier.name) || !supplier.fiscalIdentification || result.supplier.identification!==supplier.fiscalIdentification.replace(/[\s-]/g, "") || result.supplier.country!==(supplier.fiscalIdentificationCountry || "DO")) fail("DOCUMENT_CONFLICT","La identificación fiscal debe coincidir con el proveedor de la operación",409,"supplier")
 const expectedType=purchase?.type ?? "CREDITO"
 if (result.payment?.type!==expectedType) fail("DOCUMENT_CONFLICT","La forma de pago no coincide con la operación",409,"payment")
 if (expectedType==="CREDITO" && (!payable || result.payment?.dueDate!==payable.dueDate.toISOString().slice(0,10))) fail("DOCUMENT_CONFLICT","El vencimiento no coincide con la cuenta por pagar",409,"payment.dueDate")
 if (purchase) {
  if (result.lines.length!==purchase.items.length) fail("DOCUMENT_CONFLICT","El documento debe conservar todas las líneas de la compra",409,"lines")
  const used=new Set<string>()
  for (const line of result.lines) {
   const item=purchase.items.find(i=>i.productId===line.productId)
   if (!item || used.has(item.id) || !new Decimal(line.quantity).eq(item.qty) || !new Decimal(line.gross).mul(100).eq(item.lineTotalCents) || line.description!==item.product.name || line.kind!==item.product.fiscalItemType || line.unit!==item.product.fiscalUnit || line.taxTreatment!==item.product.fiscalTaxTreatment) fail("DOCUMENT_CONFLICT","Cada línea debe coincidir con la compra y la clasificación fiscal del producto",409,"lines")
   used.add(item!.id)
  }
 } else if (!payable || result.lines.length!==1 || result.lines[0].description!==payable.description) fail("DOCUMENT_CONFLICT","El concepto debe coincidir con la obligación",409,"lines")
 // No se inventa una retención retroactiva si ya salió del banco más dinero que el neto fiscal.
 const netCents=new Decimal(result.totals.net).mul(100).toNumber()
 const paid=purchase?.type==="CONTADO" ? purchase.supplierNetPaidCents ?? purchase.totalCents : payable ? payable.totalCents-payable.balanceCents : 0
 if (paid>netCents) fail("DOCUMENT_CONFLICT","Los pagos registrados superan el neto después de retenciones; concilia la operación antes de preparar",409,"payment")
 if (purchase?.type==="CONTADO" && paid!==netCents) fail("DOCUMENT_CONFLICT","El pago registrado debe coincidir con el neto después de retenciones",409,"payment")
}

// El total de la copia no puede atribuirse a otra operación ni inventarse desde el cliente.
async function verifySource(tx: Tx, actor: Actor, result: Awaited<ReturnType<typeof previewFiscalDocument>>) {
 const source=result.source; if (!source) return fail("INVALID_INPUT","Falta origen",400,"source")
 if ((result.type === "E43" && source.kind !== "EXPENSE") || (source.kind === "EXPENSE" && result.type !== "E43")) fail("DOCUMENT_CONFLICT","E43 requiere un gasto elegible",409,"source")
 if ((result.type === "E47" && source.kind !== "SUPPLIER_PAYMENT") || (source.kind === "SUPPLIER_PAYMENT" && result.type !== "E47")) fail("DOCUMENT_CONFLICT","E47 requiere un pago exterior elegible",409,"source")
 if ((result.type === "E41" && !["PURCHASE","PAYABLE"].includes(source.kind)) || (source.kind === "PAYABLE" && result.type !== "E41")) fail("DOCUMENT_CONFLICT","El E41 requiere una compra u obligación sin inventario",409,"source")
 // Evitar que un cambio concurrente confirme una copia de un origen ya modificado.
 if(source.kind==="SALE") await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${source.id} AND "accountId"=${actor.accountId} FOR UPDATE`
 else if(source.kind==="PURCHASE") await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id=${source.id} AND "accountId"=${actor.accountId} FOR UPDATE`
 else if(source.kind==="PAYABLE") await tx.$queryRaw`SELECT id FROM "AccountPayable" WHERE id=${source.id} AND "accountId"=${actor.accountId} FOR UPDATE`
 else if(source.kind==="RETURN") await tx.$queryRaw`SELECT id FROM "Return" WHERE id=${source.id} AND "accountId"=${actor.accountId} FOR UPDATE`
 else if(source.kind==="SUPPLIER_PAYMENT") await tx.$queryRaw`SELECT id FROM "SupplierPayment" WHERE id=${source.id} AND "accountId"=${actor.accountId} FOR UPDATE`
 else await tx.$queryRaw`SELECT id FROM "OperatingExpense" WHERE id=${source.id} AND "accountId"=${actor.accountId} FOR UPDATE`
 const where={id:source.id,accountId:actor.accountId}
 if (source.kind === "SUPPLIER_PAYMENT") {
  const { getE47Template } = await import("./foreign-document")
  const expected=await previewFiscalDocument(actor,await getE47Template(actor,source.id,tx),tx)
  const evidence=(doc:typeof expected)=>({type:doc.type,issueDate:doc.issueDate,issuer:doc.issuer,buyer:doc.buyer,supplier:doc.supplier,source:doc.source,payment:doc.payment,currency:doc.currency,totals:doc.totals,reportingTotals:doc.reportingTotals,lines:doc.lines})
  // Un pago y su base congelada son inseparables, aunque otro documento tenga el mismo total.
  if(canonical(evidence(result))!==canonical(evidence(expected))) fail("DOCUMENT_CONFLICT","El E47 no coincide con la base y la retención del pago",409,"lines")
  const payment=await tx.supplierPayment.findFirst({where,select:{amountCents:true,cancelledAt:true}})
  if(!payment || payment.cancelledAt || !new Decimal(result.reportingTotals.net).mul(100).eq(payment.amountCents)) fail("DOCUMENT_CONFLICT","El neto del comprobante no coincide con el pago",409,"payment")
  return
 }
 const row=source.kind==="SALE" ? await tx.sale.findFirst({where,select:{totalCents:true,cancelledAt:true}}) : source.kind==="PURCHASE" ? await tx.purchase.findFirst({where,select:{totalCents:true,cancelledAt:true}}) : source.kind==="PAYABLE" ? await tx.accountPayable.findFirst({where:{...where,purchaseId:null},select:{totalCents:true}}) : source.kind==="RETURN" ? await tx.return.findFirst({where,select:{totalCents:true,cancelledAt:true}}) : await tx.operatingExpense.findFirst({where,select:{amountCents:true,cancelledAt:true}})
 if(!row || ("cancelledAt" in row && row.cancelledAt)) fail("DOCUMENT_CONFLICT","La operación no existe o está anulada",409)
 const safeRow = row!; const cents="amountCents" in safeRow ? safeRow.amountCents : safeRow.totalCents
 if(result.currency.operation!=="DOP" || !new Decimal(result.totals.gross).mul(100).eq(cents)) fail("DOCUMENT_CONFLICT","El total fiscal debe coincidir con la operación en DOP",409,"lines")
 if (source.kind === "PURCHASE" && result.type === "E41") {
  const purchase = await tx.purchase.findFirst({ where, select: { supplierReceiptNumber: true } })
  // Un comprobante recibido es ajeno: nunca reservar un E41 propio para la misma compra.
  if (purchase?.supplierReceiptNumber) fail("DOCUMENT_CONFLICT", "La compra tiene un comprobante recibido del proveedor", 409, "source")
 }
 if (["PURCHASE", "PAYABLE"].includes(source.kind) && result.type === "E41") await verifyE41Source(tx, actor, result)
 if (source.kind === "EXPENSE") {
  const { getE43Template } = await import("./expense-document")
  const expected=await previewFiscalDocument(actor,await getE43Template(actor,source.id,tx),tx)
  const evidence=(doc:typeof expected)=>({type:doc.type,issueDate:doc.issueDate,issuer:doc.issuer,buyer:doc.buyer,supplier:doc.supplier,source:doc.source,payment:doc.payment,currency:doc.currency,totals:doc.totals,lines:doc.lines})
  // La igualdad del total no autoriza a cambiar concepto, elegibilidad o tratamiento fiscal.
  if(canonical(evidence(result))!==canonical(evidence(expected))) fail("DOCUMENT_CONFLICT","El documento no coincide con el detalle del gasto",409,"lines")
 }
 if (source.kind === "SALE" && ["E31","E32","E44","E45","E46"].includes(result.type)) {
  const sale = await tx.sale.findFirst({ where, select: { subtotalCents:true,itbisCents:true,shippingCents:true } })
  const bases = Object.entries(result.totals.bases).filter(([kind])=>kind!=="NO_FACTURABLE").reduce((sum,[,value])=>sum.plus(value),new Decimal(0)).mul(100)
  // Una igualdad del total no compensa bases o ITBIS distintos de la venta registrada.
  if (!sale || !new Decimal(result.totals.tax).mul(100).eq(sale.itbisCents) || !bases.eq(sale.subtotalCents + sale.shippingCents)) fail("DOCUMENT_CONFLICT","Las bases o el ITBIS no coinciden con la venta",409,"lines")
 }
}

/** Registra una venta recién creada y su documento dentro de la misma transacción comercial. */
export async function prepareFiscalSaleInTransaction(tx: Tx, actor: Actor, input: Record<string, unknown>, metadata: Record<string, unknown>) {
 authorize(actor,"canPrepareFiscalDocuments")
 await lockAccount(tx,actor.accountId)
 await policy(tx,actor,input.expectedPolicyVersion)
 const calculated=await previewFiscalDocument(actor,input,tx)
 if(calculated.source?.kind!=="SALE" || !["E31","E32","E44","E45","E46"].includes(calculated.type)) fail("INVALID_INPUT","La preparación requiere una venta y un tipo compatible",400,"source")
 await verifySource(tx,actor,calculated)
 const result={...await snapshotWithSourceFingerprint(tx,actor,calculated), sale:metadata}
 const src=sourceFields(result.source), id=randomUUID()
 const duplicates=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "FiscalDocument" WHERE "accountId"=${actor.accountId} AND "saleId"=${src.saleId} AND state<>'DESCARTADO' LIMIT 1`
 if(duplicates.length)fail("DOCUMENT_CONFLICT","La venta ya tiene un documento fiscal",409)
 // La venta, sus efectos y esta copia comparten commit; un fallo nunca deja un cobro huérfano.
 await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","saleId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES (${id},${actor.accountId},${src.saleId},${result.type},'BORRADOR',${result.policyVersion},${result.ruleVersion},${JSON.stringify(result)}::jsonb,now())`
 await revision(tx,actor,id,1,input); await event(tx,actor,id,"BORRADOR",{revision:1,action:"CREATED_WITH_SALE"})
 await tx.$executeRaw`UPDATE "FiscalDocument" SET state='VALIDADO',"updatedAt"=now() WHERE id=${id} AND "accountId"=${actor.accountId}`
 for(const [index,line] of result.lines.entries()) await tx.$executeRaw`INSERT INTO "FiscalDocumentLine" (id,"accountId","documentId",position,snapshot) VALUES (${randomUUID()},${actor.accountId},${id},${index+1},${JSON.stringify(line)}::jsonb)`
 await event(tx,actor,id,"VALIDADO",{revision:1})
 const allocation=await reserveFiscalNumber(tx,actor,id,result.type)
 await tx.$executeRaw`UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION',"updatedAt"=now() WHERE id=${id} AND "accountId"=${actor.accountId}`
 await event(tx,actor,id,"PREPARADO_PENDIENTE_CONEXION",{revision:1,eNcf:allocation.eNcf})
 return {id,revision:1,state:"PREPARADO_PENDIENTE_CONEXION" as const,type:result.type,eNcf:allocation.eNcf}
}

export async function previewExistingFiscalSale(actor: Actor, saleId: string, raw: unknown) {
 authorize(actor,"canPrepareFiscalDocuments")
 const { parseFiscalSaleCommand } = await import("./sale-command")
 const { buildFiscalSaleDocument } = await import("./sale-document")
 const command=parseFiscalSaleCommand(raw)
 return prisma.$transaction(async tx => {
  await lockAccount(tx,actor.accountId)
  const built=await buildFiscalSaleDocument(tx,actor,saleId,command)
  const result=await previewFiscalDocument(actor,built.document,tx)
  await verifySource(tx,actor,result)
  const sourceFingerprint=await saleSourceFingerprint(tx,actor,result.source)
  return {...result,sale:built.metadata,sourceFingerprint,notice:"Previsualización local / No emitido fiscalmente",informational:true}
 })
}

export async function prepareExistingFiscalSale(actor: Actor, saleId: string, raw: unknown) {
 authorize(actor,"canPrepareFiscalDocuments")
 const body=obj(raw), op=operationId(body.operationId)
 const { parseFiscalSaleCommand } = await import("./sale-command")
 const { buildFiscalSaleDocument } = await import("./sale-document")
 const command=parseFiscalSaleCommand(body.fiscal), fingerprint=body.expectedSourceFingerprint
 if(typeof fingerprint!=="string" || !/^[a-f0-9]{64}$/.test(fingerprint)) fail("INVALID_INPUT","Primero revisa la venta existente",400,"expectedSourceFingerprint")
 const digest=hash({kind:"PREPARE_EXISTING_SALE",saleId,command,fingerprint})
 return prisma.$transaction(async tx => {
  await lockAccount(tx,actor.accountId)
  const old=await job(tx,actor,op)
  if(old){matchJob(old,actor,"PREPARE",digest);return old.result}
  // El bloqueo impide adjuntar una copia a una venta que cambia mientras se revisa.
  await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${saleId} AND "accountId"=${actor.accountId} FOR UPDATE`
  if(await saleSourceFingerprint(tx,actor,{kind:"SALE",id:saleId})!==fingerprint) fail("DOCUMENT_CONFLICT","La venta cambió; vuelve a revisarla",409,"source")
  const built=await buildFiscalSaleDocument(tx,actor,saleId,command)
  if(command.expectedTotalCents!==undefined) {
   const sale=await tx.sale.findFirst({where:{id:saleId,accountId:actor.accountId},select:{totalCents:true}})
   if(!sale || sale.totalCents!==command.expectedTotalCents) fail("DOCUMENT_CONFLICT","El total de la venta cambió; revisa el documento",409,"fiscal.expectedTotalCents")
  }
  const result=await prepareFiscalSaleInTransaction(tx,actor,built.document,built.metadata)
  await insertJob(tx,actor,op,"PREPARE",digest,result.id,result.revision,"COMPLETED",result)
  return result
 })
}
export async function prepareFiscalDocumentInTransaction(tx: Tx, actor: Actor, id: string, expectedRevision: number) {
 authorize(actor,"canPrepareFiscalDocuments"); await lockAccount(tx,actor.accountId); const doc=await document(tx,actor,id,true)
 // Una nota debe confirmar sus reservas y efectos financieros en la misma transacción;
 // la preparación genérica no puede asignar un número dejando esos efectos sin aplicar.
 if (["E33", "E34"].includes(doc.type) && doc.state!=="PREPARADO_PENDIENTE_CONEXION") fail("DOCUMENT_CONFLICT","Prepara las notas desde su operación comercial",409)
 if(doc.state==="PREPARADO_PENDIENTE_CONEXION") { if(doc.revision!==expectedRevision)fail("VERSION_CONFLICT","La revisión no coincide con el documento preparado",409); const allocation=await tx.$queryRaw<Array<{eNcf:string}>>`SELECT "eNcf" FROM "FiscalNumberAllocation" WHERE "accountId"=${actor.accountId} AND "documentId"=${id}`; return {id,revision:doc.revision,state:doc.state,eNcf:allocation[0]?.eNcf ?? null} }
 if(doc.state!=="BORRADOR" || doc.revision!==expectedRevision) fail("VERSION_CONFLICT","El borrador cambió o no está disponible",409)
 const revisions=await tx.$queryRaw<Array<{input: Record<string, unknown>}>>`SELECT input FROM "FiscalDocumentRevision" WHERE "accountId"=${actor.accountId} AND "documentId"=${id} AND revision=${expectedRevision}`
 if(!revisions.length) fail("DOCUMENT_CONFLICT","No se encontró la revisión",409)
 const input=revisions[0].input; await policy(tx,actor,input.expectedPolicyVersion)
 const calculated=await previewFiscalDocument(actor,input,tx); await verifySource(tx,actor,calculated)
 // Tomar la huella después de bloquear la venta evita una edición concurrente entre lectura y confirmación.
 const result=await snapshotWithSourceFingerprint(tx,actor,calculated)
 if (result.type === "E43" || result.type === "E47") {
  const previous=doc.snapshot as {sourceFingerprint?:unknown} | null
  if(!previous?.sourceFingerprint || previous.sourceFingerprint!==(result as {sourceFingerprint?:string}).sourceFingerprint) fail("DOCUMENT_CONFLICT","La operación cambió; actualiza y revisa el borrador",409,"source")
 }
 if (result.type === "E41" && ["PURCHASE", "PAYABLE"].includes(result.source?.kind ?? "")) {
  const previous=doc.snapshot as { sourceFingerprint?: unknown } | null
  if (!previous?.sourceFingerprint || previous.sourceFingerprint !== (result as {sourceFingerprint?:string}).sourceFingerprint) fail("DOCUMENT_CONFLICT","La operación cambió; actualiza y revisa el borrador",409,"source")
  const payable=await tx.accountPayable.findFirst({where:{accountId:actor.accountId,...(result.source!.kind==="PURCHASE"?{purchaseId:result.source!.id}:{id:result.source!.id,purchaseId:null})}})
  if (payable) {
   const net=new Decimal(result.totals.net).mul(100).toNumber(), paid=payable.totalCents-payable.balanceCents
   if (paid>net) fail("DOCUMENT_CONFLICT","Los pagos superan el neto al proveedor",409,"payment")
   // Las retenciones reducen el saldo del proveedor; se conservan como obligación tributaria separada.
   const balance=net-paid
   await tx.accountPayable.update({where:{id:payable.id},data:{totalCents:net,balanceCents:balance,status:balance===0?"PAGADA":paid===0?"PENDIENTE":"PARCIAL",withheldItbisCents:new Decimal(result.totals.withheldByKind.ITBIS).mul(100).toNumber(),withheldIsrCents:new Decimal(result.totals.withheldByKind.ISR).mul(100).toNumber()}})
  }
  if (result.source!.kind === "PURCHASE") {
   const itbis=new Decimal(result.totals.withheldByKind.ITBIS).mul(100).toNumber(), isr=new Decimal(result.totals.withheldByKind.ISR).mul(100).toNumber()
   // Registrar la obligación tributaria no crea otro movimiento de caja ni cambia la compra.
   await tx.$executeRaw`UPDATE "Purchase" SET "e41WithheldItbisCents"=${itbis}, "e41WithheldIsrCents"=${isr}, "updatedAt"=now() WHERE id=${result.source!.id} AND "accountId"=${actor.accountId}`
  }
 }
 if (result.source?.kind === "SALE") {
  const previous = doc.snapshot as { sourceFingerprint?: unknown } | null
  // Los borradores anteriores no permiten demostrar qué versión comercial revisó el usuario.
  if (!previous?.sourceFingerprint || previous.sourceFingerprint !== (result as { sourceFingerprint?: string }).sourceFingerprint) fail("DOCUMENT_CONFLICT","La venta cambió o el borrador necesita revisión; actualízalo antes de preparar",409,"source")
  if (!["E31", "E32"].includes(result.type)) fail("DOCUMENT_CONFLICT","Prepara este tipo desde la venta para conservar sus datos especiales",409,"source")
  const { buildFiscalSaleDocument } = await import("./sale-document")
  const { parseFiscalSaleCommand } = await import("./sale-command")
  const buyer = result.buyer ? { name: result.buyer.name, identification: result.buyer.identification, country: result.buyer.country } : undefined
  const command = parseFiscalSaleCommand({ type: result.type, expectedPolicyVersion: input.expectedPolicyVersion, incomeType: result.incomeType, ...(buyer ? { buyer } : {}), ...(result.payment?.dueDate ? { dueDate: result.payment.dueDate } : {}) })
  const rebuilt = await buildFiscalSaleDocument(tx,actor,result.source.id,command)
  const expected = await previewFiscalDocument(actor,rebuilt.document,tx)
  const evidence = (doc: typeof expected) => ({ type:doc.type,issueDate:doc.issueDate,issuer:doc.issuer,buyer:doc.buyer,source:doc.source,incomeType:doc.incomeType,payment:doc.payment,currency:doc.currency,totals:doc.totals,lines:doc.lines.map(line=>({productId:line.productId,description:line.description,kind:line.kind,unit:line.unit,quantity:line.quantity,unitPrice:line.unitPrice,taxTreatment:line.taxTreatment,priceIncludesTax:line.priceIncludesTax,base:line.base,tax:line.tax,gross:line.gross,withholdings:line.withholdings,retentionAgent:line.retentionAgent})) })
  // El mismo total no demuestra que comprador, productos, impuestos y pagos sean de la venta.
  if (canonical(evidence(result)) !== canonical(evidence(expected))) fail("DOCUMENT_CONFLICT","La copia no coincide con los datos comerciales de la venta",409,"lines")
  // Los medios de pago y los precios comerciales también quedan congelados en el documento.
  Object.assign(result, { sale: rebuilt.metadata })
 }
 await tx.$executeRaw`UPDATE "FiscalDocument" SET state='VALIDADO',snapshot=${JSON.stringify(result)}::jsonb,"policyVersion"=${result.policyVersion},"ruleVersion"=${result.ruleVersion},"updatedAt"=now() WHERE id=${id} AND "accountId"=${actor.accountId}`
 for(const [index,line] of result.lines.entries()) await tx.$executeRaw`INSERT INTO "FiscalDocumentLine" (id,"accountId","documentId",position,snapshot) VALUES (${randomUUID()},${actor.accountId},${id},${index+1},${JSON.stringify(line)}::jsonb)`
 if(result.reference) await tx.$executeRaw`INSERT INTO "FiscalDocumentReference" (id,"accountId","documentId","referencedDocumentId",snapshot) VALUES (${randomUUID()},${actor.accountId},${id},${result.reference.documentId},${JSON.stringify(result.reference)}::jsonb)`
 await event(tx,actor,id,"VALIDADO",{revision:expectedRevision}); const allocation=await reserveFiscalNumber(tx,actor,id,result.type)
 await tx.$executeRaw`UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION',"updatedAt"=now() WHERE id=${id} AND "accountId"=${actor.accountId}`
 await event(tx,actor,id,"PREPARADO_PENDIENTE_CONEXION",{revision:expectedRevision,eNcf:allocation.eNcf})
 return {id,revision:expectedRevision,state:"PREPARADO_PENDIENTE_CONEXION",eNcf:allocation.eNcf}
}
export async function prepareFiscalDraft(actor: Actor,id:string,raw:unknown) {
 authorize(actor,"canPrepareFiscalDocuments"); const body=obj(raw), op=operationId(body.operationId), expected=body.expectedRevision
 if(!Number.isSafeInteger(expected) || (expected as number)<1) fail("INVALID_INPUT","Revisión inválida",400,"expectedRevision")
 const digest=hash({kind:"PREPARE",id,expected})
 const existing=await prisma.$transaction(async tx=>{await lockAccount(tx,actor.accountId); const old=await job(tx,actor,op); if(old){matchJob(old,actor,"PREPARE",digest);return old} await document(tx,actor,id,true); await insertJob(tx,actor,op,"PREPARE",digest,id,expected as number,"PENDING"); return null})
 if(existing?.status==="COMPLETED") return existing.result
 try { return await prisma.$transaction(async tx=>{await lockAccount(tx,actor.accountId);const current=await job(tx,actor,op);matchJob(current,actor,"PREPARE",digest);if(current.status==="COMPLETED")return current.result;const result=await prepareFiscalDocumentInTransaction(tx,actor,id,expected as number);await tx.$executeRaw`UPDATE "FiscalPreparationOperation" SET status='COMPLETED',result=${JSON.stringify(result)}::jsonb,error=NULL,"updatedAt"=now() WHERE id=${current.id}`;return result}) }
 catch(error) { const known=error instanceof FiscalDocumentError || error instanceof FiscalSequenceError; const detail={code:known?error.code:"INTERNAL_ERROR",message:known?error.message:"No se pudo preparar el documento",fields:error instanceof FiscalDocumentError?error.issues:error instanceof FiscalSequenceError?error.fields.map(field=>({field,message:error.message})):[],retryable:!known}; await prisma.$executeRaw`UPDATE "FiscalPreparationOperation" SET status='FAILED',error=${JSON.stringify(detail)}::jsonb,"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND "operationId"=${op} AND status<>'COMPLETED'`; throw error }
}
export async function getFiscalOperation(actor: Actor, opId: string) {
 const id=operationId(opId); const found=await job(prisma,actor,id)
 if (!found) {
  const cash=await prisma.cashOperation.findUnique({where:{accountId_clientOperationId:{accountId:actor.accountId,clientOperationId:id}}})
  if (!cash || (cash.userId!==actor.id && !hasPermission(actor,"canViewFiscalDocuments"))) return fail("NOT_FOUND","Operación no encontrada",404)
  if (cash.userId===actor.id && !hasPermission(actor,"canPrepareFiscalDocuments") && !hasPermission(actor,"canViewFiscalDocuments")) return fail("FORBIDDEN","Sin permiso fiscal",403)
  const result=decodeCashResult(cash.response as CashJson) as Record<string,unknown> | null
  if (!result || typeof result.id!=="string" || typeof result.documentId!=="string") return fail("NOT_FOUND","Operación no encontrada",404)
  // No exponer otras operaciones de caja a través de la consulta fiscal.
  const adjustment=await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "FiscalAdjustment" WHERE "accountId"=${actor.accountId} AND id=${result.id} AND "fiscalDocumentId"=${result.documentId} AND type IN ('E33','E34')`
  if (!adjustment.length) return fail("NOT_FOUND","Operación no encontrada",404)
  return {operationId:id,documentId:result.documentId,revision:result.revision,kind:"ADJUSTMENT_CONFIRM",status:"COMPLETED",result,error:null}
 }
 if(!found || (found.actorUserId!==actor.id && !hasPermission(actor,"canViewFiscalDocuments"))) fail("NOT_FOUND","Operación no encontrada",404)
 if(found.actorUserId===actor.id && !hasPermission(actor,"canPrepareFiscalDocuments") && !hasPermission(actor,"canViewFiscalDocuments")) fail("FORBIDDEN","Sin permiso fiscal",403)
 return {operationId:found.operationId,documentId:found.documentId,revision:found.revision,kind:found.kind,status:found.status,result:found.result,error:found.error}
}
export async function getFiscalDocument(actor:Actor,id:string) {
 authorize(actor,"canViewFiscalDocuments"); const doc=await document(prisma,actor,id)
 const revisions=await prisma.$queryRaw<Array<{revision:number;input:unknown;actorUserId:string;createdAt:Date}>>`SELECT revision,input,"actorUserId","createdAt" FROM "FiscalDocumentRevision" WHERE "accountId"=${actor.accountId} AND "documentId"=${id} ORDER BY revision DESC`
 const allocations=await prisma.$queryRaw<Array<{eNcf:string;environment:string}>>`SELECT "eNcf",environment FROM "FiscalNumberAllocation" WHERE "accountId"=${actor.accountId} AND "documentId"=${id}`
 const jobs=await prisma.$queryRaw<Array<{operationId:string;status:string;error:unknown;actorUserId:string;createdAt:Date}>>`SELECT "operationId",status,error,"actorUserId","createdAt" FROM "FiscalPreparationOperation" WHERE "accountId"=${actor.accountId} AND "documentId"=${id} AND kind='PREPARE' ORDER BY "createdAt" DESC,id DESC LIMIT 20`
 const references=await prisma.$queryRaw`SELECT "referencedDocumentId",snapshot FROM "FiscalDocumentReference" WHERE "accountId"=${actor.accountId} AND "documentId"=${id}`
 return {...doc,input:revisions[0]?.input ?? null,revisions,allocation:allocations[0] ?? null,jobs,references,notice:"Documento de prueba / No emitido fiscalmente"}
}
export async function listFiscalDocuments(actor:Actor,params:URLSearchParams) {
 authorize(actor,"canViewFiscalDocuments"); const take=Number(params.get("take") ?? "50"); if(!Number.isSafeInteger(take)||take<1||take>200)fail("INVALID_INPUT","Paginación inválida",400,"take")
 const source=params.get("source"),sourceId=params.get("sourceId"),type=params.get("type"),state=params.get("state"),party=params.get("party"),from=params.get("from"),to=params.get("to"),cursor=params.get("cursor")
 if(source && !["SALE","PURCHASE","PAYABLE","RETURN","EXPENSE","SUPPLIER_PAYMENT","ADJUSTMENT"].includes(source))fail("INVALID_INPUT","Origen inválido",400,"source")
 for(const [name,value] of [["from",from],["to",to]] as const) if(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))))fail("INVALID_INPUT","Fecha inválida",400,name)
 if(cursor && !(await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "FiscalDocument" WHERE "accountId"=${actor.accountId} AND id=${cursor}`).length)fail("NOT_FOUND","Cursor no encontrado",404)
 const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT d.id,d.type,d.state,d.revision,d.snapshot,d."saleId",d."purchaseId",d."payableId",d."returnId",d."expenseId",d."adjustmentId",d."createdAt",a."eNcf" FROM "FiscalDocument" d LEFT JOIN "FiscalNumberAllocation" a ON a."accountId"=d."accountId" AND a."documentId"=d.id WHERE d."accountId"=${actor.accountId} AND (${type}::text IS NULL OR d.type=${type}) AND (${state}::text IS NULL OR d.state=${state}) AND (${source}::text IS NULL OR (${source}='SALE' AND d."saleId" IS NOT NULL) OR (${source}='PURCHASE' AND d."purchaseId" IS NOT NULL) OR (${source}='PAYABLE' AND d."payableId" IS NOT NULL) OR (${source}='RETURN' AND d."returnId" IS NOT NULL) OR (${source}='EXPENSE' AND d."expenseId" IS NOT NULL) OR (${source}='ADJUSTMENT' AND d."adjustmentId" IS NOT NULL) OR (${source}='SUPPLIER_PAYMENT' AND d.snapshot->'source'->>'kind'='SUPPLIER_PAYMENT')) AND (${sourceId}::text IS NULL OR d."saleId"=${sourceId} OR d."purchaseId"=${sourceId} OR d."payableId"=${sourceId} OR d."returnId"=${sourceId} OR d."expenseId"=${sourceId} OR d."adjustmentId"=${sourceId} OR (d.snapshot->'source'->>'kind'='SUPPLIER_PAYMENT' AND d.snapshot->'source'->>'id'=${sourceId})) AND (${party}::text IS NULL OR d.snapshot->'buyer'->>'id'=${party} OR d.snapshot->'supplier'->>'id'=${party} OR d.snapshot->'buyer'->>'name' ILIKE '%'||${party}||'%' OR d.snapshot->'supplier'->>'name' ILIKE '%'||${party}||'%') AND (${from}::text IS NULL OR d."createdAt">=${from}::date) AND (${to}::text IS NULL OR d."createdAt"<${to}::date + interval '1 day') AND (${cursor}::text IS NULL OR (d."createdAt",d.id)<(SELECT "createdAt",id FROM "FiscalDocument" WHERE "accountId"=${actor.accountId} AND id=${cursor})) ORDER BY d."createdAt" DESC,d.id DESC LIMIT ${take+1}`
 const data=rows.slice(0,take);return {data,nextCursor:rows.length>take?data[data.length-1].id:null}
}
export async function fiscalHistory(actor:Actor,id:string,params:URLSearchParams) {
 authorize(actor,"canViewFiscalDocuments");await document(prisma,actor,id); const take=Number(params.get("take")??"50");if(!Number.isSafeInteger(take)||take<1||take>200)fail("INVALID_INPUT","Paginación inválida",400,"take")
 const cursor=params.get("cursor");if(cursor && !(await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "FiscalDocumentEvent" WHERE id=${cursor} AND "accountId"=${actor.accountId} AND "documentId"=${id}`).length)fail("NOT_FOUND","Cursor no encontrado",404)
 const rows=await prisma.$queryRaw<Array<{id:string}>>`SELECT * FROM "FiscalDocumentEvent" WHERE "accountId"=${actor.accountId} AND "documentId"=${id} AND (${cursor}::text IS NULL OR ("createdAt",id)>(SELECT "createdAt",id FROM "FiscalDocumentEvent" WHERE id=${cursor} AND "accountId"=${actor.accountId} AND "documentId"=${id})) ORDER BY "createdAt",id LIMIT ${take+1}`
 const data=rows.slice(0,take);return {data,nextCursor:rows.length>take?data[data.length-1].id:null}
}
