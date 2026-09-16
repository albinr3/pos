/**
 * Devuelve el email principal de un usuario de Clerk tanto desde la API como
 * desde los payloads de webhook (que usan nombres de campos en snake_case).
 */
export function getClerkPrimaryEmail(user: unknown): string | null {
  if (!user || typeof user !== "object") return null

  const data = user as {
    primaryEmailAddressId?: unknown
    primary_email_address_id?: unknown
    emailAddresses?: unknown
    email_addresses?: unknown
  }
  const primaryEmailAddressId =
    typeof data.primaryEmailAddressId === "string"
      ? data.primaryEmailAddressId
      : typeof data.primary_email_address_id === "string"
        ? data.primary_email_address_id
        : null
  const rawAddresses = Array.isArray(data.emailAddresses)
    ? data.emailAddresses
    : Array.isArray(data.email_addresses)
      ? data.email_addresses
      : []
  const addresses = rawAddresses
    .map((address) => {
      if (!address || typeof address !== "object") return null
      const value = address as { id?: unknown; emailAddress?: unknown; email_address?: unknown }
      const email =
        typeof value.emailAddress === "string"
          ? value.emailAddress.trim()
          : typeof value.email_address === "string"
            ? value.email_address.trim()
            : ""
      return email ? { id: typeof value.id === "string" ? value.id : null, email } : null
    })
    .filter((address): address is { id: string | null; email: string } => Boolean(address))

  // Clerk identifica el correo principal por ID; no asumir que el primero lo es.
  return addresses.find((address) => address.id === primaryEmailAddressId)?.email ?? addresses[0]?.email ?? null
}
