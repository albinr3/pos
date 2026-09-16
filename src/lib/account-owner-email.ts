type AccountEmailSource = {
  ownerEmail?: string | null
  billingProfile?: { email?: string | null } | null
  users?: Array<{ email?: string | null }> | null
}

function normalizedEmail(value: string | null | undefined) {
  const email = value?.trim()
  return email || null
}

/**
 * El correo fiscal prevalece porque es el destino elegido para facturación.
 * ownerEmail conserva el contacto de Clerk incluso antes de crear un User local.
 */
export function getAccountOwnerEmail(account: AccountEmailSource): string | null {
  return (
    normalizedEmail(account.billingProfile?.email) ??
    normalizedEmail(account.ownerEmail) ??
    normalizedEmail(account.users?.[0]?.email)
  )
}
