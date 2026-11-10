"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"
import { FISCAL_MASTER_CATALOG } from "@/lib/fiscal/core/master-data"
import { listFiscalConcepts, saveFiscalConcept, deactivateFiscalConcept } from "./fiscal-concepts-actions"

type Concept = Awaited<ReturnType<typeof listFiscalConcepts>>[number]
export function FiscalConcepts() {
  const [items, setItems] = useState<Concept[]>([])
  const [available, setAvailable] = useState(false)
  const [id, setId] = useState<string | undefined>()
  const [name, setName] = useState("")
  const [kind, setKind] = useState("SERVICIO")
  const [unit, setUnit] = useState("")
  const [tax, setTax] = useState("")
  async function refresh() { setItems(await listFiscalConcepts()); setAvailable(true) }
  useEffect(() => {
    let mounted = true
    // Evita actualizar el componente si la consulta termina después de desmontarlo.
    void listFiscalConcepts().then(result => {
      if (mounted) { setItems(result); setAvailable(true) }
    }).catch(() => { if (mounted) setAvailable(false) })
    return () => { mounted = false }
  }, [])
  function reset() { setId(undefined); setName(""); setKind("SERVICIO"); setUnit(""); setTax("") }
  if (!available) return null
  return <section className="rounded-lg border p-4 grid gap-3">
    <h2 className="font-semibold">Conceptos sin inventario</h2>
    <p className="text-sm text-muted-foreground">Servicios y cargos para documentos fiscales futuros; no aparecen en el POS. El nombre y el tipo son necesarios para guardar. El tratamiento tributario es necesario para preparar el comprobante; la unidad fiscal es opcional.</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <Input aria-label="Nombre del concepto" placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} />
      <select aria-label="Tipo de concepto" className="h-10 rounded-md border bg-background px-3" value={kind} onChange={e => setKind(e.target.value)}><option value="SERVICIO">Servicio</option><option value="CARGO">Cargo</option></select>
      <Input aria-label="Unidad fiscal" placeholder="Unidad fiscal (opcional)" value={unit} onChange={e => setUnit(e.target.value)} />
      <select aria-label="Tratamiento tributario" className="h-10 rounded-md border bg-background px-3" value={tax} onChange={e => setTax(e.target.value)}><option value="">Tratamiento sin especificar</option>{tax && !FISCAL_MASTER_CATALOG.taxTreatments.some(option => option.code === tax) && <option value={tax}>{tax}</option>}{FISCAL_MASTER_CATALOG.taxTreatments.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}</select>
    </div>
    <div className="flex gap-2"><Button type="button" onClick={async () => { try { await saveFiscalConcept({ id, name, kind, fiscalUnit: unit || null, fiscalTaxTreatment: tax || null }); reset(); await refresh() } catch (e) { toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar", variant: "destructive" }) } }}>{id ? "Actualizar" : "Añadir concepto"}</Button>{id && <Button type="button" variant="outline" onClick={reset}>Cancelar</Button>}</div>
    {items.map(item => <div key={item.id} className="flex items-center gap-2"><span className="flex-1">{item.name} · {item.kind === "SERVICIO" ? "Servicio" : "Cargo"}</span><Button type="button" variant="outline" onClick={() => { setId(item.id); setName(item.name); setKind(item.kind); setUnit(item.fiscalUnit ?? ""); setTax(item.fiscalTaxTreatment ?? "") }}>Editar</Button><Button type="button" variant="outline" onClick={async () => { try { await deactivateFiscalConcept(item.id); if (id === item.id) reset(); await refresh() } catch (e) { toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo desactivar", variant: "destructive" }) } }}>Desactivar</Button></div>)}
  </section>
}
