import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import { DO_ECF_TYPES } from "../profiles/do-ecf/catalog"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"

export async function resolveFiscalPolicy(accountId: string, db: Prisma.TransactionClient = prisma) {
  const settings = await db.fiscalSettings.findUnique({ where: { accountId } })
  return {
    enabled: settings?.enabled ?? false,
    jurisdiction: settings?.jurisdiction ?? null,
    regime: settings?.regime ?? null,
    environment: settings?.environment ?? null,
    configurationStatus: settings?.configurationStatus ?? "INCOMPLETE",
    version: settings?.version ?? null,
    effectiveFrom: settings?.effectiveFrom?.toISOString() ?? null,
    externalReadiness: "NOT_CONNECTED" as const,
  }
}

export async function getFiscalCapabilities(user: PermissionAwareUser & { accountId: string }) {
  const permissions = {
    configure: hasPermission(user, "canManageFiscalSettings"),
    manageSequences: hasPermission(user, "canManageFiscalSequences"),
    prepare: hasPermission(user, "canPrepareFiscalDocuments"),
    view: hasPermission(user, "canViewFiscalDocuments"),
  }
  if (!Object.values(permissions).some(Boolean)) return null
  const policy = await resolveFiscalPolicy(user.accountId)
  return {
    policy,
    permissions,
    recognizedTypes: [...DO_ECF_TYPES],
    permittedTypes: policy.enabled && policy.jurisdiction === "DO" && policy.regime === "DO_ECF" ? [...DO_ECF_TYPES] : [],
    operations: { configure: permissions.configure, preview: permissions.prepare && policy.jurisdiction === "DO" && policy.regime === "DO_ECF", manageSequences: permissions.manageSequences && policy.jurisdiction === "DO" && policy.regime === "DO_ECF" && policy.environment === "TEST", prepare: permissions.prepare && policy.enabled && policy.configurationStatus === "VALIDATED" && policy.jurisdiction === "DO" && policy.regime === "DO_ECF" && policy.environment === "TEST", view: permissions.view, emit: false },
    connectionRequired: true,
  }
}
