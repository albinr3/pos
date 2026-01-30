"use client"

import { useEffect, useMemo, useState, useTransition, type FocusEvent } from "react"
import { Edit, History, Plus, Printer, Search, Trash2 } from "lucide-react"
import { UnitType } from "@prisma/client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"
import { UNIT_OPTIONS, formatQty, decimalToNumber, unitAllowsDecimals, getUnitInfo } from "@/lib/units"
import { BarcodeLabel } from "@/components/app/barcode-label"
import { ProductImageUpload } from "@/components/app/product-image-upload"
import type { CurrentUser } from "@/lib/auth"

import { adjustManyStock, deactivateProduct, listProductMovements, listProducts, upsertProduct } from "./actions"
import { getAllSuppliers } from "../suppliers/actions"
import { getAllCategories } from "../categories/actions"
import { getSettings } from "../settings/actions"

type Product = Awaited<ReturnType<typeof listProducts>>["items"][number]
type ProductMovement = Awaited<ReturnType<typeof listProductMovements>>[number]

const PAGE_SIZE = 50

const MOVEMENT_LABELS: Record<ProductMovement["type"], string> = {
  SALE: "Venta",
  SALE_CANCELLED: "Venta cancelada",
  PURCHASE: "Compra",
  PURCHASE_CANCELLED: "Compra cancelada",
  RETURN: "Devolución",
  RETURN_CANCELLED: "Devolución cancelada",
  ADJUSTMENT: "Ajuste",
  INITIAL: "Stock inicial",
}

function toInt(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function toDecimal(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function formatMovementDate(value: string) {
  return new Date(value).toLocaleString("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

type BulkParseResult = {
  items: { productId: number; delta: number }[]
  errors: string[]
}

function parseBulkLines(value: string): BulkParseResult {
  const items: { productId: number; delta: number }[] = []
  const errors: string[] = []
  const lines = value.split(/\r?\n/)

  lines.forEach((line, index) => {
    const raw = line.trim()
    if (!raw) return

    // Ignorar encabezados comunes
    if (!/\d/.test(raw) && /id|producto|cantidad/i.test(raw)) return

    let parts: string[]
    if (raw.includes("\t")) {
      parts = raw.split("\t")
    } else if (raw.includes(",")) {
      parts = raw.split(",")
    } else if (raw.includes(";")) {
      parts = raw.split(";")
    } else {
      parts = raw.split(/\s+/)
    }

    const [idRaw, deltaRaw] = parts.map((p) => p.trim()).filter(Boolean)
    if (!idRaw || !deltaRaw) {
      errors.push(`Línea ${index + 1}: formato inválido (usa ID y cantidad).`)
      return
    }

    const productId = Number(idRaw)
    const delta = Number(deltaRaw.replace(",", "."))

    if (!Number.isInteger(productId) || productId <= 0) {
      errors.push(`Línea ${index + 1}: ID inválido.`)
      return
    }
    if (!Number.isFinite(delta) || delta === 0) {
      errors.push(`Línea ${index + 1}: cantidad inválida.`)
      return
    }

    items.push({ productId, delta })
  })

  return { items, errors }
}

export function ProductsClient() {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Product[]>([])
  const [isLoading, startLoading] = useTransition()
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [printingProduct, setPrintingProduct] = useState<Product | null>(null)
  const [barcodeLabelSize, setBarcodeLabelSize] = useState("4x2")
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkLines, setBulkLines] = useState("")
  const [bulkReason, setBulkReason] = useState("Ajuste masivo")
  const [isBulkSaving, startBulkSaving] = useTransition()
  const [movementsOpen, setMovementsOpen] = useState(false)
  const [movementsProduct, setMovementsProduct] = useState<Product | null>(null)
  const [movements, setMovements] = useState<ProductMovement[]>([])
  const [isMovementsLoading, startMovementsLoading] = useTransition()
  const [movementsPage, setMovementsPage] = useState(0)

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
  const [categories, setCategories] = useState<Awaited<ReturnType<typeof getAllCategories>>>([])
  const [categoryId, setCategoryId] = useState("")
  const [isSaving, startSaving] = useTransition()
  const [user, setUser] = useState<CurrentUser | null>(null)
  
  // Estado para producto básico o con medidas
  const [productType, setProductType] = useState<"basic" | "measured">("basic")
  // Unidades de compra y venta
  const [purchaseUnit, setPurchaseUnit] = useState<UnitType>("KG")
  const [saleUnit, setSaleUnit] = useState<UnitType>("KG")

  const selectAllOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select()
  }

  useEffect(() => {
    // Obtener usuario actual con permisos
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user)
        }
      })
      .catch(() => {
        console.error("Error fetching user")
      })
  }, [])

  function refresh(q?: string) {
    startLoading(async () => {
      try {
        const r = await listProducts({ query: q, take: PAGE_SIZE })
        setItems(r.items)
        setNextCursor(r.nextCursor)
      } catch {
        setItems([])
        setNextCursor(null)
      }
    })
  }

  useEffect(() => {
    refresh("")
    getAllSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
    getAllCategories().then(setCategories).catch(() => setCategories([]))
    getSettings().then((s) => setBarcodeLabelSize(s.barcodeLabelSize)).catch(() => {})
  }, [])

  useEffect(() => {
    const q = query.trim()
    const t = setTimeout(() => refresh(q), 200)
    return () => clearTimeout(t)
  }, [query])

  function loadMore() {
    if (!nextCursor) return
    const q = query.trim()
    startLoading(async () => {
      try {
        const r = await listProducts({ query: q, cursor: nextCursor, take: PAGE_SIZE })
        setItems((prev) => [...prev, ...r.items])
        setNextCursor(r.nextCursor)
      } catch {
        setNextCursor(null)
      }
    })
  }

  function resetForm(p?: Product | null) {
    const x = p ?? null
    setEditing(x)
    setName(x?.name ?? "")
    setSku(x?.sku ?? "")
    setReference(x?.reference ?? "")
    setSupplierId(x?.supplierId ?? "")
    setCategoryId(x?.categoryId ?? "")
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
  const bulkParsed = useMemo(() => parseBulkLines(bulkLines), [bulkLines])

  async function onSave() {
    const trimmedName = name.trim()
    const priceCents = toCents(price)
    const costCents = toCents(cost)
    if (!trimmedName || priceCents <= 0 || costCents <= 0) {
      toast({ title: "Campos requeridos", description: "Hay que llenar todos los campos obligatorios.", variant: "destructive" })
      return
    }
    if (productType === "measured" && (!purchaseUnit || !saleUnit)) {
      toast({ title: "Campos requeridos", description: "Hay que llenar todos los campos obligatorios.", variant: "destructive" })
      return
    }
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
          categoryId: categoryId || null,
          priceCents,
          costCents,
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

  async function onBulkSave() {
    const { items: parsedItems, errors } = parseBulkLines(bulkLines)
    if (!parsedItems.length) {
      toast({ title: "Sin datos", description: "Ingresa al menos un ID y cantidad.", variant: "destructive" })
      return
    }
    if (errors.length) {
      toast({ title: "Revisa el formato", description: errors[0], variant: "destructive" })
      return
    }
    startBulkSaving(async () => {
      try {
        await adjustManyStock({
          items: parsedItems,
          reason: bulkReason,
        })
        toast({ title: "Ajustes aplicados", description: "Inventario actualizado correctamente." })
        setBulkOpen(false)
        setBulkLines("")
        refresh(query)
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo aplicar el ajuste masivo" })
      }
    })
  }

  function openMovements(product: Product) {
    setMovementsProduct(product)
    setMovementsOpen(true)
    setMovementsPage(0)
    setMovements([])
    startMovementsLoading(async () => {
      try {
        const data = await listProductMovements({ productId: product.id, take: 500 })
        setMovements(data)
      } catch (e) {
        setMovements([])
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudieron cargar los movimientos" })
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
  const canAdjustStock = !!user && (user.canEditProducts || user.role === "ADMIN")
  const movementInitial = useMemo(() => movements.find((m) => m.type === "INITIAL") ?? null, [movements])
  const movementItems = useMemo(() => movements.filter((m) => m.type !== "INITIAL"), [movements])
  const movementPageSize = 10
  const movementPageCount = Math.max(Math.ceil(movementItems.length / movementPageSize), 1)
  const movementStart = movementsPage * movementPageSize
  const movementPageItems = movementItems.slice(movementStart, movementStart + movementPageSize)

  useEffect(() => {
    if (movementsPage > movementPageCount - 1) {
      setMovementsPage(0)
    }
  }, [movementsPage, movementPageCount])

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
          <div className="flex items-center gap-2">
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!canAdjustStock}>Ajuste masivo</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                  <DialogTitle>Ajuste masivo de inventario</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Motivo (opcional)</Label>
                    <Input
                      value={bulkReason}
                      onChange={(e) => setBulkReason(e.target.value)}
                      placeholder="Ej: Conteo físico"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>IDs y cantidades (una línea por producto)</Label>
                    <Textarea
                      value={bulkLines}
                      onChange={(e) => setBulkLines(e.target.value)}
                      rows={8}
                      placeholder={"101\t+5\n102\t-2"}
                      className="font-mono"
                    />
                    <div className="text-xs text-muted-foreground">
                      Formato: ID y cantidad (usa + o -). Puedes pegar desde Excel/Sheets (tabulado).
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Líneas válidas: {bulkParsed.items.length}
                    {bulkParsed.errors.length > 0 ? ` · Errores: ${bulkParsed.errors.length}` : ""}
                  </div>
                  {bulkParsed.errors.length > 0 && (
                    <div className="text-xs text-red-500">{bulkParsed.errors[0]}</div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setBulkOpen(false)} type="button">Cancelar</Button>
                  <Button onClick={onBulkSave} disabled={isBulkSaving || !canAdjustStock} type="button">
                    {isBulkSaving ? "Aplicando…" : "Aplicar ajustes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      <div className="grid gap-2">
                        <Label>Categoría (opcional)</Label>
                        <select
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">Sin categoría</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
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
                          <Input
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            inputMode="decimal"
                            required
                            disabled={editing ? (!user || (!user.canOverridePrice && user.role !== "ADMIN")) : false}
                            onFocus={selectAllOnFocus}
                          />
                        </div>
                        {(user?.canViewProductCosts || user?.role === "ADMIN") && (
                          <div className="grid gap-2">
                            <Label>
                              Costo por ({getUnitInfo("UNIDAD").abbr}) (RD$) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              value={cost}
                              onChange={(e) => setCost(e.target.value)}
                              inputMode="decimal"
                              required
                              onFocus={selectAllOnFocus}
                            />
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>Existencia ({getUnitInfo("UNIDAD").abbr})</Label>
                          <Input
                            value={stock}
                            onChange={(e) => setStock(e.target.value)}
                            inputMode="numeric"
                            placeholder="Ej: 100"
                            disabled={!!editing}
                            onFocus={selectAllOnFocus}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Existencia mínima ({getUnitInfo("UNIDAD").abbr})</Label>
                          <Input
                            value={minStock}
                            onChange={(e) => setMinStock(e.target.value)}
                            inputMode="numeric"
                            placeholder="Ej: 10"
                            onFocus={selectAllOnFocus}
                          />
                        </div>
                      </div>
                      {editing && (
                        <div className="text-xs text-muted-foreground">
                          La existencia se ajusta desde Ajuste masivo.
                        </div>
                      )}
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
                          <Input
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            inputMode="decimal"
                            required
                            disabled={editing ? (!user || (!user.canOverridePrice && user.role !== "ADMIN")) : false}
                            onFocus={selectAllOnFocus}
                          />
                        </div>
                        {(user?.canViewProductCosts || user?.role === "ADMIN") && (
                          <div className="grid gap-2">
                            <Label>
                              Costo por ({getUnitInfo(purchaseUnit).abbr}) (RD$) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              value={cost}
                              onChange={(e) => setCost(e.target.value)}
                              inputMode="decimal"
                              required
                              onFocus={selectAllOnFocus}
                            />
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>Existencia ({getUnitInfo(saleUnit).abbr})</Label>
                          <Input
                            value={stock}
                            onChange={(e) => setStock(e.target.value)}
                            inputMode="decimal"
                            placeholder="Ej: 45.5"
                            disabled={!!editing}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Existencia mínima ({getUnitInfo(saleUnit).abbr})</Label>
                          <Input value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="decimal" placeholder="Ej: 5" />
                        </div>
                      </div>
                      {editing && (
                        <div className="text-xs text-muted-foreground">
                          La existencia se ajusta desde Ajuste masivo.
                        </div>
                      )}
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
          </div>
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
                          variant="outline"
                          size="icon"
                          onClick={() => openMovements(p)}
                          aria-label="Movimientos"
                          title="Movimientos"
                        >
                          <History className="h-4 w-4" />
                        </Button>
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
                          disabled={!user || (!user.canEditProducts && user.role !== "ADMIN")}
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
          {nextCursor && (
            <div className="flex justify-center">
              <Button type="button" variant="secondary" onClick={loadMore} disabled={isLoading}>
                {isLoading ? "Cargando…" : "Cargar más"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {movementsProduct && (
        <Dialog
          open={movementsOpen}
          onOpenChange={(v) => {
            setMovementsOpen(v)
            if (!v) {
              setMovementsProduct(null)
              setMovements([])
            }
          }}
        >
          <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                Movimientos de {movementsProduct.name} (ID {movementsProduct.productId})
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1">
              <div className="rounded-md border max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isMovementsLoading && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Cargando movimientos...
                        </TableCell>
                      </TableRow>
                    )}
                    {!isMovementsLoading && movementItems.length === 0 && !movementInitial && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No hay movimientos para este producto.
                        </TableCell>
                      </TableRow>
                    )}
                    {movementInitial && !isMovementsLoading && (() => {
                      const unit = (movementsProduct.saleUnit as UnitType) ?? "UNIDAD"
                      const qty = Math.abs(movementInitial.qtyDelta)
                      const qtyLabel = formatQty(qty, unit)
                      return (
                        <TableRow key={movementInitial.id} className="bg-muted/30">
                          <TableCell className="whitespace-nowrap">
                            {formatMovementDate(movementInitial.occurredAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{MOVEMENT_LABELS[movementInitial.type]}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium text-muted-foreground">{qtyLabel}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {movementInitial.reference ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {movementInitial.note ?? "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })()}
                    {movementPageItems.map((movement) => {
                      const unit = (movementsProduct.saleUnit as UnitType) ?? "UNIDAD"
                      const qty = Math.abs(movement.qtyDelta)
                      const qtyLabel = `${movement.qtyDelta > 0 ? "+" : ""}${formatQty(qty, unit)}`
                      const qtyClass = movement.qtyDelta > 0 ? "text-emerald-600" : "text-red-600"
                      const detailParts = [movement.actor, movement.note].filter(Boolean)
                      return (
                        <TableRow key={movement.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatMovementDate(movement.occurredAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{MOVEMENT_LABELS[movement.type]}</Badge>
                          </TableCell>
                          <TableCell className={`text-right font-medium ${qtyClass}`}>{qtyLabel}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {movement.reference ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {detailParts.length ? detailParts.join(" • ") : "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            <DialogFooter>
              <div className="flex items-center justify-between w-full">
                <div className="text-xs text-muted-foreground">
                  Página {Math.min(movementsPage + 1, movementPageCount)} de {movementPageCount}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMovementsPage((p) => Math.max(p - 1, 0))}
                    disabled={movementsPage === 0}
                    type="button"
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMovementsPage((p) => Math.min(p + 1, movementPageCount - 1))}
                    disabled={movementsPage >= movementPageCount - 1}
                    type="button"
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
              <Button variant="secondary" onClick={() => setMovementsOpen(false)} type="button">
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
