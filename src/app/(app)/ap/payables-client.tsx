"use client"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatRD } from "@/lib/money"
import { formatDateTimeDO } from "@/lib/date-time"
import { filterTreasuryAccountsByPaymentMethod } from "@/lib/treasury-account-selection"
import { PaymentMethod } from "@prisma/client"
import { submitControlledDocument } from "@/lib/cash-offline"
import type { getPayable, listPayables, supplierPaymentOptions } from "@/lib/accounts-payable"
type Listing = Awaited<ReturnType<typeof listPayables>>
type Detail = Awaited<ReturnType<typeof getPayable>>
type Options = Awaited<ReturnType<typeof supplierPaymentOptions>>
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || "No se pudo completar la operación")
  return result
}
export function AccountsPayableClient({ canPay, canCancel, canEdit, canReport = false, canPrepareE41 = false }: { canPay: boolean; canCancel: boolean; canEdit: boolean; canReport?: boolean; canPrepareE41?: boolean }) {
  const [data, setData] = useState<Listing | null>(null), [detail, setDetail] = useState<Detail | null>(null)
  const [query, setQuery] = useState(""), [supplierId, setSupplierId] = useState(""), [status, setStatus] = useState(""), [overdue, setOverdue] = useState(false)
  const [skip, setSkip] = useState(0), [filters, setFilters] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false)
  const [options, setOptions] = useState<Options>({ accounts: [], methods: [] }), [method, setMethod] = useState("EFECTIVO"), [account, setAccount] = useState("")
  const [amount, setAmount] = useState(""), [note, setNote] = useState(""), [dueDate, setDueDate] = useState(""), [notes, setNotes] = useState("")
  const [paymentRegistered, setPaymentRegistered] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<Array<{id: string; name: string}>>([])
  const [newSupplier, setNewSupplier] = useState(""), [newDescription, setNewDescription] = useState(""), [newAmount, setNewAmount] = useState(""), [newDue, setNewDue] = useState(""), [newReceipt, setNewReceipt] = useState("")
  const newOperation = useRef({ signature: "", id: "" })
  const operation = useRef({ signature: "", id: "" })
  const listVersion = useRef(0)
  const selection = useRef({ id: null as string | null, version: 0 })
  // Una respuesta anterior no debe reemplazar los filtros actuales ni reabrir una cuenta cerrada.
  const load = useCallback(async () => { const version = ++listVersion.current; try { setError(""); const result = await json<Listing>(`/api/accounts-payable?${filters}&skip=${skip}&take=50`); if (version === listVersion.current) setData(result) } catch (e) { if (version === listVersion.current) setError((e as Error).message) } }, [filters, skip])
  useEffect(() => { void load() }, [load])
  useEffect(() => { json<Options>("/api/supplier-payments/options").then(setOptions).catch(e => setError(e.message)) }, [])
  useEffect(() => { if (canEdit) json<{data: Array<{id: string; name: string}>}>("/api/suppliers?take=500").then(r => setSuppliers(r.data)).catch(e => setError(e.message)) }, [canEdit])
  // Respetar el ID de la caja controlada, no solo el tipo CAJA ni el orden alfabético.
  const accounts = filterTreasuryAccountsByPaymentMethod(options.accounts, method as PaymentMethod).filter(a => method === "EFECTIVO" || a.type === "BANCO")
  const selectedAccountId = accounts.some(a => a.id === account) ? account : accounts[0]?.id ?? ""
  async function open(id: string) { if (selection.current.id !== id) setPaymentRegistered(null); const version = ++selection.current.version; selection.current.id = id; try { const d = await json<Detail>(`/api/accounts-payable/${id}`); if (selection.current.version !== version || selection.current.id !== id) return; setDetail(d); setAmount(""); setNote(""); setDueDate(d.dueDate); setNotes(d.purchase?.notes ?? d.notes ?? ""); setError("") } catch (e) { if (selection.current.version === version) setError((e as Error).message) } }
  async function act(run: () => Promise<unknown>) { setBusy(true); setError(""); try { await run(); await load(); if (detail && selection.current.id === detail.id) await open(detail.id) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  async function pay() {
    if (!detail) return
    setPaymentRegistered(null)
    if (!navigator.onLine) throw new Error("Conéctate para registrar el pago")
    const payload = { apId: detail.id, amountCents: Math.round(Number(amount) * 100), method, treasuryAccountId: selectedAccountId, note }
    if (!payload.amountCents || payload.amountCents > detail.balanceCents) throw new Error("Introduce un pago mayor que cero y menor o igual al saldo")
    const signature = JSON.stringify(payload)
    if (operation.current.signature !== signature) operation.current = { signature, id: crypto.randomUUID() }
    const input = { ...payload, operationId: operation.current.id }
    const controlled = await submitControlledDocument("supplierPayment", input)
    if (controlled?.pending) { selection.current = { id: null, version: selection.current.version + 1 }; setDetail(null); throw new Error("Pago pendiente de confirmación. Revísalo en Cuadre diario antes de volver a registrar otro pago.") }
    if (!controlled) await json("/api/supplier-payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
    operation.current = { signature: "", id: "" }
    // Solo confirmar el pago después de recibir éxito; uno pendiente aún no está aplicado.
    setPaymentRegistered(detail.id)
  }
  const paymentConfirmation = <div role="status" className="flex items-center gap-3 rounded-md border border-green-300 bg-green-50 p-4 text-green-800 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 dark:border-green-800 dark:bg-green-950 dark:text-green-200"><CheckCircle2 className="h-6 w-6 shrink-0 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-500" aria-hidden="true" /><span className="font-semibold">Pago registrado</span></div>
  return <div className="grid gap-5">
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
    {paymentRegistered && !detail && paymentConfirmation}
    {canEdit && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Registrar obligación sin inventario</summary><form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); void act(async () => { const input = { supplierId: newSupplier, description: newDescription, supplierReceiptNumber: newReceipt.trim() || null, totalCents: Math.round(Number(newAmount) * 100), dueDate: newDue }; const signature = JSON.stringify(input); if (newOperation.current.signature !== signature) newOperation.current = { signature, id: crypto.randomUUID() }; await json("/api/accounts-payable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, operationId: newOperation.current.id }) }); newOperation.current = { signature: "", id: "" }; setNewDescription(""); setNewAmount(""); setNewDue(""); setNewReceipt("") }) }}><label>Proveedor<select required className="block h-10 w-full rounded border bg-background px-3" value={newSupplier} onChange={e => setNewSupplier(e.target.value)}><option value="">Seleccionar</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Concepto<Input required maxLength={200} value={newDescription} onChange={e => setNewDescription(e.target.value)} /></label><label>Comprobante recibido (opcional)<Input maxLength={50} value={newReceipt} onChange={e => setNewReceipt(e.target.value)} /></label><label>Total adeudado RD$<Input required type="number" min="0.01" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} /></label><label>Vencimiento<Input required type="date" value={newDue} onChange={e => setNewDue(e.target.value)} /></label><Button disabled={busy}>Registrar obligación</Button></form></details>}
    {data && <div className="grid gap-3 sm:grid-cols-3">{[["Pendiente actual", data.summary.balanceCents], ["Vencido actual", data.summary.overdueCents], ["Total original", data.summary.totalCents]].map(([label, value]) => <Card key={label}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{formatRD(Number(value))}</p></CardContent></Card>)}</div>}
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); setSkip(0); setFilters(new URLSearchParams({ query, supplierId, status, ...(overdue ? { overdue: "true" } : {}) }).toString()) }}>
      <div><Label htmlFor="ap-search">Proveedor o compra</Label><Input id="ap-search" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div><Label htmlFor="ap-status">Estado</Label><select id="ap-status" className="block h-10 rounded border bg-background px-3" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option>{["PENDIENTE", "PARCIAL", "PAGADA"].map(s => <option key={s}>{s}</option>)}</select></div>
      <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={overdue} onChange={e => setOverdue(e.target.checked)} />Solo vencidas</label><Button>Filtrar</Button><Button type="button" variant="outline" onClick={() => { setSupplierId(""); setQuery(""); setStatus(""); setOverdue(false); setSkip(0); setFilters("") }}>Limpiar</Button>{canReport && <Link href="/reports/accounts-payable" className="text-sm underline">Ver reporte</Link>}
    </form>
    {data && <>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Resumen por proveedor</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.providers.map(p => <button className="rounded border p-3 text-left text-sm hover:bg-muted" key={p.supplierId} onClick={() => { setSupplierId(p.supplierId); setSkip(0); setFilters(new URLSearchParams({ supplierId: p.supplierId }).toString()) }}>{p.name}<strong className="float-right">{formatRD(p.balanceCents)}</strong></button>)}</div></details>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted"><tr>{["Proveedor", "Compra", "Vencimiento", "Total", "Abonado", "Pendiente", "Estado", ""].map((h, i) => <th className="p-3 text-left" key={i}>{h}</th>)}</tr></thead><tbody>{data.data.map(ap => <tr className="border-t" key={ap.id}><td className="p-3">{ap.purchase?.supplierName || ap.supplier.name}{!ap.supplier.isActive && <span className="block text-xs text-muted-foreground">Inactivo</span>}</td><td className="p-3">{ap.purchaseId ? <Link href={`/receipts/purchase/${ap.purchaseId}`} target="_blank" className="underline">{ap.purchaseId.slice(-8)}</Link> : ap.description}</td><td className="p-3">{ap.dueDate}{ap.overdue && <span className="block text-xs text-destructive">{ap.overdueDays} días de atraso</span>}</td><td className="p-3">{formatRD(ap.totalCents)}</td><td className="p-3">{formatRD(ap.totalCents - ap.balanceCents)}</td><td className="p-3 font-semibold">{formatRD(ap.balanceCents)}</td><td className="p-3">{ap.status}</td><td className="p-3"><Button variant="outline" onClick={() => void open(ap.id)}>Ver cuenta</Button></td></tr>)}{data.data.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No hay cuentas por pagar para estos filtros.</td></tr>}</tbody></table></div>
      <div className="flex items-center justify-end gap-3 text-sm"><span>{data.summary.count} cuentas</span><Button variant="outline" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - 50))}>Anterior</Button><Button variant="outline" disabled={data.nextSkip === null} onClick={() => setSkip(data.nextSkip!)}>Siguiente</Button></div>
    </>}
    <Dialog open={!!detail} onOpenChange={value => { if (!value) { selection.current = { id: null, version: selection.current.version + 1 }; setDetail(null); setPaymentRegistered(null) } }}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Cuenta de {detail?.purchase?.supplierName || detail?.supplier.name}</DialogTitle></DialogHeader>{detail && <div className="grid gap-5">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {paymentRegistered === detail.id && paymentConfirmation}
      <p>Total {formatRD(detail.totalCents)} · Abonado {formatRD(detail.paidCents)} · <strong>Pendiente {formatRD(detail.balanceCents)}</strong>{detail.purchase?.cancelledAt && " · Compra anulada"}</p>
      {!detail.foreignOperationId && (detail.withheldItbisCents > 0 || detail.withheldIsrCents > 0) && <p>Retención ITBIS {formatRD(detail.withheldItbisCents)} · Retención ISR {formatRD(detail.withheldIsrCents)} · Bruto {formatRD(detail.totalCents + detail.withheldItbisCents + detail.withheldIsrCents)}</p>}
      {detail.supplierReceiptNumber && <p>Comprobante recibido: {detail.supplierReceiptNumber}</p>}
      {detail.foreignOperationId && <p>Esta obligación se liquida y documenta en la sección Pago al exterior.</p>}
      {canPrepareE41 && !detail.foreignOperationId && !detail.purchase?.cancelledAt && !detail.purchase?.supplierReceiptNumber && !detail.supplierReceiptNumber && <Link className="text-sm underline" href={`/fiscal/documents/new?source=${detail.purchaseId ? "PURCHASE" : "PAYABLE"}&sourceId=${encodeURIComponent(detail.purchaseId ?? detail.id)}`}>Revisar E41 de esta operación</Link>}
      {canEdit && !detail.purchase?.cancelledAt && <form className="grid gap-2 rounded border p-3" onSubmit={e => { e.preventDefault(); void act(() => json(detail.purchaseId ? `/api/purchases/${detail.purchaseId}` : `/api/accounts-payable/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueDate, notes }) })) }}><Label>Vencimiento</Label><Input type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} /><Label>Notas</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /><Button variant="outline" disabled={busy}>Guardar notas y vencimiento</Button></form>}
      {canPay && !detail.foreignOperationId && detail.balanceCents > 0 && !detail.purchase?.cancelledAt && <form className="grid gap-3 rounded border p-4" onSubmit={e => { e.preventDefault(); void act(pay) }}><h3 className="font-medium">Registrar pago</h3><div className="flex gap-2"><Input aria-label="Monto del pago" type="number" min="0.01" max={detail.balanceCents / 100} step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="Monto RD$" /><Button type="button" variant="outline" onClick={() => setAmount(String(detail.balanceCents / 100))}>Liquidar</Button></div><select aria-label="Método de pago" className="h-10 rounded border bg-background px-3" value={method} onChange={e => { setMethod(e.target.value); setAccount("") }}>{options.methods.map(m => <option key={m}>{m}</option>)}</select><select aria-label="Cuenta de pago" className="h-10 rounded border bg-background px-3" value={selectedAccountId} onChange={e => setAccount(e.target.value)}>{accounts.length === 0 && <option value="">No hay cuentas disponibles</option>}{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><Input aria-label="Nota del pago" value={note} onChange={e => setNote(e.target.value)} placeholder="Nota (opcional)" /><Button disabled={busy || accounts.length === 0}>{busy ? "Procesando…" : "Registrar pago"}</Button></form>}
      <h3 className="font-medium">Historial de pagos</h3>{detail.payments.length === 0 && <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>}{detail.payments.map(p => <div className="flex items-center justify-between gap-3 rounded border p-3 text-sm" key={p.id}><div><strong>{formatRD(p.amountCents)}</strong> · {p.method} · {p.treasuryAccount.name}<p>{formatDateTimeDO(p.paidAt)} · {p.user.name}</p><p className="break-all text-xs text-muted-foreground">{p.reference}</p>{p.note && <p>{p.note}</p>}{p.cancelledAt && <p className="text-destructive">Anulado: {p.cancellationReason}</p>}</div>{canCancel && !p.cancelledAt && <Button variant="outline" disabled={busy} onClick={() => { const reason = prompt("Motivo de anulación del pago:"); if (reason?.trim()) void act(() => json(`/api/supplier-payments/${p.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) })) }}>Anular</Button>}</div>)}
    </div>}</DialogContent></Dialog>
  </div>
}
