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

import { createPurchase, listPurchases, searchProductsForPurchase } from "./actions"
import { getAllSuppliers } from "../suppliers/actions"

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
}

type Supplier = Awaited<ReturnType<typeof getAllSuppliers>>[number] & { chargesItbis?: boolean }

function toInt(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

// Calcular costo neto: (costo - descuento) * (1 + ITBIS)
function calculateNetCost(unitCostCents: number, discountPercentBp: number, chargesItbis: boolean): number {
  const discountRate = discountPercentBp / 10000
  const costAfterDiscount = unitCostCents * (1 - discountRate)
  const itbisRate = chargesItbis ? 0.18 : 0
  const netCost = costAfterDiscount * (1 + itbisRate)
  return Math.round(netCost)
}

export function PurchasesClient() {
  const [supplierId, setSupplierId] = useState<string>("")
  const [supplierName, setSupplierName] = useState("")
  const [notes, setNotes] = useState("")
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProductResult[]>([])
  const [isSearching, startSearch] = useTransition()

  const [cart, setCart] = useState<CartItem[]>([])
  const [updateCost, setUpdateCost] = useState(true)
  // Estado para los valores de los inputs de descuento mientras se escriben
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({})

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

  useEffect(() => {
    refreshPurchases()
    getAllSuppliers().then(setSuppliers).catch(() => { })
  }, [])

  // Cuando se selecciona un proveedor, aplicar su descuento a los items del carrito
  useEffect(() => {
    if (supplierId && suppliers.length > 0) {
      const supplier = suppliers.find((s) => s.id === supplierId)
      if (supplier) {
        setSupplierName(supplier.name)
        // Aplicar descuento del proveedor a items sin descuento personalizado
        setCart((prev) =>
          prev.map((item) => {
            // Solo aplicar si el item no tiene descuento personalizado (0)
            const discountBp = item.discountPercentBp > 0 ? item.discountPercentBp : supplier.discountPercentBp
            const chargesItbis = supplier.chargesItbis ?? false
            return {
              ...item,
              discountPercentBp: discountBp,
              netCostCents: calculateNetCost(item.unitCostCents, discountBp, chargesItbis),
            }
          })
        )
      }
    } else {
      setSupplierName("")
    }
  }, [supplierId, suppliers])

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
        return prev.map((x) => {
          if (x.productId === p.id) {
            const discountBp = x.discountPercentBp
            const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : null
            const chargesItbis = supplier ? (supplier.chargesItbis ?? false) : true
            return {
              ...x,
              qty: x.qty + 1,
              netCostCents: calculateNetCost(x.unitCostCents, discountBp, chargesItbis),
            }
          }
          return x
        })
      }
      const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : null
      const discountBp = supplier?.discountPercentBp ?? 0
      // Default to true (legacy) if no supplier, or use supplier setting
      const chargesItbis = supplier ? (supplier.chargesItbis ?? false) : true
      const unitCostCents = p.costCents ?? 0
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
          netCostCents: calculateNetCost(unitCostCents, discountBp, chargesItbis),
        },
      ]
    })
  }

  async function save() {
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
          })),
          updateProductCost: updateCost,
        })

        toast({ title: "Compra registrada" })
        setSupplierId("")
        setSupplierName("")
        setNotes("")
        setCart([])
        setQuery("")
        setResults([])
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
                  setSupplierId(e.target.value)
                  if (!e.target.value) {
                    setSupplierName("")
                    // Remover descuentos cuando no hay proveedor
                    setCart((prev) =>
                      prev.map((item) => ({
                        ...item,
                        discountPercentBp: 0,
                        // If no supplier, default ITBIS = true
                        netCostCents: calculateNetCost(item.unitCostCents, 0, true),
                      }))
                    )
                  }
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
                    Si lo activas, el costo del producto se actualizará al costo unitario de esta compra.
                  </span>
                </span>
              </label>
            </div>

            <Separator />

            <div className="grid gap-2">
              <Label>Buscar producto (descripción / código / referencia)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                <Input className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej: alfombra / 12345 / REF-01" />
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
                          setDiscountInputs((prev) => {
                            const newState = { ...prev }
                            delete newState[c.productId]
                            return newState
                          })
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-1">
                        <div className="text-xs text-muted-foreground">Cantidad</div>
                        <Input
                          value={String(c.qty)}
                          onChange={(e) => {
                            const newQty = Math.max(1, toInt(e.target.value))
                            const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : null
                            const chargesItbis = supplier ? (supplier.chargesItbis ?? false) : true
                            setCart((p) =>
                              p.map((x) =>
                                x.productId === c.productId
                                  ? {
                                    ...x,
                                    qty: newQty,
                                    netCostCents: calculateNetCost(x.unitCostCents, x.discountPercentBp, chargesItbis),
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
                          value={((c.unitCostCents ?? 0) / 100).toFixed(2)}
                          onChange={(e) => {
                            const newCost = toCents(e.target.value)
                            const discountBp = c.discountPercentBp
                            const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : null
                            const chargesItbis = supplier ? (supplier.chargesItbis ?? false) : true
                            setCart((p) =>
                              p.map((x) =>
                                x.productId === c.productId
                                  ? {
                                    ...x,
                                    unitCostCents: newCost,
                                    netCostCents: calculateNetCost(newCost, discountBp, chargesItbis),
                                  }
                                  : x
                              )
                            )
                          }}
                          inputMode="decimal"
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

                            const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : null
                            const chargesItbis = supplier ? (supplier.chargesItbis ?? false) : true

                            // Solo permitir números y un punto decimal
                            if (newValue === "") {
                              setCart((p) =>
                                p.map((x) =>
                                  x.productId === c.productId
                                    ? {
                                      ...x,
                                      discountPercentBp: 0,
                                      netCostCents: calculateNetCost(x.unitCostCents, 0, chargesItbis),
                                    }
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
                                  ? {
                                    ...x,
                                    discountPercentBp: discountBp,
                                    netCostCents: calculateNetCost(x.unitCostCents, discountBp, chargesItbis),
                                  }
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

                            const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : null
                            const chargesItbis = supplier ? (supplier.chargesItbis ?? false) : true

                            setCart((p) =>
                              p.map((x) =>
                                x.productId === c.productId
                                  ? {
                                    ...x,
                                    discountPercentBp: discountBp,
                                    netCostCents: calculateNetCost(x.unitCostCents, discountBp, chargesItbis),
                                  }
                                  : x
                              )
                            )
                          }}
                          onFocus={(e) => {
                            // Al enfocar, inicializar el estado local con el valor actual
                            const currentValue = (c.discountPercentBp / 100).toFixed(2)
                            setDiscountInputs((prev) => ({ ...prev, [c.productId]: currentValue }))
                          }}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="grid gap-1">
                        <div className="text-xs text-muted-foreground">Costo neto (con ITBIS)</div>
                        <div className="h-10 rounded-md border bg-muted px-3 py-2 text-sm font-semibold">{formatRD(c.netCostCents)}</div>
                      </div>
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
            <Button className="w-full" size="lg" disabled={cart.length === 0 || isSaving} onClick={save}>
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
