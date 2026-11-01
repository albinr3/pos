"use client"

import { getPendingCounts } from "@/lib/indexed-db"
import { assertCashShiftAccess, cashPending, refreshCashContext, type CashActorIdentity, type CashContext } from "@/lib/cash-offline"

export async function assertNoCashOpeningPending(all = false) {
  const legacy = await getPendingCounts()
  if (legacy.sales || legacy.payments) throw new Error("Sincroniza las ventas y abonos anteriores antes de activar o abrir la caja")
  const queued = await cashPending()
  if (queued.some(record => all || record.cashOperation.cashShiftId !== null)) throw new Error("Hay operaciones pendientes de este u otro turno. Resuélvelas en Cuadre diario antes de continuar")
}

export async function openCashShiftFromClient(actor: CashActorIdentity, countedCents: number, note: string): Promise<CashContext> {
  if (!navigator.onLine) throw new Error("Necesitas conexión para abrir tu turno de caja")
  const before = await refreshCashContext()
  if (before.accountId !== actor.accountId || before.userId !== actor.id) throw new Error("El empleado cambió. Recarga la página antes de abrir el turno")
  if (!before.enabled) throw new Error("El control por turnos está desactivado. Actualiza la página")
  if (before.activeShift) { assertCashShiftAccess(before, actor); window.dispatchEvent(new Event("cash-shift-changed")); return before }
  if (!before.canOperate) throw new Error("No tienes permiso para abrir turnos de caja")
  if (!Number.isSafeInteger(countedCents) || countedCents < 0 || countedCents > 2147483647) throw new Error("Introduce un monto válido para el efectivo contado")
  if (before.expectedOpeningCents !== countedCents && !note.trim()) throw new Error("Explica la diferencia entre el efectivo contado y el esperado")
  await assertNoCashOpeningPending()
  try {
    const response = await fetch("/api/cash-shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", countedCents, note }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? "No se pudo abrir el turno")
    const context = await refreshCashContext()
    assertCashShiftAccess(context, actor)
    window.dispatchEvent(new Event("cash-shift-changed"))
    return context
  } catch (error) {
    // La respuesta puede perderse después del commit. Comprobar el turno antes de ofrecer otra apertura.
    const recovered = await refreshCashContext().catch(() => null)
    if (recovered?.enabled && recovered.activeShift?.isMine && recovered.activeShift.isDevice && recovered.activeShift.status === "OPEN" && recovered.userId === actor.id && recovered.accountId === actor.accountId) {
      window.dispatchEvent(new Event("cash-shift-changed"))
      return recovered
    }
    if (error instanceof TypeError) throw new Error("No se pudo confirmar la apertura. Revisa la conexión y reintenta; primero comprobaremos si el turno ya se abrió.")
    throw error
  }
}
