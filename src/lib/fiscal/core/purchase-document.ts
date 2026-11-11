import { Decimal } from "@prisma/client/runtime/library"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { FiscalDocumentError } from "./document"

type Actor = PermissionAwareUser & { id: string; accountId: string }
const fail = (message: string): never => { throw new FiscalDocumentError("DOCUMENT_CONFLICT", message, 409) }
const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)

/** Construir la propuesta desde la operación guardada; la condición de informal se declara aparte. */
export async function getE41Template(actor: Actor, kind: string, id: string, db: Prisma.TransactionClient = prisma) {
 if (!hasPermission(actor,"canPrepareFiscalDocuments") || !hasPermission(actor,"canManagePurchases")) throw new FiscalDocumentError("FORBIDDEN","Sin permiso para preparar compras fiscales",403)
 if (!["PURCHASE","PAYABLE"].includes(kind) || !id) throw new FiscalDocumentError("INVALID_INPUT","Origen inválido",400)
 if (kind==="PAYABLE" && !hasPermission(actor,"canAccessAccountsPayable")) throw new FiscalDocumentError("FORBIDDEN","Sin permiso para consultar cuentas por pagar",403)
 const settings=await db.fiscalSettings.findUnique({where:{accountId:actor.accountId}})
 if (!settings?.enabled || settings.jurisdiction!=="DO" || settings.regime!=="DO_ECF" || settings.environment!=="TEST" || settings.configurationStatus!=="VALIDATED" || !settings.legalName || !settings.taxId) return fail("Activa una configuración fiscal de prueba válida")
 const where={id,accountId:actor.accountId}
 const purchase=kind==="PURCHASE" ? await db.purchase.findFirst({where,include:{supplier:true,payable:true,items:{include:{product:true},orderBy:{id:"asc"}}}}) : null
 const obligation=kind==="PAYABLE" ? await db.accountPayable.findFirst({where:{...where,purchaseId:null},include:{supplier:true}}) : null
 if (kind==="PURCHASE" && (!purchase || purchase.cancelledAt || purchase.supplierReceiptNumber)) return fail("La compra no está disponible o tiene un comprobante recibido")
 if (kind==="PAYABLE" && (!obligation || obligation.supplierReceiptNumber)) return fail("La obligación no está disponible o tiene un comprobante recibido")
 if (kind==="PAYABLE") {
  const available=await db.$queryRaw<Array<{present:boolean}>>`SELECT to_regclass('"FiscalForeignOperation"') IS NOT NULL AS present`
  // El pago exterior se documenta por cada abono, nunca con E41 sobre la deuda.
  if(available[0]?.present && await db.fiscalForeignOperation.findFirst({where:{accountId:actor.accountId,payableId:id},select:{id:true}})) return fail("Esta obligación corresponde a Pago al exterior")
 }
 const supplier=purchase?.supplier ?? obligation?.supplier
 if (!supplier?.fiscalIdentification) return fail("Completa la identificación fiscal en la ficha del proveedor")
 const rawLines=purchase ? purchase.items.map(item=>({ productId:item.productId,description:item.product.name,kind:item.product.fiscalItemType,unit:item.product.fiscalUnit,taxTreatment:item.product.fiscalTaxTreatment,qty:new Decimal(item.qty),gross:item.lineTotalCents })) : [{productId:undefined,description:obligation!.description!,kind:"SERVICIO",unit:"UNIDAD",taxTreatment:"EXENTO",qty:new Decimal(1),gross:obligation!.totalCents}]
 const lines=rawLines.map(item=>{
  if (!item.kind || !item.unit || !item.taxTreatment || item.qty.decimalPlaces()>2) return fail(`Completa la clasificación fiscal y usa hasta dos decimales para ${item.description}`)
  const price=new Decimal(item.gross).div(100).div(item.qty).toDecimalPlaces(4,Decimal.ROUND_HALF_UP)
  const rounded=price.mul(item.qty).toDecimalPlaces(2,Decimal.ROUND_HALF_UP)
  const difference=rounded.minus(new Decimal(item.gross).div(100))
  return { ...(item.productId?{productId:item.productId}:{}),description:item.description,kind:item.kind,unit:item.unit,quantity:item.qty.toFixed(2),unitPrice:price.toFixed(4),taxTreatment:item.taxTreatment,priceIncludesTax:true,retentionAgent:"1",...(difference.gt(0)?{discount:difference.toFixed(2)}:difference.lt(0)?{surcharge:difference.neg().toFixed(2)}:{}),...(item.taxTreatment.startsWith("GRAVADO_")?{withholdings:[{kind:"ITBIS",rate:"100"}]}:{}) }
 })
 const dueDate=purchase?.payable?.dueDate ?? obligation?.dueDate
 const type=purchase?.type ?? "CREDITO"
 return {type:"E41",issueDate:day(purchase?.purchasedAt ?? obligation!.createdAt),expectedPolicyVersion:settings.version,currency:{operation:"DOP",reporting:"DOP"},issuer:{id:actor.accountId,name:settings.legalName,identification:settings.taxId.replace(/[\s-]/g,""),country:"DO"},supplier:{id:supplier.id,name:supplier.fiscalLegalName || supplier.name,identification:supplier.fiscalIdentification.replace(/[\s-]/g,""),country:supplier.fiscalIdentificationCountry || "DO",...(purchase?.e41DeclaredUnregistered?{declaredCondition:"NO_REGISTRADO"}:{})},source:{kind,id},payment:{type,...(type==="CREDITO" && dueDate?{dueDate:dueDate.toISOString().slice(0,10)}:{})},lines}
}
