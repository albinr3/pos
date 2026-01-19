"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Edit, Plus, Printer, Search, Trash2 } from "lucide-react"
import { UnitType } from "@prisma/client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"
import { UNIT_OPTIONS, formatQty, decimalToNumber, unitAllowsDecimals, getUnitInfo } from "@/lib/units"
import { BarcodeLabel } from "@/components/app/barcode-label"
import { ProductImageUpload } from "@/components/app/product-image-upload"

import { deactivateProduct, listProducts, upsertProduct } from "./actions"
import { getAllSuppliers } from "../suppliers/actions"
import { getSettings } from "../settings/actions"

type Product = Awaited<ReturnType<typeof listProducts>>[number]

function toInt(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function toDecimal(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

export function ProductsClient() {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Product[]>([])
  const [isLoading, startLoading] = useTransition()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [printingProduct, setPrintingProduct] = useState<Product | null>(null)
  const [barcodeLabelSize, setBarcodeLabelSize] = useState("4x2")

  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [reference, setReference] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [price, setPrice] = useState("0")
  const [cost, setCost] = useState("0")
  const [itbisRateBp, setItbisRateBp] = useState(1800) // 18% por defecto
  const [stock, setStock] = useState("0")
  const [minStock, setMinStock] = useState("0")
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<Awaited<ReturnType<typeof getAllSuppliers>>>([])
  const [isSaving, startSaving] = useTransition()
  
  // Estado para producto básico o con medidas
  const [productType, setProductType] = useState<"basic" | "measured">("basic")
  // Unidades de compra y venta
  const [purchaseUnit, setPurchaseUnit] = useState<UnitType>("KG")
  const [saleUnit, setSaleUnit] = useState<UnitType>("KG")

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
    getSettings().then((s) => setBarcodeLabelSize(s.barcodeLabelSize)).catch(() => {})
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
    setItbisRateBp(x?.itbisRateBp ?? 1800)
    const stockNum = x ? decimalToNumber(x.stock) : 0
    const minStockNum = x ? decimalToNumber(x.minStock) : 0
    setStock(String(stockNum))
    setMinStock(String(minStockNum))
    setImageUrls(x?.imageUrls ?? [])
    
    // Determinar si es producto básico (ambas unidades son UNIDAD) o con medidas
    const purchaseU = (x?.purchaseUnit as UnitType) ?? "UNIDAD"
    const saleU = (x?.saleUnit as UnitType) ?? "UNIDAD"
    if (purchaseU === "UNIDAD" && saleU === "UNIDAD") {
      setProductType("basic")
      setPurchaseUnit("KG") // Default para cuando cambie a medidas
      setSaleUnit("KG")
    } else {
      setProductType("measured")
      setPurchaseUnit(purchaseU)
      setSaleUnit(saleU)
    }
  }

  const title = useMemo(() => (editing ? "Editar producto" : "Nuevo producto"), [editing])

  async function onSave() {
    startSaving(async () => {
      try {
        // Determinar unidades según el tipo de producto
        const finalPurchaseUnit: UnitType = productType === "basic" ? "UNIDAD" : purchaseUnit
        const finalSaleUnit: UnitType = productType === "basic" ? "UNIDAD" : saleUnit
        
        // Determinar si usar decimales según la unidad de venta
        const allowsDecimals = unitAllowsDecimals(finalSaleUnit)
        const stockValue = allowsDecimals ? toDecimal(stock) : toInt(stock)
        const minStockValue = allowsDecimals ? toDecimal(minStock) : toInt(minStock)
        
        await upsertProduct({
          id: editing?.id,
          name,
          sku: sku || null,
          reference: reference || null,
          supplierId: supplierId || null,
          priceCents: toCents(price),
          costCents: toCents(cost),
          itbisRateBp,
          stock: stockValue,
          minStock: minStockValue,
          imageUrls,
          purchaseUnit: finalPurchaseUnit,
          saleUnit: finalSaleUnit,
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

  const totalProducts = items.length

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-purple-primary bg-purple-50 dark:bg-purple-950/20">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total de productos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-purple-primary">{totalProducts}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Productos</CardTitle>
            <div className="text-sm text-muted-foreground">Descripción, código (SKU), referencia, precio y existencia.</div>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(null) }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(null); setOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px] max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>

              <Tabs value={productType} onValueChange={(v) => setProductType(v as "basic" | "measured")} className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="basic">Producto básico</TabsTrigger>
                  <TabsTrigger value="measured">Producto con medidas</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto pr-2 mt-4">
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
                      <Label>
                        Nombre del producto <span className="text-red-500">*</span>
                      </Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Alfombra" required />
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label>Código de proveedor (SKU)</Label>
                        <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej: 12345" />
                      </div>
                      <div className="grid gap-2">
                        <Label>Referencia</Label>
                        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: REF-01" />
                      </div>
                    </div>

                    <Separator />

                    {/* Campos específicos según el tipo de producto */}
                    <TabsContent value="basic" className="mt-0 space-y-4">
                      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                        Los productos básicos se compran y venden por unidad. Las unidades de compra y venta se establecen automáticamente como "Unidad".
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>
                            Precio de venta por ({getUnitInfo("UNIDAD").abbr}) (RD$, ITBIS incluido) <span className="text-red-500">*</span>
                          </Label>
                          <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" required />
                        </div>
                        <div className="grid gap-2">
                          <Label>
                            Costo por ({getUnitInfo("UNIDAD").abbr}) (RD$) <span className="text-red-500">*</span>
                          </Label>
                          <Input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" required />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>Existencia ({getUnitInfo("UNIDAD").abbr})</Label>
                          <Input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" placeholder="Ej: 100" />
                        </div>
                        <div className="grid gap-2">
                          <Label>Existencia mínima ({getUnitInfo("UNIDAD").abbr})</Label>
                          <Input value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="numeric" placeholder="Ej: 10" />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="measured" className="mt-0 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>
                            Unidad de compra <span className="text-red-500">*</span>
                          </Label>
                          <select
                            value={purchaseUnit}
                            onChange={(e) => setPurchaseUnit(e.target.value as UnitType)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            required
                          >
                            {UNIT_OPTIONS.filter((u) => u.value !== "UNIDAD").map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label} ({u.abbr})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-2">
                          <Label>
                            Unidad de venta <span className="text-red-500">*</span>
                          </Label>
                          <select
                            value={saleUnit}
                            onChange={(e) => setSaleUnit(e.target.value as UnitType)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            required
                          >
                            {UNIT_OPTIONS.filter((u) => u.value !== "UNIDAD").map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label} ({u.abbr})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                        La unidad de compra y venta pueden ser diferentes. Ejemplo: compras por kilogramos (kg) pero vendes por gramos (g).
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>
                            Precio de venta por ({getUnitInfo(saleUnit).abbr}) (RD$, ITBIS incluido) <span className="text-red-500">*</span>
                          </Label>
                          <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" required />
                        </div>
                        <div className="grid gap-2">
                          <Label>
                            Costo por ({getUnitInfo(purchaseUnit).abbr}) (RD$) <span className="text-red-500">*</span>
                          </Label>
                          <Input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" required />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>Existencia ({getUnitInfo(saleUnit).abbr})</Label>
                          <Input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="decimal" placeholder="Ej: 45.5" />
                        </div>
                        <div className="grid gap-2">
                          <Label>Existencia mínima ({getUnitInfo(saleUnit).abbr})</Label>
                          <Input value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="decimal" placeholder="Ej: 5" />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                        Los productos con medidas permiten cantidades decimales (ej: 2.5 kg, 1.75 m).
                      </div>
                    </TabsContent>

                    <Separator />

                    <div className="grid gap-2">
                      <Label>ITBIS aplicable</Label>
                      <select
                        value={itbisRateBp}
                        onChange={(e) => setItbisRateBp(Number(e.target.value))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value={1800}>18% (Estándar)</option>
                        <option value={1600}>16%</option>
                        <option value={0}>0% (Exento)</option>
                      </select>
                      <div className="text-xs text-muted-foreground">
                        El ITBIS se calcula automáticamente según el porcentaje seleccionado.
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-2">
                      <Label>Imágenes del producto</Label>
                      <ProductImageUpload images={imageUrls} onChange={setImageUrls} maxImages={3} />
                    </div>

                    <Separator />
                    <div className="text-xs text-muted-foreground">Tip: el precio es el precio final al público (incluye ITBIS).</div>
                  </div>
                </div>
              </Tabs>

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

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Código de proveedor</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Existencia</TableHead>
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
                    <TableCell className="text-right">
                      {formatQty(decimalToNumber(p.stock), (p.saleUnit as UnitType) ?? "UNIDAD")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          className="bg-green-500 hover:bg-green-600 text-white"
                          size="icon"
                          onClick={() => setPrintingProduct(p)}
                          aria-label="Imprimir etiqueta"
                          title="Imprimir etiqueta"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          className="bg-blue-500 hover:bg-blue-600 text-white"
                          size="icon"
                          onClick={() => {
                            resetForm(p)
                            setOpen(true)
                          }}
                          aria-label="Editar"
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          className="bg-red-500 hover:bg-red-600 text-white"
                          size="icon"
                          onClick={() => onDelete(p.id)}
                          aria-label="Desactivar"
                          title="Desactivar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {!isLoading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <img
                          src="/lupa.png"
                          alt="No hay resultados"
                          width={192}
                          height={192}
                          className="mb-4 opacity-60"
                        />
                        <p className="text-lg font-medium text-muted-foreground">No se encontraron productos</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {query ? "Intenta con otros términos de búsqueda" : "Aún no se han registrado productos"}
                        </p>
                      </div>
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
          labelSize={barcodeLabelSize}
          onPrintComplete={() => setPrintingProduct(null)}
        />
      )}
    </div>
  )
}
