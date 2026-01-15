"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Edit, Plus, Printer, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"
import { BarcodeLabel } from "@/components/app/barcode-label"

import { deactivateProduct, listProducts, upsertProduct } from "./actions"
import { getAllSuppliers } from "../suppliers/actions"

type Product = Awaited<ReturnType<typeof listProducts>>[number]

function toInt(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function ProductsClient() {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Product[]>([])
  const [isLoading, startLoading] = useTransition()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [printingProduct, setPrintingProduct] = useState<Product | null>(null)

  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [reference, setReference] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [price, setPrice] = useState("0")
  const [cost, setCost] = useState("0")
  const [stock, setStock] = useState("0")
  const [minStock, setMinStock] = useState("0")
  const [suppliers, setSuppliers] = useState<Awaited<ReturnType<typeof getAllSuppliers>>>([])
  const [isSaving, startSaving] = useTransition()

  function refresh(q?: string) {
    startLoading(async () => {
      try {
        const r = await listProducts(q)
        setItems(r)
      } catch {
        setItems([])
      }
    })
  }

  useEffect(() => {
    refresh("")
    getAllSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
  }, [])

  useEffect(() => {
    const q = query.trim()
    const t = setTimeout(() => refresh(q), 200)
    return () => clearTimeout(t)
  }, [query])

  function resetForm(p?: Product | null) {
    const x = p ?? null
    setEditing(x)
    setName(x?.name ?? "")
    setSku(x?.sku ?? "")
    setReference(x?.reference ?? "")
    setSupplierId(x?.supplierId ?? "")
    setPrice(((x?.priceCents ?? 0) / 100).toFixed(2))
    setCost(((x?.costCents ?? 0) / 100).toFixed(2))
    setStock(String(x?.stock ?? 0))
    setMinStock(String(x?.minStock ?? 0))
  }

  const title = useMemo(() => (editing ? "Editar producto" : "Nuevo producto"), [editing])

  async function onSave() {
    startSaving(async () => {
      try {
        await upsertProduct({
          id: editing?.id,
          name,
          sku: sku || null,
          reference: reference || null,
          supplierId: supplierId || null,
          priceCents: toCents(price),
          costCents: toCents(cost),
          stock: toInt(stock),
          minStock: toInt(minStock),
        })
        toast({ title: "Guardado", description: "Producto actualizado" })
        setOpen(false)
        resetForm(null)
        refresh(query)
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
      }
    })
  }

  async function onDelete(id: string) {
    if (!confirm("¿Desactivar este producto?") ) return
    try {
      await deactivateProduct(id)
      toast({ title: "Listo", description: "Producto desactivado" })
      refresh(query)
    } catch {
      toast({ title: "Error", description: "No se pudo desactivar" })
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Productos</CardTitle>
            <div className="text-sm text-muted-foreground">Descripción, código (SKU), referencia, precio y stock.</div>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(null) }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(null); setOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px]">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>ID</Label>
                  <Input
                    value={editing ? editing.productId : "Se asignará automáticamente"}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Descripción</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Alfombra" />
                </div>

                <div className="grid gap-2">
                  <Label>Proveedor (opcional)</Label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Sin proveedor</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Código de proveedor (SKU)</Label>
                    <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej: 12345" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Referencia</Label>
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: REF-01" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Precio (RD$, ITBIS incluido)</Label>
                    <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Costo (RD$)</Label>
                    <Input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Stock</Label>
                    <Input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Stock mínimo</Label>
                    <Input value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="numeric" />
                  </div>
                </div>

                <Separator />
                <div className="text-xs text-muted-foreground">Tip: el precio es el precio final al público (incluye ITBIS).</div>
              </div>

              <DialogFooter>
                <Button variant="secondary" onClick={() => setOpen(false)} type="button">Cancelar</Button>
                <Button onClick={onSave} disabled={isSaving} type="button">{isSaving ? "Guardando…" : "Guardar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por descripción, código o referencia" />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Código de proveedor</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.productId}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.supplier?.name ?? "—"}</TableCell>
                    <TableCell>{p.sku ?? "—"}</TableCell>
                    <TableCell>{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatRD(p.priceCents)}</TableCell>
                    <TableCell className="text-right">{p.stock}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setPrintingProduct(p)}
                          aria-label="Imprimir etiqueta"
                          title="Imprimir etiqueta"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={() => {
                            resetForm(p)
                            setOpen(true)
                          }}
                          aria-label="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(p.id)} aria-label="Desactivar">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      {isLoading ? "Cargando…" : "No hay productos"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {printingProduct && (
        <BarcodeLabel
          productName={printingProduct.name}
          sku={printingProduct.sku}
          reference={printingProduct.reference}
          priceCents={printingProduct.priceCents}
          onPrintComplete={() => setPrintingProduct(null)}
        />
      )}
    </div>
  )
}
