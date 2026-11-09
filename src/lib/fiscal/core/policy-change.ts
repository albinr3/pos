import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"

type FiscalActor = PermissionAwareUser & { id: string; accountId: string }
type PolicyChange = {
  expectedVersion: number
  enabled: boolean
  jurisdiction: string | null
  regime: string | null
  environment: "TEST"
  configurationStatus: "INCOMPLETE" | "VALIDATED"
}

// Servicio interno para una futura interfaz. Cada cambio y su copia se confirman juntos.
export async function recordFiscalPolicyChange(actor: FiscalActor, input: PolicyChange) {
  if (!hasPermission(actor, "canManageFiscalSettings")) throw new Error("Sin permiso para configurar el módulo fiscal")
  // La activación requiere primero comprobar pendientes y operaciones offline en la etapa 2.
  if (input.enabled) throw new Error("La activación fiscal todavía no está disponible")
  if (input.environment !== "TEST" || !["INCOMPLETE", "VALIDATED"].includes(input.configurationStatus) ||
      !((input.jurisdiction === null && input.regime === null) || (input.jurisdiction === "DO" && input.regime === "DO_ECF")) ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error("Política fiscal inválida")

  return prisma.$transaction(async tx => {
    // Serializar con la confirmación de operaciones evita aceptar un pendiente bajo una política que acaba de cambiar.
    const account = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Account" WHERE id = ${actor.accountId} FOR NO KEY UPDATE`
    if (!account.length) throw new Error("Empresa no encontrada")
    const current = await tx.fiscalSettings.findUnique({ where: { accountId: actor.accountId } })
    if ((current?.version ?? 0) !== input.expectedVersion) throw new Error("La política fiscal cambió; actualiza la consulta")
    const version = input.expectedVersion + 1
    const effectiveFrom = new Date()
    const data = { enabled: false, jurisdiction: input.jurisdiction, regime: input.regime, environment: input.environment, configurationStatus: input.configurationStatus, version, effectiveFrom }
    if (current) {
      const result = await tx.fiscalSettings.updateMany({ where: { accountId: actor.accountId, version: input.expectedVersion }, data })
      if (result.count !== 1) throw new Error("La política fiscal cambió; actualiza la consulta")
    } else {
      await tx.fiscalSettings.create({ data: { ...data, accountId: actor.accountId } })
    }
    await tx.fiscalPolicyChange.create({ data: { accountId: actor.accountId, actorUserId: actor.id, version, policy: { ...data, effectiveFrom: effectiveFrom.toISOString() } } })
    return data
  })
}
