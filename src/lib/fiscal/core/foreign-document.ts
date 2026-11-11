import { Prisma } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { FiscalDocumentError } from "./document"

type Actor = PermissionAwareUser & { id: string; accountId: string }
type Party = { id: string; name: string; identification: string; country: string; residence: string }
type Snapshot = { lines: Array<{ index: number; description: string; amountCents: number; isrRate: string; withheldCents: number }>; netDopCents: number }
const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
const fail = (message: string): never => { throw new FiscalDocumentError("DOCUMENT_CONFLICT", message, 409) }
export async function getE47Template(actor: Actor, paymentId: string, db: Prisma.TransactionClient = prisma) {
 if (!hasPermission(actor,"canPrepareFiscalDocuments") || !hasPermission(actor,"canAccessAccountsPayable")) throw new FiscalDocumentError("FORBIDDEN","Sin permiso para preparar pagos al exterior",403)
 const settings=await db.fiscalSettings.findUnique({where:{accountId:actor.accountId}})
 if(!settings?.enabled || settings.jurisdiction!=="DO" || settings.regime!=="DO_ECF" || settings.environment!=="TEST" || settings.configurationStatus!=="VALIDATED" || !settings.legalName || !settings.taxId) return fail("Activa una configuración fiscal de prueba válida")
 const allocation=await db.fiscalForeignPayment.findFirst({where:{accountId:actor.accountId,supplierPaymentId:paymentId},include:{foreignOperation:true,supplierPayment:true}})
 if(!allocation || allocation.supplierPayment.cancelledAt) return fail("El pago exterior no existe o está anulado")
 const operation=allocation.foreignOperation, party=operation.supplierSnapshot as Party, snapshot=allocation.snapshot as Snapshot
 if(!party || !Array.isArray(snapshot?.lines) || !snapshot.lines.length || snapshot.netDopCents!==allocation.supplierPayment.amountCents) return fail("La base del pago no permite preparar el comprobante")
 const currency=operation.currency==="DOP" ? {operation:"DOP",reporting:"DOP"} : {operation:operation.currency,reporting:"DOP",rate:operation.rate.toFixed(4),rateDate:operation.rateDate?.toISOString().slice(0,10)}
 const lines=snapshot.lines.map(line=>({description:line.description,kind:"SERVICIO",unit:"UNIDAD",quantity:"1",unitPrice:new Decimal(line.amountCents).div(100).toFixed(2),taxTreatment:"EXENTO",priceIncludesTax:true,retentionAgent:"1",withholdings:[{kind:"ISR",rate:line.isrRate,amount:new Decimal(line.withheldCents).div(100).toFixed(2)}]}))
 return {type:"E47",issueDate:day(allocation.supplierPayment.paidAt),expectedPolicyVersion:settings.version,currency,issuer:{id:actor.accountId,name:settings.legalName,identification:settings.taxId.replace(/[\s-]/g,""),country:"DO"},supplier:party,source:{kind:"SUPPLIER_PAYMENT",id:paymentId},payment:{type:"CONTADO"},lines}
}
