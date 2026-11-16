"use client"

import { useRef, useState } from "react"
import { FISCAL_COUNTRIES } from "@/lib/fiscal/core/countries"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { customerFiscalFields, supplierFiscalFields, productFiscalFields, parsePreferredReceiptTypes, encodePreferredReceiptTypes, FISCAL_MASTER_CATALOG } from "@/lib/fiscal/core/master-data"

const labels: Record<string, string> = {
  fiscalIdentificationType: "Tipo de identificación", fiscalIdentificationCountry: "País de identificación",
  fiscalIdentification: "Número de identificación fiscal (RNC)", fiscalLegalName: "Razón social",
  fiscalEmail: "Correo fiscal", fiscalAddress: "Dirección fiscal", fiscalPreferredReceiptType: "Comprobantes preferidos",
  fiscalResidence: "Residencia fiscal", fiscalDeclaredCondition: "Condición declarada",
  fiscalItemType: "Clasificación fiscal", fiscalUnit: "Unidad fiscal", fiscalTaxTreatment: "Tratamiento tributario",
}
const hints: Record<string, string> = {
  fiscalIdentificationType: "Indica el documento usado, por ejemplo RNC, cédula o identificación extranjera.",
  fiscalIdentificationCountry: "Selecciona el país que emitió la identificación. En fichas nuevas se usa el país fiscal de tu empresa por defecto.",
  fiscalIdentification: "Escribe el número tal como figura en el documento, incluidas letras si corresponde.",
  fiscalLegalName: "Nombre o razón social que aparece en los datos fiscales.",
  fiscalEmail: "Correo destinado a recibir comunicaciones o documentos fiscales.",
  fiscalAddress: "Dirección que figura en los datos fiscales; puede ser distinta de la dirección comercial.",
  fiscalPreferredReceiptType: "Selecciona los tipos que prefiere el cliente. Se validarán al preparar la venta.",
  fiscalResidence: "Selecciona el país de residencia fiscal declarado por el proveedor.",
  fiscalDeclaredCondition: "Condición fiscal indicada por el proveedor; no se determina automáticamente por su identificación.",
  fiscalItemType: "Indica si corresponde a un producto o a un servicio para fines fiscales.",
  fiscalUnit: "Unidad con la que se describirá el producto o servicio en el documento fiscal. Es opcional en el e-CF.",
  fiscalTaxTreatment: "Indica el tratamiento fiscal aplicable. Tasa cero y exento son opciones distintas.",
}
const placeholders: Record<string, string> = {
  fiscalIdentificationType: "Ej.: RNC, cédula o pasaporte",
  fiscalIdentification: "Ej.: 123456789",
  fiscalLegalName: "Ej.: Comercial Ejemplo, SRL",
  fiscalEmail: "Ej.: facturacion@ejemplo.com",
  fiscalAddress: "Ej.: Av. Principal 123, Santo Domingo",
  fiscalDeclaredCondition: "Ej.: contribuyente registrado",
  fiscalUnit: "Ej.: unidad, hora o kilogramo",
}
const options: Record<string, readonly { code: string; name: string }[]> = {
  fiscalIdentificationType: FISCAL_MASTER_CATALOG.identificationTypes,
  fiscalDeclaredCondition: FISCAL_MASTER_CATALOG.declaredConditions,
  fiscalItemType: FISCAL_MASTER_CATALOG.itemTypes,
  fiscalTaxTreatment: FISCAL_MASTER_CATALOG.taxTreatments,
}
function fieldRequirement(kind: "customer" | "supplier" | "product", key: string, doProfile = false) {
  if (kind === "customer" && key === "fiscalPreferredReceiptType" && doProfile) return "obligatorio"
  if (kind === "product" && (key === "fiscalItemType" || key === "fiscalTaxTreatment")) return "necesario para facturación electrónica"
  if (kind !== "product" && ["fiscalIdentification", "fiscalLegalName"].includes(key)) return "puede ser necesario según el comprobante"
  if (kind === "supplier" && ["fiscalIdentificationType", "fiscalIdentificationCountry", "fiscalResidence", "fiscalDeclaredCondition"].includes(key)) return "puede ser necesario según la operación"
  return "opcional al guardar"
}
export function FiscalMasterFields({ kind, value, onChange, doProfile = false, onLookupStart, hideCustomerFiscalContact = false, hideProductTaxTreatment = false }: { kind: "customer" | "supplier" | "product"; value: Record<string, string | null>; onChange: (value: Record<string, string | null>) => void; doProfile?: boolean; onLookupStart?: () => (legalName: string) => void; hideCustomerFiscalContact?: boolean; hideProductTaxTreatment?: boolean }) {
  const fields = kind === "customer" ? customerFiscalFields : kind === "supplier" ? supplierFiscalFields : productFiscalFields
  const latest = useRef(value)
  latest.current = value
  const request = useRef(0)
  const pending = useRef("")
  const [lookupStatus, setLookupStatus] = useState<{ message: string; tone: "pending" | "success" | "error" }>({ message: "", tone: "pending" })
  const setLookupMessage = (message: string, tone: "pending" | "success" | "error" = "error") => setLookupStatus({ message, tone })
  async function lookupIdentification() {
    // Leer el valor más reciente también cuando se pega y se sale antes del siguiente render.
    const current = latest.current
    const identification = current.fiscalIdentification ?? ""
    if (kind !== "customer" || !identification.trim()) return
    // Explicar por qué no se consulta: un retorno silencioso parecía una búsqueda fallida.
    if (!doProfile) { setLookupMessage("La consulta requiere el perfil fiscal dominicano activo."); return }
    if (current.fiscalIdentificationCountry !== "DO") { setLookupMessage("Selecciona República Dominicana como país de identificación para consultar el padrón."); return }
    if (!/^[\d\s-]+$/.test(identification) || !/^(?:\d{9}|\d{11})$/.test(identification.replace(/[\s-]/g, ""))) { setLookupMessage("Escribe un RNC de 9 dígitos o una cédula de 11 dígitos."); return }
    if (pending.current === identification) return
    const sequence = ++request.current
    const previousName = current.fiscalLegalName
    const applyCustomerName = onLookupStart?.()
    pending.current = identification
    setLookupMessage("Consultando razón social…", "pending")
    try {
      const response = await fetch(`/api/fiscal/taxpayer?identification=${encodeURIComponent(identification)}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message || "No se pudo consultar el padrón")
      // No aplicar una respuesta si el usuario cambió la identificación o editó la razón social mientras esperaba.
      if (sequence !== request.current || latest.current.fiscalIdentification !== identification || latest.current.fiscalLegalName !== previousName || latest.current.fiscalIdentificationCountry !== "DO") return
      if (data.legalName) { onChange({ ...latest.current, fiscalLegalName: data.legalName }); applyCustomerName?.(data.legalName); setLookupMessage("Razón social encontrada en el padrón.", "success") }
      else setLookupMessage("No se encontró la identificación; puedes escribir la razón social.")
    } catch (error) {
      if (sequence === request.current && latest.current.fiscalIdentification === identification) setLookupMessage(error instanceof Error ? error.message : "No se pudo consultar el padrón")
    } finally { if (sequence === request.current) pending.current = "" }
  }
  return <fieldset className="grid gap-3 rounded-md border p-3"><legend className="px-1 font-medium">Datos fiscales</legend>
    {kind !== "customer" && <p className="text-xs text-muted-foreground">Puedes guardar la ficha sin completar estos datos. Al preparar un comprobante electrónico, algunos serán necesarios según la operación.</p>}
    {fields.filter(key => !(kind === "customer" && hideCustomerFiscalContact && (key === "fiscalEmail" || key === "fiscalAddress")) && !(kind === "product" && (key === "fiscalUnit" || (hideProductTaxTreatment && key === "fiscalTaxTreatment")))).map((key) => <div className="grid gap-1" key={key}><Label htmlFor={`fiscal-${key}`}>{labels[key]} {(kind !== "customer" || ["opcional al guardar", "obligatorio"].includes(fieldRequirement(kind, key, doProfile))) && <span className="font-normal text-muted-foreground">({fieldRequirement(kind, key, doProfile)})</span>}</Label>
      {key === "fiscalPreferredReceiptType" ? (() => {
        const selected = parsePreferredReceiptTypes(value[key])
        const receiptOptions: [string, string][] = doProfile ? FISCAL_MASTER_CATALOG.receiptTypes.map(option => [option.code, `${option.code} — ${option.name}`]) : []
        // Mostrar selecciones históricas sin inventar opciones para un perfil distinto.
        const entries = [...receiptOptions, ...selected.filter(type => !receiptOptions.some(([code]) => code === type)).map(type => [type, type] as [string, string])]
        return <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button id={`fiscal-${key}`} type="button" aria-describedby={kind === "customer" ? undefined : `fiscal-${key}-hint`} className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm">
              <span>{selected.length ? selected.join(", ") : "Selecciona uno o varios comprobantes"}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
            {entries.map(([code, label]) => <DropdownMenuCheckboxItem key={code} checked={selected.includes(code)}
              onSelect={e => e.preventDefault()}
              onCheckedChange={checked => onChange({ ...value, [key]: encodePreferredReceiptTypes(checked ? [...selected, code] : selected.filter(type => type !== code)) })}>
              {label}
            </DropdownMenuCheckboxItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      })() : key === "fiscalIdentificationCountry" || key === "fiscalResidence" ? <select id={`fiscal-${key}`} aria-describedby={kind === "customer" ? undefined : `fiscal-${key}-hint`} className="h-10 rounded-md border bg-background px-3" value={value[key] ?? ""} onChange={e => { if (key === "fiscalIdentificationCountry") { request.current++; pending.current = ""; setLookupMessage("") } onChange({ ...value, [key]: e.target.value || null }) }}>
        <option value="">Sin especificar</option>
        {/* Conserva valores anteriores introducidos como texto hasta que el usuario elija otro país. */}
        {value[key] && !FISCAL_COUNTRIES.some(country => country.code === value[key]) && <option value={value[key] ?? ""}>{value[key]}</option>}
        {FISCAL_COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
      </select> : options[key] ? <select id={`fiscal-${key}`} aria-describedby={kind === "customer" ? undefined : `fiscal-${key}-hint`} className="h-10 rounded-md border bg-background px-3" value={value[key] ?? ""} onChange={e => onChange({ ...value, [key]: e.target.value || null })}>
        <option value="">Sin especificar</option>
        {value[key] && !options[key].some(option => option.code === value[key]) && <option value={value[key] ?? ""}>{value[key]}</option>}
        {options[key].map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
      </select> : <Input id={`fiscal-${key}`} placeholder={placeholders[key]} aria-describedby={kind === "customer" ? undefined : `fiscal-${key}-hint`} value={value[key] ?? ""} maxLength={200} onChange={e => { if (key === "fiscalIdentification" || key === "fiscalLegalName") { request.current++; pending.current = ""; setLookupMessage("") } const next = { ...latest.current, [key]: e.target.value || null }; latest.current = next; onChange(next) }} onBlur={key === "fiscalIdentification" ? () => { void lookupIdentification() } : undefined} onKeyDown={key === "fiscalIdentification" ? e => { if (e.key === "Enter") { e.preventDefault(); void lookupIdentification() } } : undefined} />}
      {key === "fiscalIdentification" && lookupStatus.message && <p role="status" className={`text-xs ${lookupStatus.tone === "success" ? "text-green-700 dark:text-green-300" : lookupStatus.tone === "error" ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>{lookupStatus.message}</p>}
      {kind !== "customer" && <p id={`fiscal-${key}-hint`} className="text-xs text-muted-foreground">{hints[key]}</p>}
      {key === "fiscalTaxTreatment" && <div className="grid gap-1 text-xs text-muted-foreground">
        <p><strong>Gravado:</strong> se aplica la tasa de impuesto que corresponda.</p>
        <p><strong>Tasa cero:</strong> está sujeto al impuesto con una tasa de 0 %.</p>
        <p><strong>Exento:</strong> no se cobra el impuesto por una exención aplicable.</p>
        <p><strong>No facturable:</strong> se identifica como un concepto que no corresponde facturar.</p>
        <p>La clasificación aplicable depende de la operación y sus reglas fiscales.</p>
      </div>}
    </div>)}
  </fieldset>
}
