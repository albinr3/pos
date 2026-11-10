"use client"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Sequence = { id: string; type: string; environment: string; rangeStart: string; rangeEnd: string; lastNumber: string; remaining: string; expiresOn: string | null; active: boolean; readyForRollover: boolean; authorizationRef: string | null; notes: string | null; version: number; expired: boolean; exhausted: boolean; lowRemaining: boolean; expiringSoon: boolean; usable: boolean }
type Form = { type: string; rangeStart: string; rangeEnd: string; expiresOn: string; active: boolean; readyForRollover: boolean; authorizationRef: string; notes: string; reason: string }
type Event = { id: string; action: string; reason: string; actorUserId: string; createdAt: string; details: unknown }
const types = [
  { code: "E31", name: "Crédito fiscal" },
  { code: "E32", name: "Consumo" },
  { code: "E33", name: "Nota de débito" },
  { code: "E34", name: "Nota de crédito" },
  { code: "E41", name: "Compras" },
  { code: "E43", name: "Gastos menores" },
  { code: "E44", name: "Regímenes especiales" },
  { code: "E45", name: "Gubernamental" },
  { code: "E46", name: "Exportaciones" },
  { code: "E47", name: "Pagos al exterior" },
]
const initial: Form = { type: "E31", rangeStart: "", rangeEnd: "", expiresOn: "", active: false, readyForRollover: false, authorizationRef: "", notes: "", reason: "" }
const inputClass = "h-10 w-full"
const actionLabels: Record<string, string> = { CREATED: "Rango registrado", UPDATED: "Rango actualizado", ALLOCATED: "Número asignado", VOIDED: "Número inutilizado", EXHAUSTED: "Rango agotado", ROLLOVER: "Cambio automático de rango" }
function displayDate(date: string | null) {
  if (!date) return "No aplica"
  const [year, month, day] = date.split("-")
  return `${day}/${month}/${year}`
}
function historyDetails(item: Event): string[] {
  if (!item.details || typeof item.details !== "object") return []
  const details = item.details as Record<string, unknown>
  if (item.action === "ROLLOVER" || item.action === "EXHAUSTED") return [`Número: ${details.eNcf}`, `Rango anterior: ${details.previousRangeStart} al ${details.previousRangeEnd}`, details.nextSequenceId ? `Rango siguiente: ${details.nextRangeStart} al ${details.nextRangeEnd}` : "Sin rango de relevo disponible"]
  if (typeof details.eNcf === "string") return [`Número: ${details.eNcf}`]
  if (item.action !== "UPDATED" || !details.before || !details.after || typeof details.before !== "object" || typeof details.after !== "object") return []
  const before = details.before as Record<string, unknown>, after = details.after as Record<string, unknown>
  const fields: Array<[string, string]> = [["active", "Estado"], ["readyForRollover", "Preparado para relevo"], ["expiresOn", "Vencimiento"], ["authorizationRef", "Referencia"], ["notes", "Observaciones"]]
  const format = (field: string, value: unknown) => field === "active" ? value ? "Activo" : "Inactivo" : field === "readyForRollover" ? value ? "Sí" : "No" : field === "expiresOn" && typeof value === "string" ? displayDate(value) : typeof value === "string" && value ? value : "Sin dato"
  return fields.filter(([field]) => before[field] !== after[field]).map(([field, label]) => `${label}: ${format(field, before[field])} → ${format(field, after[field])}`)
}
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init }), data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || "No se pudo completar la operación")
  return data
}
export function FiscalSequences() {
  const [items, setItems] = useState<Sequence[]>([]), [cursor, setCursor] = useState<string | null>(null)
  const [edit, setEdit] = useState<Sequence | null>(null), [form, setForm] = useState<Form>(initial)
  const [history, setHistory] = useState<Event[] | null>(null), [historyCursor, setHistoryCursor] = useState<string | null>(null), [historyId, setHistoryId] = useState<string | null>(null)
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false), [showForm, setShowForm] = useState(false)
  const load = useCallback(async (next?: string) => {
    try { const result = await request(`/api/fiscal/sequences?take=50${next ? `&cursor=${encodeURIComponent(next)}` : ""}`); setItems(old => next ? [...old, ...result.data] : result.data); setCursor(result.nextCursor); setLoadError(false) } catch (error) { setLoadError(true); setMessage(error instanceof Error ? error.message : "No se pudo cargar") } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  function startEdit(row: Sequence) { setEdit(row); setForm({ type: row.type, rangeStart: row.rangeStart, rangeEnd: row.rangeEnd, expiresOn: row.expiresOn ?? "", active: row.active, readyForRollover: row.readyForRollover, authorizationRef: row.authorizationRef ?? "", notes: row.notes ?? "", reason: "" }); setShowForm(true); setMessage("") }
  function reset() { setEdit(null); setForm(initial); setShowForm(false) }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("")
    const shared = { expiresOn: ["E32", "E34"].includes(form.type) ? null : form.expiresOn, active: form.active, readyForRollover: form.readyForRollover, authorizationRef: form.authorizationRef || null, notes: form.notes || null, reason: form.reason }
    const payload = edit ? { ...shared, expectedVersion: edit.version } : { ...shared, type: form.type, environment: "TEST", rangeStart: form.rangeStart, rangeEnd: form.rangeEnd }
    try { await request(edit ? `/api/fiscal/sequences/${encodeURIComponent(edit.id)}` : "/api/fiscal/sequences", { method: edit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); reset(); await load(); setMessage("Secuencia de prueba guardada.") }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar") } finally { setBusy(false) }
  }
  async function showHistory(id: string, next?: string) {
    try { const result = await request(`/api/fiscal/sequences/${encodeURIComponent(id)}/history?take=50${next ? `&cursor=${encodeURIComponent(next)}` : ""}`); setHistory(old => next ? [...(old ?? []), ...result.data] : result.data); setHistoryCursor(result.nextCursor); setHistoryId(id) } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cargar el historial") }
  }
  return <section className="mt-6 space-y-5 border-t pt-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Secuencias fiscales autorizadas</h3>
        <p className="max-w-2xl text-sm text-muted-foreground">Administra los rangos y consulta los números disponibles para cada tipo de comprobante.</p>
      </div>
      {!showForm && <Button type="button" onClick={() => { reset(); setMessage(""); setShowForm(true) }}>Añadir secuencia</Button>}
    </div>

    <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <p className="font-medium">Numeración de prueba · Pendiente de conexión</p>
      <p className="mt-1 text-muted-foreground">Los rangos registrados aquí no acreditan autorización de la DGII.</p>
    </div>

    {message && <p role="status" className="rounded-md border bg-muted/30 px-4 py-3 text-sm">{message}</p>}

    {showForm && <form onSubmit={save} className="space-y-5 rounded-lg border bg-card p-4 sm:p-5">
      <div>
        <h4 className="font-semibold">{edit ? "Editar secuencia" : "Nueva secuencia de prueba"}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{edit ? "Actualiza el estado o los datos de referencia. El tipo y el rango no se pueden cambiar." : "Introduce los límites del rango y los datos de autorización."}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">Tipo de comprobante
          {/* El nombre facilita la elección; el valor debe seguir siendo el código que recibe la API. */}
          <select className={`${inputClass} rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50`} disabled={!!edit} value={form.type} onChange={e => setForm({ ...form, type: e.target.value, expiresOn: "" })}>{types.map(type => <option key={type.code} value={type.code}>{type.code} — {type.name}</option>)}</select>
        </label>
        {!["E32", "E34"].includes(form.type) && <label className="grid gap-1.5 text-sm font-medium">Fecha de vencimiento<Input className={inputClass} type="date" required value={form.expiresOn} onChange={e => setForm({ ...form, expiresOn: e.target.value })}/></label>}
        {(["rangeStart", "rangeEnd"] as const).map((field, index) => <label className="grid gap-1.5 text-sm font-medium" key={field}>{index ? "Número final" : "Número inicial"}<Input className={inputClass} disabled={!!edit} required inputMode="numeric" pattern="[0-9]{1,10}" placeholder={index ? "Ej.: 100" : "Ej.: 1"} value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })}/></label>)}
        <label className="grid gap-1.5 text-sm font-medium">Referencia de autorización <span className="font-normal text-muted-foreground">Opcional</span><Input className={inputClass} maxLength={500} value={form.authorizationRef} onChange={e => setForm({ ...form, authorizationRef: e.target.value })}/></label>
        <label className="grid gap-1.5 text-sm font-medium">Observaciones <span className="font-normal text-muted-foreground">Opcional</span><Input className={inputClass} maxLength={500} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></label>
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Motivo del cambio<Input className={inputClass} required maxLength={500} placeholder="Ej.: registro inicial" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}/></label>
      </div>
      <label className="flex items-start gap-3 rounded-md border p-3 text-sm"><input className="mt-0.5 h-4 w-4 accent-primary" type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked, readyForRollover: e.target.checked ? false : form.readyForRollover })}/><span><span className="block font-medium">Rango activo</span><span className="mt-0.5 block text-muted-foreground">Solo puede haber un rango activo para cada tipo de comprobante.</span></span></label>
      {!form.active && <label className="flex items-start gap-3 rounded-md border p-3 text-sm"><input className="mt-0.5 h-4 w-4 accent-primary" type="checkbox" checked={form.readyForRollover} onChange={e => setForm({ ...form, readyForRollover: e.target.checked })}/><span><span className="block font-medium">Preparar como siguiente rango</span><span className="mt-0.5 block text-muted-foreground">Se activará automáticamente al agotarse el rango activo del mismo tipo. Se usa primero el rango con el número inicial más bajo.</span></span></label>}
      <div className="flex flex-wrap gap-2 border-t pt-4"><Button type="submit" disabled={busy}>{busy ? "Guardando…" : edit ? "Guardar cambios" : "Guardar secuencia"}</Button><Button type="button" variant="outline" onClick={reset} disabled={busy}>Cancelar</Button></div>
    </form>}

    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Rangos registrados</h4><p className="text-sm text-muted-foreground">Ordenados por tipo y número inicial; los preparados se utilizan en ese orden.</p>
      {loading ? <p role="status" className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Cargando secuencias…</p> : loadError && items.length === 0 ? <Button type="button" variant="outline" onClick={() => { setMessage(""); setLoading(true); void load() }}>Reintentar carga</Button> : items.length === 0 ? <div className="rounded-lg border border-dashed px-5 py-8 text-center"><p className="text-sm font-medium">Todavía no hay secuencias registradas</p><p className="mt-1 text-sm text-muted-foreground">Añade un rango de prueba para consultar su disponibilidad.</p></div> : items.map(row => <article key={row.id} className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex flex-wrap items-center gap-2"><h5 className="text-base font-semibold">{row.type}</h5><span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${row.active ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{row.active ? "Activo" : row.readyForRollover ? "Preparado para relevo" : "Inactivo"}</span></div><p className="mt-1 text-sm text-muted-foreground">Rango {row.rangeStart} al {row.rangeEnd}</p></div>
          <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => startEdit(row)}>Editar</Button><Button type="button" variant="outline" size="sm" onClick={() => void showHistory(row.id)}>Historial</Button></div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Disponibles</dt><dd className="mt-1 font-semibold tabular-nums">{row.remaining}</dd></div><div><dt className="text-muted-foreground">Último asignado</dt><dd className="mt-1 font-medium tabular-nums">{row.lastNumber}</dd></div><div><dt className="text-muted-foreground">Vencimiento</dt><dd className="mt-1 font-medium">{displayDate(row.expiresOn)}</dd></div></dl>
        {(row.expired || row.exhausted || row.expiringSoon || row.lowRemaining) && <p role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{[row.expired && "Rango vencido", row.exhausted && "Rango agotado", row.expiringSoon && "Próximo a vencer", row.lowRemaining && !row.exhausted && "Pocos números disponibles"].filter(Boolean).join(" · ")}</p>}
        {row.active && (row.lowRemaining || row.exhausted) && <p className="mt-2 text-sm text-muted-foreground">Verifica que exista otro rango vigente preparado para relevo.</p>}
        {(row.authorizationRef || row.notes) && <div className="mt-4 space-y-1 border-t pt-3 text-sm text-muted-foreground">{row.authorizationRef && <p><span className="font-medium text-foreground">Referencia:</span> {row.authorizationRef}</p>}{row.notes && <p><span className="font-medium text-foreground">Observaciones:</span> {row.notes}</p>}</div>}
      </article>)}
      {cursor && <Button type="button" variant="outline" onClick={() => void load(cursor)}>Cargar más rangos</Button>}
    </div>

    {history && <div className="rounded-lg border bg-card p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><h4 className="font-semibold">Historial de la secuencia</h4><p className="mt-1 text-sm text-muted-foreground">Cambios y asignaciones registrados.</p></div><Button type="button" variant="ghost" size="sm" onClick={() => setHistory(null)}>Cerrar</Button></div>{history.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No hay movimientos registrados.</p> : <ol className="mt-4 divide-y">{history.map(item => <li key={item.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{actionLabels[item.action] ?? item.action}</p><time className="text-muted-foreground" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("es-DO")}</time></div><p className="mt-1 text-muted-foreground">{item.reason}</p>{historyDetails(item).map(detail => <p key={detail} className="mt-1 break-words text-muted-foreground">{detail}</p>)}<p className="mt-1 break-all text-xs text-muted-foreground">Usuario: {item.actorUserId}</p></li>)}</ol>}{historyCursor && historyId && <Button type="button" variant="outline" size="sm" onClick={() => void showHistory(historyId, historyCursor)}>Cargar más movimientos</Button>}</div>}
  </section>
}
