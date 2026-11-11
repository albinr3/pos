"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { cashPending, submitControlledDocument, syncCashOutbox } from "@/lib/cash-offline"
import { formatRD } from "@/lib/money"

type Actor = { id: string; accountId: string }
type Treasury = { id: string; name: string }
type Availability = { policyVersion: number; originalType?: string; eNcf?: string | null; issueDate?: string; originalTotals?: { gross?: string } | null; sale: { invoiceCode: string; ar?: { balanceCents: number } | null } | null; buyer: { name?: string; id?: string } | null; notes?: Array<{ id: string; state: string; revision: number; fiscalDocumentId: string | null; snapshot: { totals?: { gross?: string } } }>; lines: Array<{ originalLine: number; snapshot: { description: string; kind: string; quantity: string; gross: string }; availability: { availableQuantity: string; availableCents: number } }> }
type Preview = { calculated: { totals: { gross: string; net: string; taxNotCreditable: string }; warnings: string[]; lines?: Array<{ description: string; gross: string; discount: string }> } }
type Command = { originalDocumentId: string; expectedPolicyVersion: number; modificationCode: string; reason: string; lines: Array<{ originalLine: number; quantity: string; physicalQuantity: string; extraDiscountCents: number; description?: string }> }
type Saved = { command: Command; mode: "physical" | "financial"; createOperationId: string; draftId?: string; revision?: number; validateOperationId: string; discardOperationId?: string; reserved?: boolean; preview: Preview; availability: Availability; pendingUpdate?: { operationId: string; expectedRevision: number; note: Command } }
const inputClass = "w-full rounded border bg-background px-2 py-1"

async function request(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(result.error?.fields?.[0]?.message ?? result.error?.message ?? result.error ?? "No se pudo procesar la solicitud"), { status: response.status })
  return result
}
function decimalCents(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) throw new Error("El descuento debe ser un importe válido con hasta dos decimales")
  const [whole, fractional = ""] = value.split(".")
  return Number(whole) * 100 + Number(fractional.padEnd(2, "0"))
}

export function FiscalCreditForm({ originalDocumentId, actor, treasuryAccounts, onClose }: { originalDocumentId: string; actor: Actor; treasuryAccounts: Treasury[]; onClose?: () => void }) {
  const router = useRouter()
  const key = `fiscal-credit-draft:${actor.accountId}:${actor.id}:${originalDocumentId}`
  const [available, setAvailable] = useState<Availability | null>(null)
  const [mode, setMode] = useState<"physical" | "financial">("physical")
  const [modificationCode, setModificationCode] = useState("3")
  const [reason, setReason] = useState("")
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [discounts, setDiscounts] = useState<Record<number, string>>({})
  const [correction, setCorrection] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [editing, setEditing] = useState(false)
  const [settlement, setSettlement] = useState<"REFUND" | "CUSTOMER_CREDIT">("REFUND")
  const [method, setMethod] = useState("EFECTIVO")
  const [treasuryId, setTreasuryId] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const cached = localStorage.getItem(key)
    if (cached) {
      const previous = JSON.parse(cached) as Saved
      setSaved(previous); setAvailable(previous.availability); setPreview(previous.preview); setMode(previous.mode)
      if (previous.pendingUpdate) { restoreCommand(previous.pendingUpdate.note); setEditing(true) }
    }
    if (navigator.onLine) void request(`/api/credit-notes/availability?originalDocumentId=${encodeURIComponent(originalDocumentId)}`).then(setAvailable).catch((e: Error) => setError(e.message))
  }, [key, originalDocumentId])

  function persist(value: Saved | null) {
    setSaved(value)
    if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key)
  }
  function restoreCommand(value: Command) {
    setReason(value.reason); setModificationCode(value.modificationCode)
    setMode(value.lines.some(line => Number(line.physicalQuantity) > 0) ? "physical" : "financial")
    setQuantities(Object.fromEntries(value.lines.map(line => [line.originalLine, line.quantity])))
    setDiscounts(Object.fromEntries(value.lines.map(line => [line.originalLine, (line.extraDiscountCents / 100).toFixed(2)])))
    setCorrection(value.lines.find(line => line.description)?.description ?? "")
  }
  function command(): Command {
    if (!available) throw new Error("No se ha cargado la factura original")
    if (!reason.trim()) throw new Error("Indica el motivo de la nota")
    const lines = available.lines.flatMap(line => {
      const qty = quantities[line.originalLine]?.trim() ?? ""
      if (!qty || Number(qty) === 0) return []
      if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(qty) || Number(qty) <= 0) throw new Error("Usa cantidades positivas con hasta dos decimales")
      if (mode === "physical" && line.snapshot.kind !== "BIEN") throw new Error("Solo los bienes pueden tener devolución física")
      return [{ originalLine: line.originalLine, quantity: qty, physicalQuantity: mode === "physical" ? qty : "0", extraDiscountCents: decimalCents(discounts[line.originalLine] || "0"), ...(modificationCode === "2" ? { description: correction.trim() } : {}) }]
    })
    if (!lines.length) throw new Error("Selecciona al menos una línea")
    if (modificationCode === "2" && !correction.trim()) throw new Error("Indica el texto corregido")
    return { originalDocumentId, expectedPolicyVersion: available.policyVersion, modificationCode, reason: reason.trim(), lines }
  }
  async function review() {
    setBusy(true); setError(""); setMessage("")
    try { const value = command(); const url = editing && saved?.draftId ? `/api/credit-notes/${encodeURIComponent(saved.draftId)}/preview` : "/api/credit-notes/preview"; const result = await request(url, "POST", value); setPreview(result) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function beginEdit() {
    if (!saved?.draftId) return
    setError("")
    const queued = (await cashPending()).some(item => item.cashOperation.accountId === actor.accountId && item.cashOperation.userId === actor.id && item.payload.adjustmentId === saved.draftId)
    if (queued) { setError("Resuelve primero la operación pendiente de caja"); return }
    restoreCommand(saved.command); setPreview(null); setEditing(true)
  }
  async function saveEdit() {
    if (!saved?.draftId || !saved.revision) return
    setBusy(true); setError(""); setMessage("")
    try {
      if (!saved.pendingUpdate && !preview) throw new Error("Previsualiza los cambios antes de guardarlos")
      const pending = saved.pendingUpdate ?? { operationId: crypto.randomUUID(), expectedRevision: saved.revision, note: command() }
      // Guardar el comando antes de enviarlo permite reintentar sin sustituir dos veces la reserva.
      persist({ ...saved, pendingUpdate: pending })
      const updated = await request(`/api/credit-notes/${encodeURIComponent(saved.draftId)}`, "PUT", pending)
      const next: Saved = { ...saved, command: pending.note, mode: pending.note.lines.some(line => Number(line.physicalQuantity) > 0) ? "physical" : "financial", revision: updated.revision, reserved: updated.state === "VALIDADO", preview: updated.preview, pendingUpdate: undefined, validateOperationId: crypto.randomUUID() }
      persist(next); setPreview(updated.preview); setEditing(false); setMessage(next.reserved ? "Reserva sustituida con los cambios." : "Borrador actualizado; vuelve a validarlo.")
    } catch (e) {
      // Un rechazo confirmado no tiene commit: permite corregirlo; un fallo de red conserva el identificador para recuperar el resultado.
      const status = (e as Error & { status?: number }).status
      if (status && status >= 400 && status < 500) { persist({ ...saved, pendingUpdate: undefined }); setPreview(null) }
      setError((e as Error).message)
    } finally { setBusy(false) }
  }
  async function reserve() {
    setBusy(true); setError(""); setMessage("")
    try {
      let pending = saved
      if (!pending) {
        if (!preview || !available) throw new Error("Previsualiza la nota antes de reservarla")
        const input = command()
        // Si el usuario editó después de previsualizar, el servidor debe calcular otra vez lo que verá.
        const latest = await request("/api/credit-notes/preview", "POST", input)
        if (JSON.stringify(latest.calculated.totals) !== JSON.stringify(preview.calculated.totals)) { setPreview(latest); throw new Error("Los importes cambiaron; revisa la nueva previsualización") }
        pending = { command: input, mode, createOperationId: crypto.randomUUID(), validateOperationId: crypto.randomUUID(), preview: latest, availability: available }
        persist(pending)
      }
      if (!pending.draftId) {
        const created = await request("/api/credit-notes", "POST", { operationId: pending.createOperationId, note: pending.command })
        pending = { ...pending, draftId: created.id, revision: created.revision }; persist(pending)
      }
      if (!pending.reserved) {
        const validated = await request(`/api/credit-notes/${encodeURIComponent(pending.draftId!)}/validate`, "POST", { operationId: pending.validateOperationId, expectedRevision: pending.revision })
        pending = { ...pending, reserved: true, preview: validated.preview }; persist(pending); setPreview(validated.preview)
      }
      setMessage("Nota validada y reservada. Revisa el destino del excedente antes de confirmar.")
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function discard() {
    if (!saved) return
    setBusy(true); setError("")
    try {
      let pending = saved
      if (!pending.draftId) {
        const created = await request("/api/credit-notes", "POST", { operationId: pending.createOperationId, note: pending.command })
        pending = { ...pending, draftId: created.id, revision: created.revision }; persist(pending)
      }
      const queued = (await cashPending()).some(item => item.cashOperation.accountId === actor.accountId && item.cashOperation.userId === actor.id && item.payload.adjustmentId === pending?.draftId)
      if (queued) throw new Error("Resuelve primero la operación pendiente de caja")
      if (!pending.discardOperationId) { pending = { ...pending, discardOperationId: crypto.randomUUID() }; persist(pending) }
      // El mismo identificador permite recuperar un descarte cuya respuesta se perdió.
      await request(`/api/credit-notes/${encodeURIComponent(pending.draftId!)}/discard`, "POST", { operationId: pending.discardOperationId, expectedRevision: pending.revision, reason: "Descartado por el usuario" })
      persist(null); setPreview(null); setMessage("Borrador descartado; la reserva quedó liberada.")
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function confirm() {
    if (!saved?.draftId || !saved.reserved || !available) return
    setBusy(true); setError(""); setMessage("")
    try {
      const pending = (await cashPending()).find(item => item.cashOperation.accountId === actor.accountId && item.cashOperation.userId === actor.id && item.payload.adjustmentId === saved.draftId)
      if (pending) throw new Error(pending.error ?? "Ya hay una operación pendiente; sincronízala antes de continuar")
      if (navigator.onLine) {
        const existing = await request(`/api/credit-notes/${encodeURIComponent(saved.draftId)}`)
        if (existing.state === "PREPARADO_PENDIENTE_CONEXION") { persist(null); router.push(`/invoices/fiscal/${existing.fiscalDocumentId}`); return }
      }
      const economic = Math.round(Number(saved.preview.calculated.totals.net) * 100)
      const excess = Math.max(0, economic - Math.min(economic, available.sale?.ar?.balanceCents ?? 0))
      const destination = !excess ? { kind: "NONE" } : settlement === "CUSTOMER_CREDIT" ? { kind: settlement } : { kind: settlement, method, treasuryAccountId: treasuryId }
      if (destination.kind === "REFUND" && !treasuryId) throw new Error("Selecciona la cuenta del reembolso")
      const result = await submitControlledDocument(saved.mode === "physical" ? "fiscalCredit" : "fiscalFinancialCredit", { adjustmentId: saved.draftId, expectedRevision: saved.revision, expectedPolicyVersion: saved.command.expectedPolicyVersion, settlement: destination }, actor)
      // Una respuesta perdida puede ocultar un commit; no afirmar que aún no existe numeración.
      if (!result || result.pending) { setMessage(result?.error ?? "Resultado pendiente de sincronización. Consulta el estado antes de volver a registrar la nota."); return }
      if (!result.result.documentId) throw new Error("Consulta el historial antes de registrar otra nota")
      persist(null); router.push(`/invoices/fiscal/${result.result.documentId}`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function synchronize() {
    if (!saved?.draftId) return
    setBusy(true); setError("")
    try {
      await syncCashOutbox()
      const current = await request(`/api/credit-notes/${encodeURIComponent(saved.draftId)}`)
      if (current.state === "PREPARADO_PENDIENTE_CONEXION") { persist(null); router.push(`/invoices/fiscal/${current.fiscalDocumentId}`); return }
      setMessage("La nota sigue reservada; revisa los pendientes de caja.")
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const estimatedCents = Math.round(Number(preview?.calculated.totals.net ?? "0") * 100)
  const remaining = Math.max(0, estimatedCents - Math.min(estimatedCents, available?.sale?.ar?.balanceCents ?? 0))

  if (!available) return <p role="status">{error || "Cargando factura fiscal…"}</p>
  return <section className="grid gap-4 rounded border p-4">
    <div><h2 className="text-xl font-semibold">Nota de crédito E34 · {available.sale?.invoiceCode}</h2><p>Documento de prueba / No emitido fiscalmente</p><p>Copia original: {available.originalType ?? "—"} · {available.eNcf ?? "—"} · {available.issueDate ?? "—"} · Bruto: {formatRD(Math.round(Number(available.originalTotals?.gross ?? "0") * 100))}</p><p>Comprador: {available.buyer?.name ?? "Consumidor general"} · Deuda pendiente: {formatRD(available.sale?.ar?.balanceCents ?? 0)}</p></div>
    {/* La impresión permite al preparador consultar sus propias notas sin abrir toda la bandeja fiscal. */}
    {!!available.notes?.length && <div><h3 className="font-semibold">Notas anteriores</h3><ul className="list-inside list-disc">{available.notes.map(note => <li key={note.id}>{note.fiscalDocumentId ? <Link className="underline" href={`/invoices/fiscal/${note.fiscalDocumentId}`}>Ver nota</Link> : "Borrador"} · {note.state} · revisión {note.revision} · {formatRD(Math.round(Number(note.snapshot?.totals?.gross ?? "0") * 100))}</li>)}</ul></div>}
    {(!saved || editing) && <>
      {saved?.pendingUpdate && <p>Hay un cambio pendiente de recuperar; reintenta el guardado con los mismos datos.</p>}
      <fieldset disabled={!!saved?.pendingUpdate} className="grid gap-3">
      <label>Tipo de ajuste <select className={inputClass} value={mode} onChange={e => { setMode(e.target.value as "physical" | "financial"); setPreview(null) }}><option value="physical">Devolución física</option><option value="financial">Reducción financiera</option></select></label>
      <label>Motivo fiscal <select className={inputClass} value={modificationCode} onChange={e => { setModificationCode(e.target.value); if (e.target.value === "2") setMode("financial"); setPreview(null) }}><option value="3">Reducción parcial</option><option value="1">Cancelación del importe restante</option><option value="2">Corrección de texto</option></select></label>
      <label>Motivo <input className={inputClass} value={reason} onChange={e => { setReason(e.target.value); setPreview(null) }} /></label>
      {modificationCode === "2" && <label>Texto corregido <input className={inputClass} value={correction} onChange={e => { setCorrection(e.target.value); setPreview(null) }} /></label>}
      <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Concepto</th><th>Disponible</th><th>Importe restante</th><th>Cantidad</th><th>Descuento adicional (DOP)</th></tr></thead><tbody>{available.lines.map(line => <tr key={line.originalLine} className="border-t"><td>{line.snapshot.description}</td><td>{line.availability.availableQuantity}</td><td>{formatRD(line.availability.availableCents)}</td><td><input aria-label={`Cantidad ${line.snapshot.description}`} className={inputClass} value={quantities[line.originalLine] ?? ""} onChange={e => { setQuantities({ ...quantities, [line.originalLine]: e.target.value }); setPreview(null) }} /></td><td><input aria-label={`Descuento ${line.snapshot.description}`} className={inputClass} value={discounts[line.originalLine] ?? ""} onChange={e => { setDiscounts({ ...discounts, [line.originalLine]: e.target.value }); setPreview(null) }} /></td></tr>)}</tbody></table></div>
      <button className="rounded border p-2" disabled={busy} onClick={() => void review()}>Previsualizar</button>
      </fieldset>
      {editing && <button className="rounded border p-2" disabled={busy || (!preview && !saved?.pendingUpdate)} onClick={() => void saveEdit()}>{saved?.pendingUpdate ? "Recuperar guardado" : "Guardar cambios"}</button>}
    </>}
    {preview && <div className="rounded border p-3"><p>Importe fiscal: {formatRD(Math.round(Number(preview.calculated.totals.gross) * 100))}</p><p>Importe económico: {formatRD(estimatedCents)}</p><p>ITBIS no reembolsable: {formatRD(Math.round(Number(preview.calculated.totals.taxNotCreditable) * 100))}</p>{preview.calculated.lines?.map((line, index) => <p className="text-sm" key={`${index}-${line.description}`}>{line.description}: {formatRD(Math.round(Number(line.gross) * 100))} · Descuento total aplicado: {formatRD(Math.round(Number(line.discount ?? "0") * 100))}</p>)}{preview.calculated.warnings.map(warning => <p key={warning} className="text-sm">{warning}</p>)}</div>}
    {!editing && saved?.reserved && remaining > 0 && <div className="grid gap-2"><p>Excedente: {formatRD(remaining)}</p><label>Destino <select className={inputClass} value={settlement} onChange={e => setSettlement(e.target.value as "REFUND" | "CUSTOMER_CREDIT")}><option value="REFUND">Reembolso</option><option value="CUSTOMER_CREDIT">Saldo a favor</option></select></label>{settlement === "REFUND" && <><label>Método <select className={inputClass} value={method} onChange={e => setMethod(e.target.value)}><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option><option value="TARJETA">Tarjeta</option><option value="OTRO">Otro</option></select></label><label>Cuenta <select className={inputClass} value={treasuryId} onChange={e => setTreasuryId(e.target.value)}><option value="">Seleccionar</option>{treasuryAccounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label></>}</div>}
    {error && <p role="alert" className="text-red-600">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="flex flex-wrap gap-2">{!editing && !saved?.reserved && <button className="rounded border p-2" disabled={busy || (!saved && !preview)} onClick={() => void reserve()}>{saved ? "Reanudar reserva" : "Validar y reservar"}</button>}{!editing && saved?.reserved && <><button className="rounded border p-2" disabled={busy} onClick={() => void confirm()}>Confirmar nota</button><button className="rounded border p-2" disabled={busy} onClick={() => void synchronize()}>Consultar y sincronizar</button></>}{!editing && saved?.draftId && <button className="rounded border p-2" disabled={busy} onClick={() => void beginEdit()}>Editar nota</button>}{!editing && saved && <button className="rounded border p-2" disabled={busy} onClick={() => void discard()}>Descartar borrador</button>}{onClose && <button className="rounded border p-2" disabled={busy} onClick={onClose}>Cambiar venta</button>}<Link className="rounded border p-2" href="/fiscal/documents">Bandeja fiscal</Link></div>
  </section>
}
