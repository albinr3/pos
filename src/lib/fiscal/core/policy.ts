import { prisma } from "@/lib/db"
import { DO_ECF_TYPES } from "../profiles/do-ecf/catalog"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"

export async function resolveFiscalPolicy(accountId: string) {
  const settings = await prisma.fiscalSettings.findUnique({ where: { accountId } })
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
    operations: { configure: false, manageSequences: false, prepare: false, view: false, emit: false },
    connectionRequired: true,
  }
}
