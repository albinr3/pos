// Auth stub: for now we assume a single local user.
// Later you can replace this with real auth (NextAuth/Auth.js) and roles/permissions.

export type CurrentUser = {
  username: string
  canOverridePrice: boolean
}

export function getCurrentUserStub(): CurrentUser {
  // TODO (enable later): derive from session
  return {
    username: "admin",
    canOverridePrice: true,
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
