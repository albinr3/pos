"use client"

import { useEffect, useRef, useState } from "react"
import { cashPending, submitControlledDocument, syncCashOutbox } from "@/lib/cash-offline"
import { formatRD } from "@/lib/money"

type Actor = { id: string; accountId: string }
type Credit = { id: string; customerId: string; customerName: string; originalCents: number; balanceCents: number; adjustmentId: string }
type Receivable = { id: string; customerId: string; balanceCents: number; customer?: { name?: string }; sale?: { invoiceCode?: string }; origin?: { reference?: string } }
const field = "w-full rounded border bg-background px-2 py-1"
async function get(url: string) {
  const response = await fetch(url, { cache: "no-store" }), result = await response.json()
  if (!response.ok) throw new Error(result.error?.message ?? result.error ?? "No se pudo cargar la información")
  return result
}
function parseCents(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) throw new Error("Indica un importe válido con hasta dos decimales")
  const [whole, fraction = ""] = value.split(".")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (!cents) throw new Error("El importe debe ser mayor que cero")
  return cents
}

export function FiscalCustomerCredits({ actor }: { actor: Actor }) {
  const [credits, setCredits] = useState<Credit[]>([]), [receivables, setReceivables] = useState<Receivable[]>([])
  const [creditId, setCreditId] = useState(""), [receivableId, setReceivableId] = useState(""), [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("")
  const [nextCreditSkip, setNextCreditSkip] = useState<number | null>(null), [nextArSkip, setNextArSkip] = useState<number | null>(null)
  const [arReload, setArReload] = useState(0)
  async function load(skip = 0) {
    try { const data = await get(`/api/customer-credits?availableOnly=true&take=100&skip=${skip}`); const incoming = data.data as Credit[]; setCredits(previous => skip ? [...new Map<string, Credit>([...previous, ...incoming].map(item => [item.id, item] as const)).values()] : incoming); setNextCreditSkip(data.nextSkip); setError("") } catch (e) { setError((e as Error).message) }
  }
  useEffect(() => { void load() }, [])
  const selected = credits.find(item => item.id === creditId)
  const currentCustomer = useRef("")
  useEffect(() => {
    const customerId = selected?.customerId
    currentCustomer.current = customerId ?? ""
    let active = true
    setReceivables([]); setNextArSkip(null)
    if (customerId) void get(`/api/accounts-receivable?take=100&customerId=${encodeURIComponent(customerId)}`).then(data => { if (active) { setReceivables(data.data); setNextArSkip(data.nextSkip) } }).catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [selected?.customerId, arReload])
  async function loadMoreReceivables() {
    if (!selected || nextArSkip === null) return
    const customerId = selected.customerId
    try {
      const data = await get(`/api/accounts-receivable?take=100&skip=${nextArSkip}&customerId=${encodeURIComponent(customerId)}`)
      // Una respuesta tardía no debe mezclar deudas de dos clientes distintos.
      if (currentCustomer.current === customerId) { setReceivables(previous => [...previous, ...data.data]); setNextArSkip(data.nextSkip) }
    } catch (e) { setError((e as Error).message) }
  }
  const matching = receivables.filter(item => item.customerId === selected?.customerId && item.balanceCents > 0)
  async function apply() {
    setBusy(true); setError(""); setMessage("")
    try {
      if (!selected || !receivableId) throw new Error("Selecciona el saldo y la cuenta por cobrar")
      if ((await cashPending()).some(item => item.cashOperation.accountId === actor.accountId && item.cashOperation.userId === actor.id && item.kind === "applyFiscalCustomerCredit" && item.payload.creditId === selected.id)) throw new Error("Ya hay una aplicación pendiente; sincroniza la caja antes de repetirla")
      const result = await submitControlledDocument("applyFiscalCustomerCredit", { creditId: selected.id, receivableId, amountCents: parseCents(amount) }, actor)
      if (!result || result.pending) { setMessage(result?.error ?? "Aplicación pendiente de sincronización; no la registres nuevamente."); return }
      setMessage("Saldo aplicado a la cuenta por cobrar."); setAmount(""); setReceivableId(""); setCreditId(""); await load(); setArReload(value => value + 1)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function synchronize() { setBusy(true); setError(""); try { await syncCashOutbox(); await load(); setArReload(value => value + 1); setMessage("Pendientes sincronizados.") } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <section className="grid gap-3 rounded border p-4"><h2 className="text-lg font-semibold">Saldos a favor de clientes</h2><p className="text-sm">Se aplican a una deuda del mismo cliente sin registrar otro cobro.</p>
    {credits.length === 0 ? <p>No hay saldos a favor registrados.</p> : <><label>Saldo <select className={field} value={creditId} onChange={e => { currentCustomer.current = credits.find(item => item.id === e.target.value)?.customerId ?? ""; setCreditId(e.target.value); setReceivableId("") }}><option value="">Seleccionar</option>{credits.map(item => <option key={item.id} value={item.id}>{item.customerName} · {formatRD(item.balanceCents)}</option>)}</select></label>
      {nextCreditSkip !== null && <button className="w-fit rounded border p-2" disabled={busy} onClick={() => void load(nextCreditSkip)}>Cargar más saldos</button>}
      <label>Cuenta por cobrar <select className={field} value={receivableId} onChange={e => setReceivableId(e.target.value)}><option value="">Seleccionar</option>{matching.map(item => <option key={item.id} value={item.id}>{item.customer?.name} · {item.origin?.reference ?? item.sale?.invoiceCode ?? item.id} · {formatRD(item.balanceCents)}</option>)}</select></label>
      {nextArSkip !== null && <button className="w-fit rounded border p-2" disabled={busy} onClick={() => void loadMoreReceivables()}>Cargar más cuentas</button>}
      <label>Importe en DOP <input className={field} value={amount} onChange={e => setAmount(e.target.value)} /></label><div className="flex gap-2"><button className="rounded border p-2" disabled={busy || !creditId || !receivableId} onClick={() => void apply()}>Aplicar saldo</button><button className="rounded border p-2" disabled={busy} onClick={() => void synchronize()}>Sincronizar pendientes</button></div></>}
    {error && <p className="text-red-600" role="alert">{error}</p>}{message && <p role="status">{message}</p>}</section>
}
