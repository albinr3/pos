// Auth stub: for now we assume a single local user.
// Later you can replace this with real auth (NextAuth/Auth.js) and roles/permissions.

export type CurrentUser = {
  username: string
  canOverridePrice: boolean
  canCancelSales: boolean
  canCancelReturns: boolean
  canCancelPayments: boolean
  canEditSales: boolean
  canEditProducts: boolean
  canChangeSaleType: boolean
  canSellWithoutStock: boolean
  canManageBackups: boolean
}

export function getCurrentUserStub(): CurrentUser {
  // TODO (enable later): derive from session
  // For now, admin has all permissions
  return {
    username: "admin",
    canOverridePrice: true,
    canCancelSales: true,
    canCancelReturns: true,
    canCancelPayments: true,
    canEditSales: true,
    canEditProducts: true,
    canChangeSaleType: true,
    canSellWithoutStock: true,
    canManageBackups: true,
  }
}

/*
// Example (commented) for future:
// import { auth } from "@/auth"
// export async function getCurrentUser() {
//   const session = await auth()
//   return session?.user
// }
*/
