"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatRD } from "@/lib/money"
import { dateKeyDO } from "@/lib/date-time"

export type PurchaseCreditValue = { type: "CONTADO" | "CREDITO"; dueDate: string; initialPaymentCents: number }
export function proposePurchaseDueDate(days: number) {
  const today = new Date(`${dateKeyDO(new Date())}T00:00:00Z`)
  return new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10)
}
export function purchaseCreditError(value: PurchaseCreditValue, totalCents: number, canPay = true): string | null {
  if (value.type !== "CREDITO") return null
  const date = new Date(`${value.dueDate}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.dueDate) return "Selecciona un vencimiento válido"
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || !Number.isSafeInteger(value.initialPaymentCents) || value.initialPaymentCents < 0 || value.initialPaymentCents >= totalCents) return "El abono debe ser menor que el total. Usa Contado para pagar todo."
  if (value.initialPaymentCents > 0 && !canPay) return "No tienes permiso para registrar un abono inicial"
  return null
}
export function PurchaseCreditFields({ value, onChange, days, totalCents, canPay = true }: { value: PurchaseCreditValue; onChange: (value: PurchaseCreditValue) => void; days: number; totalCents: number; canPay?: boolean }) {
  return <div className="grid gap-3 rounded-lg border p-4">
    <div className="grid gap-2"><Label htmlFor="purchase-type">Condición de compra</Label><select id="purchase-type" className="h-10 rounded-md border bg-background px-3" value={value.type} onChange={e => onChange({ ...value, type: e.target.value as PurchaseCreditValue["type"], dueDate: value.dueDate || proposePurchaseDueDate(days), initialPaymentCents: 0 })}><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option></select></div>
    {value.type === "CREDITO" && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="purchase-due">Vencimiento *</Label><Input id="purchase-due" type="date" required value={value.dueDate} onChange={e => onChange({ ...value, dueDate: e.target.value })} /><span className="text-xs text-muted-foreground">Plazo del proveedor: {days} días</span></div>
        {canPay ? <div className="grid gap-2"><Label htmlFor="purchase-initial">Abono inicial (RD$)</Label><Input id="purchase-initial" type="number" min="0" step="0.01" value={value.initialPaymentCents / 100} onChange={e => onChange({ ...value, initialPaymentCents: Math.round(Number(e.target.value) * 100) })} /></div> : <p className="text-sm text-muted-foreground">Esta compra quedará pendiente de pago. Registrar abonos requiere permiso de pagos a proveedores.</p>}</div>
      <p className="text-sm">Pendiente: <strong>{formatRD(Math.max(0, totalCents - value.initialPaymentCents))}</strong></p>
      {value.initialPaymentCents >= totalCents && totalCents > 0 && <p className="text-sm text-destructive">El abono debe ser menor que el total. Usa Contado para pagar todo.</p>}
    </>}
  </div>
}
