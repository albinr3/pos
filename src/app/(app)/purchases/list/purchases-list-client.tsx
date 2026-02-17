"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Edit, ShoppingBag, Trash2, Search, Printer } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"
import { resolvePurchaseSalePricing } from "@/lib/purchase-pricing"

import { cancelPurchase, getPurchaseById, listAllPurchases, updatePurchase, searchProductsForPurchase } from "../actions"
import { getAllSuppliers } from "../../suppliers/actions"
import { getSettings } from "../../settings/actions"

type Purchase = Awaited<ReturnType<typeof listAllPurchases>>[number]
type PurchaseDetail = Awaited<ReturnType<typeof getPurchaseById>>
type ProductResult = Awaited<ReturnType<typeof searchProductsForPurchase>>[number]
type Supplier = Awaited<ReturnType<typeof getAllSuppliers>>[number]

type CartItem = {
  productId: string
  name: string
  sku: string | null
  reference: string | null
  qty: number
  unitCostCents: number
  discountPercentBp: number
  netCostCents: number
  salePriceCents: number
  saleMarginBp: number
  purchaseIncludesItbis: boolean
  productItbisRateBp: number
  appliedItbisRateBp: number
}

function toInt(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function PurchasesListClient() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [isLoading, startLoading] = useTransition()
  const [query, setQuery] = useState("")

  const [openEdit, setOpenEdit] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState<PurchaseDetail | null>(null)
  const [supplierId, setSupplierId] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [notes, setNotes] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [updateCost, setUpdateCost] = useState(false)
  const [updatePrice, setUpdatePrice] = useState(true)
  const [isSaving, startSaving] = useTransition()

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<ProductResult[]>([])
  const [, startSearch] = useTransition()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [defaultProfitMarginBp, setDefaultProfitMarginBp] = useState(3000)
  const [itbisRateBp, setItbisRateBp] = useState(1800)

  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({})
  const [saleMarginInputs, setSaleMarginInputs] = useState<Record<string, string>>({})
  const [salePriceInputs, setSalePriceInputs] = useState<Record<string, string>>({})

  const selectedSupplier = supplierId ? suppliers.find((s) => s.id === supplierId) ?? null : null

  function recalcCartItem(item: CartItem, overrides?: Partial<CartItem> & { salePriceCents?: number; saleMarginBp?: number }): CartItem {
    const nextItem = { ...item, ...overrides }
    const pricing = resolvePurchaseSalePricing({
      unitCostCents: nextItem.unitCostCents,
      discountPercentBp: nextItem.discountPercentBp,
      purchaseIncludesItbis: nextItem.purchaseIncludesItbis,
      purchaseItbisRateBp: itbisRateBp,
      productItbisRateBp: nextItem.productItbisRateBp,
      defaultSaleMarginBp: defaultProfitMarginBp,
      saleMarginBp: overrides && "salePriceCents" in overrides ? undefined : nextItem.saleMarginBp,
      salePriceCents: overrides?.salePriceCents,
    })

    return {
      ...nextItem,
      discountPercentBp: pricing.discountPercentBp,
      netCostCents: pricing.netCostCents,
      salePriceCents: pricing.salePriceCents,
      saleMarginBp: pricing.saleMarginBp,
      purchaseIncludesItbis: pricing.purchaseIncludesItbis,
      appliedItbisRateBp: pricing.appliedItbisRateBp,
    }
  }

  function refresh() {
    startLoading(async () => {
      try {
        const r = await listAllPurchases()
        setPurchases(r)
      } catch {
        setPurchases([])
      }
    })
  }

  useEffect(() => {
    refresh()
    Promise.all([getAllSuppliers(), getSettings()])
      .then(([supplierList, settings]) => {
        setSuppliers(supplierList)
        setDefaultProfitMarginBp(settings.defaultProfitMarginBp)
        setItbisRateBp(settings.itbisRateBp)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      return
    }

    const t = setTimeout(() => {
      startSearch(async () => {
        try {
          const r = await searchProductsForPurchase(q)
          setSearchResults(r)
        } catch {
          setSearchResults([])
        }
      })
    }, 200)

    return () => clearTimeout(t)
  }, [searchQuery])

  function applySupplierSelection(nextSupplierId: string) {
    setSupplierId(nextSupplierId)

    if (!nextSupplierId) {
      setSupplierName("")
      return
    }

    const supplier = suppliers.find((s) => s.id === nextSupplierId)
    if (!supplier) return

    setSupplierName(supplier.name)
    setCart((prev) =>
      prev.map((item) =>
        recalcCartItem(item, {
          discountPercentBp: supplier.discountPercentBp,
          purchaseIncludesItbis: supplier.chargesItbis ?? false,
        })
      )
    )
  }

  async function loadPurchaseForEdit(id: string) {
    try {
      const purchase = await getPurchaseById(id)
      if (!purchase) {
        toast({ title: "Error", description: "Compra no encontrada" })
        return
      }

      const matchedSupplier = suppliers.find(
        (s) => (s.name || "").trim().toLowerCase() === (purchase.supplierName || "").trim().toLowerCase()
      )

      const mappedCart: CartItem[] = purchase.items.map((item) => {
        const pricing = resolvePurchaseSalePricing({
          unitCostCents: item.unitCostCents,
          discountPercentBp: item.discountPercentBp,
          purchaseIncludesItbis: item.purchaseIncludesItbis ?? true,
          purchaseItbisRateBp: itbisRateBp,
          productItbisRateBp: item.product.itbisRateBp,
          defaultSaleMarginBp: defaultProfitMarginBp,
          saleMarginBp: item.saleMarginBp ?? undefined,
          salePriceCents: item.salePriceCents ?? undefined,
        })

        return {
          productId: item.productId,
          name: item.product.name,
          sku: item.product.sku,
          reference: item.product.reference,
          qty: Number(item.qty),
          unitCostCents: item.unitCostCents,
          discountPercentBp: pricing.discountPercentBp,
          netCostCents: pricing.netCostCents,
          salePriceCents: pricing.salePriceCents,
          saleMarginBp: pricing.saleMarginBp,
          purchaseIncludesItbis: pricing.purchaseIncludesItbis,
          productItbisRateBp: item.product.itbisRateBp,
          appliedItbisRateBp: pricing.appliedItbisRateBp,
        }
      })

      setEditingPurchase(purchase)
      setSupplierId(matchedSupplier?.id ?? "")
      setSupplierName(purchase.supplierName ?? "")
      setNotes(purchase.notes ?? "")
      setCart(mappedCart)
      setUpdateCost(false)
      setUpdatePrice(true)
      setDiscountInputs({})
      setSaleMarginInputs({})
      setSalePriceInputs({})
      setOpenEdit(true)
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo cargar la compra" })
    }
  }

  function addProduct(p: ProductResult) {
    setCart((prev) => {
      const existing = prev.find((x) => x.productId === p.id)
      if (existing) {
        return prev.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x))
      }

      const discountPercentBp = selectedSupplier?.discountPercentBp ?? 0
      const purchaseIncludesItbis = selectedSupplier ? (selectedSupplier.chargesItbis ?? false) : true
      const pricing = resolvePurchaseSalePricing({
        unitCostCents: p.costCents ?? 0,
        discountPercentBp,
        purchaseIncludesItbis,
        purchaseItbisRateBp: itbisRateBp,
        productItbisRateBp: p.itbisRateBp ?? 0,
        defaultSaleMarginBp: defaultProfitMarginBp,
      })

      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          reference: p.reference,
          qty: 1,
          unitCostCents: p.costCents ?? 0,
          discountPercentBp: pricing.discountPercentBp,
          netCostCents: pricing.netCostCents,
          salePriceCents: pricing.salePriceCents,
          saleMarginBp: pricing.saleMarginBp,
          purchaseIncludesItbis: pricing.purchaseIncludesItbis,
          productItbisRateBp: p.itbisRateBp ?? 0,
          appliedItbisRateBp: pricing.appliedItbisRateBp,
        },
      ]
    })
  }

  async function handleSave() {
    if (!editingPurchase) return
    if (!supplierId) {
      toast({ title: "Proveedor requerido", description: "Debes seleccionar un proveedor para guardar la compra." })
      return
    }

    startSaving(async () => {
      try {
        await updatePurchase({
          id: editingPurchase.id,
          supplierId: supplierId || null,
          supplierName: supplierName || null,
          notes: notes || null,
          items: cart.map((c) => ({
            productId: c.productId,
            qty: c.qty,
            unitCostCents: c.unitCostCents,
            discountPercentBp: c.discountPercentBp,
            salePriceCents: c.salePriceCents,
            saleMarginBp: c.saleMarginBp,
            purchaseIncludesItbis: c.purchaseIncludesItbis,
          })),
          updateProductCost: updateCost,
          updateProductPrice: updatePrice,
        })
        toast({ title: "Guardado", description: "Compra actualizada" })
        setOpenEdit(false)
        setEditingPurchase(null)
        refresh()
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo actualizar" })
      }
    })
  }

  async function handleCancel(id: string) {
    if (!confirm("¿Cancelar esta compra? Se revertirá el stock agregado.")) return
    try {
      await cancelPurchase(id)
      toast({ title: "Listo", description: "Compra cancelada" })
      refresh()
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo cancelar" })
    }
  }

  const filteredPurchases = purchases.filter((p) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      p.supplierName?.toLowerCase().includes(q) ||
      p.notes?.toLowerCase().includes(q) ||
      p.items.some((item) => item.product.name.toLowerCase().includes(q))
    )
  })

  const totalCents = useMemo(() => cart.reduce((s, i) => s + i.qty * i.netCostCents, 0), [cart])

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" /> Lista de Compras
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por suplidor, notas o productos" />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Suplidor</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.map((p) => (
                  <TableRow key={p.id} className={p.cancelledAt ? "bg-red-50" : ""}>
                    <TableCell>
                      {new Date(p.purchasedAt).toLocaleDateString("es-DO")}
                      {p.cancelledAt && <div className="text-xs text-red-600 font-semibold">CANCELADA</div>}
                    </TableCell>
                    <TableCell>{p.supplierName ?? "-"}</TableCell>
                    <TableCell>{p.items.length} productos</TableCell>
                    <TableCell className="text-right font-medium">{formatRD(p.totalCents)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          asChild
                          size="icon"
                          className="bg-green-500 hover:bg-green-600 text-white"
                          title="Reimprimir"
                        >
                          <Link href={`/receipts/purchase/${p.id}`} target="_blank" aria-label="Reimprimir">
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                        {!p.cancelledAt && (
                          <>
                            <Button
                              className="bg-blue-500 hover:bg-blue-600 text-white"
                              size="icon"
                              onClick={() => loadPurchaseForEdit(p.id)}
                              aria-label="Editar"
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              className="bg-red-500 hover:bg-red-600 text-white"
                              size="icon"
                              onClick={() => handleCancel(p.id)}
                              aria-label="Cancelar"
                              title="Cancelar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {p.cancelledAt && (
                          <span className="text-xs text-red-600">Cancelada {new Date(p.cancelledAt).toLocaleDateString("es-DO")}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {!isLoading && filteredPurchases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <img
                          src="/lupa.png"
                          alt="No hay resultados"
                          width={192}
                          height={192}
                          className="mb-4 opacity-60"
                        />
                        <p className="text-lg font-medium text-muted-foreground">No se encontraron compras</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {query ? "Intenta con otros términos de búsqueda" : "Aún no se han registrado compras"}
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

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="sm:max-w-[980px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Compra</DialogTitle>
          </DialogHeader>

          {editingPurchase && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Proveedor (opcional)</Label>
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={supplierId}
                  onChange={(e) => {
                    applySupplierSelection(e.target.value)
                  }}
                >
                  <option value="">Sin proveedor / Escribir nombre</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.discountPercentBp > 0 ? `(${(s.discountPercentBp / 100).toFixed(2)}% desc.)` : ""}
                    </option>
                  ))}
                </select>
                {!supplierId && (
                  <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Nombre proveedor" />
                )}
              </div>

              <div className="grid gap-2">
                <Label>Nota (opcional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="rounded-md border p-3">
                <div className="grid gap-3">
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} className="mt-1" />
                    <span>
                      <span className="font-medium">Actualizar costo del producto</span>
                      <span className="block text-xs text-muted-foreground">Si lo activas, se actualiza el costo neto del producto.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" checked={updatePrice} onChange={(e) => setUpdatePrice(e.target.checked)} className="mt-1" />
                    <span>
                      <span className="font-medium">Actualizar precio de venta</span>
                      <span className="block text-xs text-muted-foreground">Si lo activas, se actualiza el precio de venta del producto.</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Buscar producto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                  <Input className="pl-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar producto..." />
                </div>
                {searchQuery && searchResults.length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-y-auto">
                    {searchResults.map((p) => (
                      <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b last:border-b-0">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-sm text-muted-foreground">Codigo: {p.sku ?? "-"} · Costo: {formatRD(p.costCents ?? 0)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Productos ({cart.length})</Label>
                <div className="space-y-2 max-h-[440px] overflow-y-auto border rounded-md p-2">
                  {cart.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-2">No hay productos</div>
                  ) : (
                    cart.map((c) => (
                      <div key={c.productId} className="border rounded p-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs text-muted-foreground">Codigo: {c.sku ?? "-"} · Ref: {c.reference ?? "-"}</div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setCart((p) => p.filter((x) => x.productId !== c.productId))
                              setDiscountInputs((prev) => {
                                const newState = { ...prev }
                                delete newState[c.productId]
                                return newState
                              })
                              setSaleMarginInputs((prev) => {
                                const newState = { ...prev }
                                delete newState[c.productId]
                                return newState
                              })
                              setSalePriceInputs((prev) => {
                                const newState = { ...prev }
                                delete newState[c.productId]
                                return newState
                              })
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                          <div>
                            <Label className="text-xs">Cantidad</Label>
                            <Input
                              value={String(c.qty)}
                              onChange={(e) => {
                                const newQty = Math.max(1, toInt(e.target.value))
                                setCart((p) => p.map((x) => (x.productId === c.productId ? { ...x, qty: newQty } : x)))
                              }}
                              inputMode="numeric"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Costo unitario</Label>
                            <Input
                              value={((c.unitCostCents ?? 0) / 100).toFixed(2)}
                              onChange={(e) => {
                                const newCost = toCents(e.target.value)
                                setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { unitCostCents: newCost }) : x)))
                              }}
                              inputMode="decimal"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Descuento (%)</Label>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={discountInputs[c.productId] ?? (c.discountPercentBp / 100).toFixed(2)}
                              onChange={(e) => {
                                let newValue = e.target.value
                                setDiscountInputs((prev) => ({ ...prev, [c.productId]: newValue }))

                                if (newValue === "") {
                                  setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { discountPercentBp: 0 }) : x)))
                                  return
                                }

                                const cleaned = newValue.replace(/[^0-9.]/g, "")
                                const parts = cleaned.split(".")
                                if (parts.length > 2) {
                                  newValue = parts[0] + "." + parts.slice(1).join("")
                                } else {
                                  newValue = cleaned
                                }
                                if (parts.length === 2 && parts[1].length > 2) {
                                  newValue = parts[0] + "." + parts[1].substring(0, 2)
                                }

                                const discountPercent = Math.min(parseFloat(newValue) || 0, 100)
                                const discountBp = Math.round(discountPercent * 100)
                                setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { discountPercentBp: discountBp }) : x)))
                              }}
                              onBlur={(e) => {
                                const discountPercent = Math.min(parseFloat(e.target.value) || 0, 100)
                                const discountBp = Math.round(discountPercent * 100)
                                setDiscountInputs((prev) => {
                                  const newState = { ...prev }
                                  delete newState[c.productId]
                                  return newState
                                })
                                setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { discountPercentBp: discountBp }) : x)))
                              }}
                              onFocus={() => {
                                setDiscountInputs((prev) => ({ ...prev, [c.productId]: (c.discountPercentBp / 100).toFixed(2) }))
                              }}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Ganancia (%)</Label>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={saleMarginInputs[c.productId] ?? (c.saleMarginBp / 100).toFixed(2)}
                              onChange={(e) => {
                                let newValue = e.target.value
                                setSaleMarginInputs((prev) => ({ ...prev, [c.productId]: newValue }))

                                if (newValue === "") {
                                  setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { saleMarginBp: 0 }) : x)))
                                  return
                                }

                                const cleaned = newValue.replace(/[^0-9.]/g, "")
                                const parts = cleaned.split(".")
                                if (parts.length > 2) {
                                  newValue = parts[0] + "." + parts.slice(1).join("")
                                } else {
                                  newValue = cleaned
                                }
                                if (parts.length === 2 && parts[1].length > 2) {
                                  newValue = parts[0] + "." + parts[1].substring(0, 2)
                                }

                                const marginPercent = Math.min(parseFloat(newValue) || 0, 500)
                                const marginBp = Math.round(marginPercent * 100)
                                setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { saleMarginBp: marginBp }) : x)))
                              }}
                              onBlur={(e) => {
                                const marginPercent = Math.min(parseFloat(e.target.value) || 0, 500)
                                const marginBp = Math.round(marginPercent * 100)
                                setSaleMarginInputs((prev) => {
                                  const newState = { ...prev }
                                  delete newState[c.productId]
                                  return newState
                                })
                                setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { saleMarginBp: marginBp }) : x)))
                              }}
                              onFocus={() => {
                                setSaleMarginInputs((prev) => ({ ...prev, [c.productId]: (c.saleMarginBp / 100).toFixed(2) }))
                              }}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Precio venta</Label>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={salePriceInputs[c.productId] ?? (c.salePriceCents / 100).toFixed(2)}
                              onChange={(e) => {
                                const value = e.target.value
                                setSalePriceInputs((prev) => ({ ...prev, [c.productId]: value }))
                                const salePriceCents = toCents(value)
                                setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { salePriceCents }) : x)))
                              }}
                              onBlur={(e) => {
                                const salePriceCents = toCents(e.target.value)
                                setSalePriceInputs((prev) => {
                                  const newState = { ...prev }
                                  delete newState[c.productId]
                                  return newState
                                })
                                setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { salePriceCents }) : x)))
                              }}
                              onFocus={() => {
                                setSalePriceInputs((prev) => ({ ...prev, [c.productId]: (c.salePriceCents / 100).toFixed(2) }))
                              }}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Costo neto</Label>
                            <div className="h-10 rounded-md border bg-muted px-3 py-2 text-sm font-semibold">{formatRD(c.netCostCents)}</div>
                          </div>
                        </div>

                        <div className="mt-2 text-xs font-semibold text-muted-foreground">
                          Descuento proveedor aplicado: {(c.discountPercentBp / 100).toFixed(2)}% · Compra con ITBIS: {c.purchaseIncludesItbis ? "Si" : "No"} · Venta con ITBIS: {c.appliedItbisRateBp > 0 ? "Si" : "No"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          NOTA: Si quieres que el producto se venda con o sin ITBIS debes modificar el perfil del producto y ponerlo como exento.
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          NOTA2: Si quieres que el producto su compra sea con o sin ITBIS debes modificar el perfil del proveedor.
                        </div>
                        <div className="mt-2 flex items-center justify-between rounded-md border bg-muted/50 p-2">
                          <div className="text-xs text-muted-foreground">Total linea:</div>
                          <div className="text-sm font-semibold">{formatRD(c.qty * c.netCostCents)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total:</span>
                  <span className="text-lg font-bold">{formatRD(totalCents)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenEdit(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || cart.length === 0 || !supplierId}>
              {isSaving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
