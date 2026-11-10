import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"

type Actor = PermissionAwareUser & { id: string; accountId: string }
const fields = ["legalName", "taxId", "fiscalAddress", "fiscalEmail", "fiscalPhone"] as const
type Field = typeof fields[number]
export class FiscalSettingsError extends Error {
  constructor(public code: string, message: string, public status: number, public fields: string[] = []) { super(message) }
}
const forbidden = () => new FiscalSettingsError("FORBIDDEN", "Sin permiso para configurar el módulo fiscal", 403)
function authorize(actor: Actor) { if (!hasPermission(actor, "canManageFiscalSettings")) throw forbidden() }

function asResponse(settings: { enabled: boolean; jurisdiction: string | null; regime: string | null; environment: string; version: number; effectiveFrom: Date; legalName: string | null; taxId: string | null; fiscalAddress: string | null; fiscalEmail: string | null; fiscalPhone: string | null } | null) {
  const missingFields = settings?.regime === "DO_ECF" ? fields.filter(f => f !== "fiscalPhone" && !settings[f]) : ["profile"]
  return {
    enabled: settings?.enabled ?? false, jurisdiction: settings?.jurisdiction ?? null, regime: settings?.regime ?? null,
    environment: "TEST" as const, version: settings?.version ?? 0, effectiveFrom: settings?.effectiveFrom?.toISOString() ?? null,
    legalName: settings?.legalName ?? null, taxId: settings?.taxId ?? null, fiscalAddress: settings?.fiscalAddress ?? null,
    fiscalEmail: settings?.fiscalEmail ?? null, fiscalPhone: settings?.fiscalPhone ?? null,
    configurationStatus: missingFields.length ? "INCOMPLETE" : "VALIDATED", missingFields,
    externalReadiness: "NOT_CONNECTED" as const, activationAvailable: true,
    activationBlockedReason: "",
  }
}
export async function getFiscalSettings(actor: Actor) {
  authorize(actor)
  return asResponse(await prisma.fiscalSettings.findUnique({ where: { accountId: actor.accountId } }))
}
export async function updateFiscalSettings(actor: Actor, input: unknown) {
  authorize(actor)
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FiscalSettingsError("INVALID_INPUT", "Datos inválidos", 400)
  const body = input as Record<string, unknown>
  const allowed = ["expectedVersion", "jurisdiction", "regime", "environment", "enabled", ...fields]
  const unknown = Object.keys(body).filter(k => !allowed.includes(k))
  if (unknown.length) throw new FiscalSettingsError("INVALID_INPUT", "Campos no admitidos", 400, unknown)
  if ((body.enabled !== undefined && typeof body.enabled !== "boolean") || body.environment !== "TEST" ||
      !((body.jurisdiction === null && body.regime === null) || (body.jurisdiction === "DO" && body.regime === "DO_ECF")) ||
      !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0)
    throw new FiscalSettingsError("INVALID_INPUT", "Perfil, ambiente o versión inválidos", 400)
  const values = {} as Record<Field, string | null>
  for (const field of fields) {
    const value = body[field]
    if (value !== null && typeof value !== "string") throw new FiscalSettingsError("INVALID_INPUT", "Campo inválido", 400, [field])
    const normalized = typeof value === "string" ? value.trim() : null
    if (normalized && (normalized.length > 255 || /[\u0000-\u001f]/.test(normalized))) throw new FiscalSettingsError("INVALID_INPUT", "Campo inválido o demasiado largo", 400, [field])
    values[field] = normalized || null
  }
  if (values.fiscalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.fiscalEmail)) throw new FiscalSettingsError("INVALID_INPUT", "Correo fiscal inválido", 400, ["fiscalEmail"])
  const missing = body.regime === "DO_ECF" ? fields.filter(f => f !== "fiscalPhone" && !values[f]) : ["profile"]
  return prisma.$transaction(async tx => {
    // Serializar con la cola evita que una operación se confirme durante un cambio de política.
    const account = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Account" WHERE id = ${actor.accountId} FOR NO KEY UPDATE`
    if (!account.length) throw new FiscalSettingsError("NOT_FOUND", "Empresa no encontrada", 404)
    const current = await tx.fiscalSettings.findUnique({ where: { accountId: actor.accountId } })
    if ((current?.version ?? 0) !== body.expectedVersion) throw new FiscalSettingsError("VERSION_CONFLICT", "La configuración cambió; vuelve a cargarla", 409)
    // Omitir enabled al editar nunca debe activar o desactivar implícitamente la empresa.
    const enabled = typeof body.enabled === "boolean" ? body.enabled : current?.enabled ?? false
    if (enabled && missing.length) throw new FiscalSettingsError("CONFIGURATION_INCOMPLETE", "Completa el perfil fiscal antes de activarlo", 422, missing)
    const data = { ...values, enabled, jurisdiction: body.jurisdiction as string | null, regime: body.regime as string | null, environment: "TEST", configurationStatus: missing.length ? "INCOMPLETE" : "VALIDATED", version: (body.expectedVersion as number) + 1, effectiveFrom: new Date() }
    const saved = current ? await tx.fiscalSettings.update({ where: { accountId: actor.accountId }, data }) : await tx.fiscalSettings.create({ data: { ...data, accountId: actor.accountId } })
    await tx.fiscalPolicyChange.create({ data: { accountId: actor.accountId, actorUserId: actor.id, version: data.version, policy: { ...data, effectiveFrom: data.effectiveFrom.toISOString() } } })
    return asResponse(saved)
  })
}
