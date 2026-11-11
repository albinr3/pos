import { Prisma } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { FiscalDocumentError } from "./document"
import type { ExpenseLine } from "./employee-expenses"

type Actor = PermissionAwareUser & { id: string; accountId: string }
type Details = { employee?: { name?: string }; eligibleMinorExpense?: boolean; lines?: ExpenseLine[]; supportReferences?: string[] }
const fail = (message: string): never => { throw new FiscalDocumentError("DOCUMENT_CONFLICT", message, 409) }
export async function getE43Template(actor: Actor, id: string, db: Prisma.TransactionClient = prisma) {
  if (!hasPermission(actor, "canPrepareFiscalDocuments") || !hasPermission(actor, "canManageExpenses")) throw new FiscalDocumentError("FORBIDDEN", "Sin permiso para preparar gastos fiscales", 403)
  const settings = await db.fiscalSettings.findUnique({ where: { accountId: actor.accountId } })
  if (!settings?.enabled || settings.jurisdiction !== "DO" || settings.regime !== "DO_ECF" || settings.environment !== "TEST" || settings.configurationStatus !== "VALIDATED" || !settings.legalName || !settings.taxId) return fail("Activa una configuración fiscal de prueba válida")
  const expense = await db.operatingExpense.findFirst({ where: { id, accountId: actor.accountId, cancelledAt: null } })
  const details = expense?.fiscalExpenseDetails as Details | null
  if (!expense || !details?.eligibleMinorExpense || !details.employee?.name || !Array.isArray(details.lines) || !details.lines.length) return fail("El gasto requiere una declaración de elegibilidad y datos del empleado")
  const lines = details.lines.map(line => {
    // Conservar el tratamiento informado: nunca convertir impuestos o retenciones a exentos.
    if (line.taxTreatment !== "EXENTO" || (line.withholdings?.length ?? 0) > 0) return fail("El gasto contiene impuestos o retenciones incompatibles con E43; revisa el tipo de comprobante")
    return { description: line.description, kind: line.kind, unit: "UNIDAD", quantity: "1", unitPrice: new Decimal(line.amountCents).div(100).toFixed(2), taxTreatment: line.taxTreatment, priceIncludesTax: true }
  })
  // El gasto es un instante: usar UTC aquí cambia el día dominicano cerca de medianoche.
  const issueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(expense.expenseDate)
  return { type: "E43", issueDate, expectedPolicyVersion: settings.version, currency: { operation: "DOP", reporting: "DOP" }, issuer: { id: actor.accountId, name: settings.legalName, identification: settings.taxId.replace(/[\s-]/g, ""), country: "DO" }, source: { kind: "EXPENSE", id }, lines }
}
