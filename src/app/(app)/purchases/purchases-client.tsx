"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Search, ShoppingBag, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"
import { resolvePurchaseSalePricing } from "@/lib/purchase-pricing"

import { createPurchase, listPurchases, searchProductsForPurchase } from "./actions"
import { getAllSuppliers } from "../suppliers/actions"
import { getSettings } from "../settings/actions"

type Purchase = Awaited<ReturnType<typeof listPurchases>>[number]

type ProductResult = Awaited<ReturnType<typeof searchProductsForPurchase>>[number]

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
  productItbisRateBp: number
  purchaseIncludesItbis: boolean
  appliedItbisRateBp: number
}

type Supplier = Awaited<ReturnType<typeof getAllSuppliers>>[number] & { chargesItbis?: boolean }

function toInt(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function calculatePricing(input: {
  unitCostCents: number
  discountPercentBp: number
  purchaseIncludesItbis: boolean
  purchaseItbisRateBp: number
  productItbisRateBp: number
  defaultMarginBp: number
  salePricesIncludeItbis: boolean
  saleMarginBp?: number
  salePriceCents?: number
}) {
  return resolvePurchaseSalePricing({
    unitCostCents: input.unitCostCents,
    discountPercentBp: input.discountPercentBp,
    purchaseIncludesItbis: input.purchaseIncludesItbis,
    purchaseItbisRateBp: input.purchaseItbisRateBp,
    productItbisRateBp: input.productItbisRateBp,
    defaultSaleMarginBp: input.defaultMarginBp,
    salePricesIncludeItbis: input.salePricesIncludeItbis,
    saleMarginBp: input.saleMarginBp,
    salePriceCents: input.salePriceCents,
  })
}

export function PurchasesClient() {
  const [supplierId, setSupplierId] = useState<string>("")
  const [supplierName, setSupplierName] = useState("")
  const [notes, setNotes] = useState("")
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [defaultProfitMarginBp, setDefaultProfitMarginBp] = useState(3000)
  const [itbisRateBp, setItbisRateBp] = useState(1800)
  const [salePricesIncludeItbis, setSalePricesIncludeItbis] = useState(true)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProductResult[]>([])
  const [isSearching, startSearch] = useTransition()

  const [cart, setCart] = useState<CartItem[]>([])
  const [updateCost, setUpdateCost] = useState(true)
  const [updatePrice, setUpdatePrice] = useState(true)
  // Estado para los valores de los inputs de descuento mientras se escriben
  const [unitCostInputs, setUnitCostInputs] = useState<Record<string, string>>({})
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({})
  const [saleMarginInputs, setSaleMarginInputs] = useState<Record<string, string>>({})
  const [salePriceInputs, setSalePriceInputs] = useState<Record<string, string>>({})

  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [isLoading, startLoading] = useTransition()
  const [isSaving, startSaving] = useTransition()

  function refreshPurchases() {
    startLoading(async () => {
      try {
        const r = await listPurchases()
        setPurchases(r)
      } catch {
        setPurchases([])
      }
    })
  }

  const selectedSupplier = supplierId ? suppliers.find((s) => s.id === supplierId) ?? null : null

  function getPurchaseItbisRateBp(supplier: Supplier | null) {
    if (supplier?.chargesItbis) return supplier.itbisRateBp ?? itbisRateBp
    return itbisRateBp
  }

  function recalcCartItem(
    item: CartItem,
    overrides?: Partial<CartItem> & { salePriceCents?: number; saleMarginBp?: number },
    purchaseItbisRateOverride?: number
  ): CartItem {
    const nextItem = { ...item, ...overrides }
    const purchaseItbisRateBp = purchaseItbisRateOverride ?? getPurchaseItbisRateBp(selectedSupplier)
    const pricing = calculatePricing({
      unitCostCents: nextItem.unitCostCents,
      discountPercentBp: nextItem.discountPercentBp,
      purchaseIncludesItbis: nextItem.purchaseIncludesItbis,
      purchaseItbisRateBp,
      productItbisRateBp: nextItem.productItbisRateBp,
      defaultMarginBp: defaultProfitMarginBp,
      salePricesIncludeItbis,
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

  useEffect(() => {
    refreshPurchases()
    Promise.all([getAllSuppliers(), getSettings()])
      .then(([supplierList, settings]) => {
        setSuppliers(supplierList)
        setDefaultProfitMarginBp(settings.defaultProfitMarginBp)
        setItbisRateBp(settings.itbisRateBp)
        setSalePricesIncludeItbis(settings.salePricesIncludeItbis)
      })
      .catch(() => { })
  }, [])

  function applySupplierSelection(nextSupplierId: string) {
    setSupplierId(nextSupplierId)

    if (!nextSupplierId) {
      setSupplierName("")
      const purchaseItbisForSupplier = itbisRateBp
      setCart((prev) =>
        prev.map((item) =>
          recalcCartItem(item, {
            discountPercentBp: 0,
            purchaseIncludesItbis: false,
          }, purchaseItbisForSupplier)
        )
      )
      return
    }

    const supplier = suppliers.find((s) => s.id === nextSupplierId)
    if (!supplier) return

    setSupplierName(supplier.name)
    const purchaseItbisForSupplier = getPurchaseItbisRateBp(supplier)
    setCart((prev) =>
      prev.map((item) =>
        recalcCartItem(item, {
          discountPercentBp: supplier.discountPercentBp,
          purchaseIncludesItbis: supplier.chargesItbis ?? false,
        }, purchaseItbisForSupplier)
      )
    )
  }

  useEffect(() => {
    const q = query.trim()
    if (!q) return

    const t = setTimeout(() => {
      startSearch(async () => {
        try {
          const r = await searchProductsForPurchase(q)
          setResults(r)
        } catch {
          setResults([])
        }
      })
    }, 200)

    return () => clearTimeout(t)
  }, [query])

  const totalCents = useMemo(() => cart.reduce((s, i) => s + i.qty * i.netCostCents, 0), [cart])

  function add(p: ProductResult) {
    setCart((prev) => {
      const existing = prev.find((x) => x.productId === p.id)
      if (existing) {
        return prev.map((x) => (x.productId === p.id ? recalcCartItem(x, { qty: x.qty + 1 }) : x))
      }

      const discountBp = selectedSupplier?.discountPercentBp ?? 0
      const unitCostCents = p.costCents ?? 0
      const purchaseIncludes = selectedSupplier ? (selectedSupplier.chargesItbis ?? false) : false
      const purchaseItbisRateBp = getPurchaseItbisRateBp(selectedSupplier)
      const pricing = calculatePricing({
        unitCostCents,
        discountPercentBp: discountBp,
        purchaseIncludesItbis: purchaseIncludes,
        purchaseItbisRateBp,
        productItbisRateBp: p.itbisRateBp ?? 0,
        defaultMarginBp: defaultProfitMarginBp,
        salePricesIncludeItbis,
      })

      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          sku: p.sku ?? null,
          reference: p.reference ?? null,
          qty: 1,
          unitCostCents,
          discountPercentBp: discountBp,
          netCostCents: pricing.netCostCents,
          salePriceCents: pricing.salePriceCents,
          saleMarginBp: pricing.saleMarginBp,
          productItbisRateBp: p.itbisRateBp ?? 0,
          purchaseIncludesItbis: pricing.purchaseIncludesItbis,
          appliedItbisRateBp: pricing.appliedItbisRateBp,
        },
      ]
    })
  }

  function normalizeCode(value: string) {
    return value.trim().toLowerCase()
  }

  function findExactSkuMatch(items: ProductResult[], value: string) {
    const normalized = normalizeCode(value)
    return items.find((item) => {
      const sku = item.sku ? normalizeCode(item.sku) : null
      return sku === normalized
    })
  }

  function handleSearchSubmit() {
    const q = query.trim()
    if (!q) return

    startSearch(async () => {
      try {
        const r = await searchProductsForPurchase(q)
        setResults(r)

        const selected = findExactSkuMatch(r, q)

        if (selected) {
          add(selected)
          setQuery("")
          setResults([])
          toast({ title: "Producto agregado", description: selected.name })
          return
        }

        if (r.length === 0) {
          toast({ title: "Producto no encontrado", description: `No hay coincidencias para: ${q}` })
          return
        }

        toast({
          title: "SKU no coincide exactamente",
          description: "El autoagregado con escáner solo funciona con SKU exacto.",
        })
      } catch {
        toast({ title: "Error", description: "No se pudo buscar el producto." })
      }
    })
  }

  async function save() {
    if (!supplierId) {
      toast({ title: "Proveedor requerido", description: "Debes seleccionar un proveedor para guardar la compra." })
      return
    }

    startSaving(async () => {
      try {
        await createPurchase({
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
          })),
          updateProductCost: updateCost,
          updateProductPrice: updatePrice,
        })

        toast({ title: "Compra registrada" })
        setSupplierId("")
        setSupplierName("")
        setNotes("")
        setCart([])
        setQuery("")
        setResults([])
        setUnitCostInputs({})
        setDiscountInputs({})
        setSaleMarginInputs({})
        setSalePriceInputs({})
        refreshPurchases()
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo registrar" })
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Registrar compra</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Proveedor (opcional)</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={supplierId}
                onChange={(e) => {
                  applySupplierSelection(e.target.value)
                }}
              >
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.discountPercentBp > 0 ? `(${(s.discountPercentBp / 100).toFixed(2)}% desc.)` : ""}
                  </option>
                ))}
              </select>
              {supplierId && (
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const supplier = suppliers.find((s) => s.id === supplierId)
                    return supplier?.discountPercentBp
                      ? `Descuento automático: ${(supplier.discountPercentBp / 100).toFixed(2)}%`
                      : "Sin descuento configurado"
                  })()}
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Nota (opcional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="rounded-md border p-3">
              <div className="grid gap-3">
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={updateCost}
                    onChange={(e) => setUpdateCost(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Actualizar costo del producto</span>
                    <span className="block text-xs text-muted-foreground">
                      Si lo activas, el costo del producto se actualizará al costo neto de esta compra.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={updatePrice}
                    onChange={(e) => setUpdatePrice(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Actualizar precio de venta</span>
                    <span className="block text-xs text-muted-foreground">
                      Si lo activas, se guardará el precio de venta calculado/ajustado de cada renglón.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <Separator />

            <div className="grid gap-2">
              <Label>Buscar producto (descripción / código / referencia)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                <Input
                  className="pl-10"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleSearchSubmit()
                    }
                  }}
                  placeholder="Ej: alfombra / 12345 / REF-01"
                />
              </div>
              {query.trim() && (
                <div className="rounded-md border">
                  {results.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      {isSearching ? "Buscando…" : "Sin resultados"}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {results.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => add(p)}
                          className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              Código: {p.sku ?? "—"} · Ref: {p.reference ?? "—"} · Stock: {p.stock}
                            </div>
                          </div>
                          <div className="text-sm font-semibold">{formatRD(p.costCents ?? 0)}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Carrito de compra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <div className="text-sm text-muted-foreground">Agrega productos para registrar una compra.</div>
            ) : (
              <div className="space-y-3">
                {cart.map((c) => (
                  <div key={c.productId} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          Código: {c.sku ?? "—"} · Ref: {c.reference ?? "—"}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setCart((p) => p.filter((x) => x.productId !== c.productId))
                          setUnitCostInputs((prev) => {
                            const newState = { ...prev }
                            delete newState[c.productId]
                            return newState
                          })
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

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="grid gap-1">
                        <div className="text-xs text-muted-foreground">Cantidad</div>
                        <Input
                          value={String(c.qty)}
                          onChange={(e) => {
                            const newQty = Math.max(1, toInt(e.target.value))
                            setCart((p) =>
                              p.map((x) =>
                                x.productId === c.productId
                                  ? {
                                    ...x,
                                    qty: newQty,
                                  }
                                  : x
                              )
                            )
                          }}
                          inputMode="numeric"
                        />
                      </div>
                      <div className="grid gap-1">
                        <div className="text-xs text-muted-foreground">Costo unitario (RD$)</div>
                        <Input
                          type="text"
                          value={unitCostInputs[c.productId] ?? (c.unitCostCents / 100).toFixed(2)}
                          onChange={(e) => {
                            const value = e.target.value
                            setUnitCostInputs((prev) => ({ ...prev, [c.productId]: value }))
                            const newCost = toCents(value)
                            setCart((p) =>
                              p.map((x) =>
                                x.productId === c.productId
                                  ? recalcCartItem(x, { unitCostCents: newCost })
                                  : x
                              )
                            )
                          }}
                          onBlur={(e) => {
                            const newCost = toCents(e.target.value)
                            setUnitCostInputs((prev) => {
                              const newState = { ...prev }
                              delete newState[c.productId]
                              return newState
                            })
                            setCart((p) =>
                              p.map((x) =>
                                x.productId === c.productId
                                  ? recalcCartItem(x, { unitCostCents: newCost })
                                  : x
                              )
                            )
                          }}
                          onFocus={() => {
                            setUnitCostInputs((prev) => ({ ...prev, [c.productId]: (c.unitCostCents / 100).toFixed(2) }))
                          }}
                          inputMode="decimal"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="grid gap-1">
                        <div className="text-xs text-muted-foreground">Descuento (%)</div>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={discountInputs[c.productId] ?? (c.discountPercentBp / 100).toFixed(2)}
                          onChange={(e) => {
                            let newValue = e.target.value

                            // Guardar el valor en el estado local
                            setDiscountInputs((prev) => ({ ...prev, [c.productId]: newValue }))

                            // Solo permitir números y un punto decimal
                            if (newValue === "") {
                              setCart((p) =>
                                p.map((x) =>
                                  x.productId === c.productId
                                    ? recalcCartItem(x, { discountPercentBp: 0 })
                                    : x
                                )
                              )
                              return
                            }

                            // Remover todo excepto números y un punto decimal
                            const cleaned = newValue.replace(/[^0-9.]/g, "")
                            const parts = cleaned.split(".")

                            // Si hay más de un punto, mantener solo el primero
                            if (parts.length > 2) {
                              newValue = parts[0] + "." + parts.slice(1).join("")
                            } else {
                              newValue = cleaned
                            }

                            // Limitar a 2 decimales
                            if (parts.length === 2 && parts[1].length > 2) {
                              newValue = parts[0] + "." + parts[1].substring(0, 2)
                            }

                            // Limitar a máximo 100
                            const discountPercent = Math.min(parseFloat(newValue) || 0, 100)
                            const discountBp = Math.round(discountPercent * 100)

                            setCart((p) =>
                              p.map((x) =>
                                x.productId === c.productId
                                  ? recalcCartItem(x, { discountPercentBp: discountBp })
                                  : x
                              )
                            )
                          }}
                          onBlur={(e) => {
                            // Al perder el foco, formatear y limpiar el estado local
                            const discountPercent = Math.min(parseFloat(e.target.value) || 0, 100)
                            const discountBp = Math.round(discountPercent * 100)

                            setDiscountInputs((prev) => {
                              const newState = { ...prev }
                              delete newState[c.productId]
                              return newState
                            })

                            setCart((p) =>
                              p.map((x) =>
                                x.productId === c.productId
                                  ? recalcCartItem(x, { discountPercentBp: discountBp })
                                  : x
                              )
                            )
                          }}
                          onFocus={() => {
                            // Al enfocar, inicializar el estado local con el valor actual
                            const currentValue = (c.discountPercentBp / 100).toFixed(2)
                            setDiscountInputs((prev) => ({ ...prev, [c.productId]: currentValue }))
                          }}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="grid gap-1">
                        <div className="text-xs text-muted-foreground">Ganancia (%)</div>
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
                      <div className="grid gap-1">
                        <div className="text-xs text-muted-foreground">Precio de venta (RD$)</div>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={salePriceInputs[c.productId] ?? (c.salePriceCents / 100).toFixed(2)}
                          onChange={(e) => {
                            const value = e.target.value
                            setSalePriceInputs((prev) => ({ ...prev, [c.productId]: value }))
                            const priceCents = toCents(value)
                            setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { salePriceCents: priceCents }) : x)))
                          }}
                          onBlur={(e) => {
                            const priceCents = toCents(e.target.value)
                            setSalePriceInputs((prev) => {
                              const newState = { ...prev }
                              delete newState[c.productId]
                              return newState
                            })
                            setCart((p) => p.map((x) => (x.productId === c.productId ? recalcCartItem(x, { salePriceCents: priceCents }) : x)))
                          }}
                          onFocus={() => {
                            setSalePriceInputs((prev) => ({ ...prev, [c.productId]: (c.salePriceCents / 100).toFixed(2) }))
                          }}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="grid gap-1">
                        <div className="text-xs text-muted-foreground">Costo neto compra</div>
                        <div className="h-10 rounded-md border bg-muted px-3 py-2 text-sm font-semibold">{formatRD(c.netCostCents)}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-muted-foreground">
                      Descuento proveedor aplicado: {(c.discountPercentBp / 100).toFixed(2)}% · Compra con ITBIS incluido: {selectedSupplier ? (selectedSupplier.chargesItbis ? "No" : "Sí") : (c.purchaseIncludesItbis ? "No" : "Sí")} · Venta con ITBIS: {c.appliedItbisRateBp > 0 ? "Sí" : "No"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      NOTA: Si quieres que el producto se venda con o sin ITBIS debes modificar el perfil del producto y ponerlo como exento.
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      NOTA2: Si quieres que el producto su compra sea con o sin ITBIS debes modificar el perfil del proveedor.
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-md border bg-muted/50 p-2">
                      <div className="text-xs text-muted-foreground">Total línea:</div>
                      <div className="text-sm font-semibold">{formatRD(c.qty * c.netCostCents)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Total compra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-4xl font-semibold tracking-tight">{formatRD(totalCents)}</div>
            <Button className="w-full" size="lg" disabled={cart.length === 0 || isSaving || !supplierId} onClick={save}>
              {isSaving ? "Guardando…" : "Guardar compra"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compras recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {purchases.length === 0 ? (
              <div className="text-sm text-muted-foreground">{isLoading ? "Cargando…" : "Sin compras registradas"}</div>
            ) : (
              purchases.map((p) => (
                <div key={p.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShoppingBag className="h-4 w-4" /> Compra
                    </div>
                    <div className="font-semibold">{formatRD(p.totalCents)}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {p.supplierName ? `Suplidor: ${p.supplierName} · ` : ""}
                    Items: {p.items.length}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
