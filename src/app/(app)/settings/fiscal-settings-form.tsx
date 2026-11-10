"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type Settings = { enabled: boolean; version: number; jurisdiction: string | null; regime: string | null; environment: "TEST"; legalName: string | null; taxId: string | null; fiscalAddress: string | null; fiscalEmail: string | null; fiscalPhone: string | null; configurationStatus: string; missingFields: string[]; effectiveFrom: string | null }
const labels = { legalName: "Razón social", taxId: "Identificación fiscal (RNC o cédula)", fiscalAddress: "Dirección fiscal", fiscalEmail: "Correo fiscal", fiscalPhone: "Teléfono fiscal" } as const
const placeholders: Record<keyof typeof labels, string> = {
  legalName: "Ej.: Comercial Ejemplo, SRL",
  taxId: "Ej.: 123456789",
  fiscalAddress: "Ej.: Av. Principal 123, Santo Domingo",
  fiscalEmail: "Ej.: facturacion@ejemplo.com",
  fiscalPhone: "Ej.: 809-555-0123",
}
export function FiscalSettingsForm() {
  const router = useRouter()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  async function load() {
    try { const response = await fetch("/api/fiscal/settings", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message); setSettings(data) }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cargar la configuración") }
  }
  useEffect(() => { void load() }, [])
  async function save(enabled?: boolean) {
    if (!settings) return
    setSaving(true); setMessage("")
    try {
      const { version, jurisdiction, regime, environment, legalName, taxId, fiscalAddress, fiscalEmail, fiscalPhone } = settings
      const response = await fetch("/api/fiscal/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: version, jurisdiction, regime, environment, legalName, taxId, fiscalAddress, fiscalEmail, fiscalPhone, ...(enabled === undefined ? {} : { enabled }) }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message)
      setSettings(data); setMessage(enabled === true ? "Configuración activada en ambiente de prueba." : enabled === false ? "Configuración desactivada." : "Configuración guardada."); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar") } finally { setSaving(false) }
  }
  if (!settings) return <p role="status" className="text-sm">{message || "Cargando configuración fiscal…"}</p>
  return <form onSubmit={event => { event.preventDefault(); void save(settings.enabled ? undefined : true) }} className="mt-4 grid gap-4 max-w-2xl">
    <p className="text-xs text-muted-foreground">Puedes guardar una configuración incompleta. Para que MOVOPos la considere completa para República Dominicana, selecciona el perfil y completa los campos indicados.</p>
    <label className="grid gap-1 text-sm">País y perfil <span className="text-muted-foreground">(necesario para completar la configuración)</span>
      <select className="rounded border bg-background p-2" value={settings.regime ?? ""} onChange={e => setSettings({ ...settings, jurisdiction: e.target.value ? "DO" : null, regime: e.target.value || null })}>
        <option value="">Sin perfil</option><option value="DO_ECF">República Dominicana — DO_ECF</option>
      </select>
    </label>
    <p className="text-sm">Ambiente: pruebas. Módulo: {settings.enabled ? "activo" : "inactivo"}. Configuración: {settings.configurationStatus === "VALIDATED" ? "validada localmente" : "incompleta"}.</p>
    {settings.missingFields.length > 0 && <p className="text-sm">Falta completar: {settings.missingFields.map(f => labels[f as keyof typeof labels] ?? "perfil").join(", ")}.</p>}
    <p className="text-sm">Fecha de aplicación: {settings.effectiveFrom ? new Date(settings.effectiveFrom).toLocaleString("es-DO") : "Sin configuración guardada"}.</p>
    {(Object.keys(labels) as Array<keyof typeof labels>).map(field => <label key={field} className="grid gap-1 text-sm">{labels[field]} <span className="text-muted-foreground">{field === "fiscalPhone" ? "(opcional)" : "(necesario para completar la configuración DO)"}</span>
      <input className="rounded border bg-background p-2" placeholder={placeholders[field]} type={field === "fiscalEmail" ? "email" : "text"} maxLength={255} value={settings[field] ?? ""} onChange={e => setSettings({ ...settings, [field]: e.target.value })} />
    </label>)}
    <p className="text-sm text-muted-foreground">Sin conexión al servicio fiscal. Mientras el módulo esté activo, ventas, compras, cobros y otras operaciones protegidas pueden quedar bloqueadas; los pendientes offline se conservan para revisión.</p>
    <div className="flex flex-wrap gap-2">
      <button className="w-fit rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={saving} type="submit">{saving ? "Guardando…" : settings.enabled ? "Guardar configuración fiscal" : "Guardar y activar"}</button>
      {settings.enabled ? <button className="rounded border px-4 py-2 text-sm disabled:opacity-50" disabled={saving} type="button" onClick={() => void save(false)}>Desactivar módulo</button> : <button className="rounded border px-4 py-2 text-sm disabled:opacity-50" disabled={saving} type="button" onClick={() => void save()}>Guardar sin activar</button>}
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>
}
