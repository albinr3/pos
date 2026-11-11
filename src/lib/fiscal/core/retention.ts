import type { Prisma } from "@prisma/client"

// Mantener esta condición alineada con el trigger fiscal_account_retention_guard.
// Un perfil apagado no vuelve descartable el historial fiscal ya creado.
export async function hasFiscalHistory(db: Prisma.TransactionClient, accountId: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ present: boolean }>>`
    SELECT (
      EXISTS (SELECT 1 FROM "FiscalSettings" WHERE "accountId" = ${accountId} AND enabled) OR
      EXISTS (SELECT 1 FROM "FiscalPolicyChange" WHERE "accountId" = ${accountId}) OR
      EXISTS (SELECT 1 FROM "FiscalSequence" WHERE "accountId" = ${accountId}) OR
      EXISTS (SELECT 1 FROM "FiscalDocument" WHERE "accountId" = ${accountId}) OR
      EXISTS (SELECT 1 FROM "FiscalPreparationOperation" WHERE "accountId" = ${accountId}) OR
      EXISTS (SELECT 1 FROM "FiscalReceivedDocument" WHERE "accountId" = ${accountId}) OR
      EXISTS (SELECT 1 FROM "FiscalAdjustment" WHERE "accountId" = ${accountId}) OR
      EXISTS (SELECT 1 FROM "FiscalAdjustmentOperation" WHERE "accountId" = ${accountId}) OR
      EXISTS (SELECT 1 FROM "FiscalForeignOperation" WHERE "accountId" = ${accountId}) OR
      EXISTS (SELECT 1 FROM "FiscalConcept" WHERE "accountId" = ${accountId})
    ) AS present`
  return rows[0]?.present === true
}

export const FISCAL_RETENTION_MESSAGE = "Esta empresa tiene historial fiscal. Descárgalo desde Ajustes; la eliminación definitiva está suspendida hasta definir su conservación."

export async function assertNoFiscalHistoryForDeletion(db: Prisma.TransactionClient, accountId: string) {
  if (await hasFiscalHistory(db, accountId)) throw new Error("FISCAL_RETENTION_REQUIRED")
}
