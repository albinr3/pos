import { AsyncLocalStorage } from "node:async_hooks"
import { createHash } from "node:crypto"
import type { CashControl, CashShift, Prisma, User } from "@prisma/client"
import type { NextRequest } from "next/server"

type CashOperationIdentity = { clientOperationId: string; accountId: string; userId: string; fiscalPolicyVersion?: number }
export type CashOperationInput = CashOperationIdentity & ({ cashShiftId: string; clientSequence: number } | { cashShiftId: null; clientSequence: null })
export type CashActor = Pick<User, "id" | "accountId" | "name" | "isOwner"> & Partial<User>
export type CashRequestScope = {
  operation?: CashOperationInput
  payloadHash?: string
  tx?: Prisma.TransactionClient
  trustedActor?: CashActor
  deviceHash?: string
  control?: CashControl | null
  shift?: CashShift | null
  correction?: { sourceType: string; sourceId: string; moneyMoved: boolean; reason: string }
  maintenance?: boolean
  fiscalDiscard?: boolean
  fiscalCheckedAccountId?: string
}
export const cashRequest = new AsyncLocalStorage<CashRequestScope>()
export const cashHash = (value: string) => createHash("sha256").update(value).digest("hex")
export function cashDeviceHashFromRequest(request: NextRequest): string {
  // El token móvil solo se acepta junto a las dos credenciales verificadas por la API.
  const mobile = request.headers.has("x-subuser-token") && (request.headers.has("x-clerk-authorization") || request.headers.has("authorization"))
  const token = mobile ? request.headers.get("x-cash-device-token") : request.cookies.get("movopos-cash-device")?.value
  return token ? cashHash(token) : ""
}
export class CashControlError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message)
    this.name = "CashControlError"
  }
}
export function withCashOperation<T>(operation: CashOperationInput | undefined, payload: unknown, fn: () => Promise<T>): Promise<T> {
  // No aceptar un actor enviado por el cliente. La identidad se resuelve otra vez desde la petición.
  if (!operation || cashRequest.getStore()?.operation) return fn()
  return cashRequest.run({ ...cashRequest.getStore(), operation, payloadHash: cashHash(JSON.stringify(payload)) }, fn)
}
export async function resolveCashIdentity(): Promise<{ actor: CashActor; deviceHash: string }> {
  const existing = cashRequest.getStore()
  if (existing?.trustedActor) return { actor: existing.trustedActor, deviceHash: existing.deviceHash ?? "" }
  const { headers, cookies } = await import("next/headers")
  const { NextRequest } = await import("next/server")
  const { getCurrentUserFromRequest } = await import("@/app/api/_helpers/auth")
  const requestHeaders = await headers()
  const actor = await getCurrentUserFromRequest(new NextRequest("http://localhost/api/cash-shifts", { headers: requestHeaders }))
  if (!actor) throw new CashControlError("AUTH_REQUIRED", "Inicia sesión para operar la caja", 401)
  const mobile = requestHeaders.has("x-subuser-token") && (requestHeaders.has("x-clerk-authorization") || requestHeaders.has("authorization"))
  const token = mobile ? requestHeaders.get("x-cash-device-token") : (await cookies()).get("movopos-cash-device")?.value
  return { actor, deviceHash: token ? cashHash(token) : "" }
}
