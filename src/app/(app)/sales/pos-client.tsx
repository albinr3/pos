"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { SaleType, PaymentMethod } from "@prisma/client"
import { Plus, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PriceInput } from "@/components/app/price-input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { formatRD, calcItbisIncluded, toCents } from "@/lib/money"
import { toast } from "@/hooks/use-toast"

import { getCurrentUserStub } from "@/lib/auth-stub"

import { createSale, listCustomers, searchProducts } from "./actions"
import { getSalesConfig } from "./user-settings"

type ProductResult = Awaited<ReturnType<typeof searchProducts>>[number]

type CartItem = {
  productId: string
  name: string
  sku: string | null
  reference: string | null
  stock: number
  qty: number
  unitPriceCents: number
  wasPriceOverridden: boolean
}

type Customer = Awaited<ReturnType<typeof listCustomers>>[number]

export function PosClient() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProductResult[]>([])
  const [isSearching, startSearch] = useTransition()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string | null>("generic")
  const [saleType, setSaleType] = useState<SaleType>(SaleType.CONTADO)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(PaymentMethod.EFECTIVO)

  const [cart, setCart] = useState<CartItem[]>([])
  const [shippingInput, setShippingInput] = useState("")
  const [allowNegativeStock, setAllowNegativeStock] = useState(false)
  const user = useMemo(() => getCurrentUserStub(), [])
  const [isSaving, startSave] = useTransition()

  useEffect(() => {
    listCustomers().then(setCustomers).catch(() => {})
    getSalesConfig().then((c) => setAllowNegativeStock(c.allowNegativeStock)).catch(() => {})
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!q) return

    const handle = setTimeout(() => {
      startSearch(async () => {
        try {
          const r = await searchProducts(q)
          setResults(r)
        } catch {
          setResults([])
        }
      })
    }, 200)

    return () => clearTimeout(handle)
  }, [query])

  const itemsTotalCents = useMemo(() => cart.reduce((s, i) => s + i.unitPriceCents * i.qty, 0), [cart])
  const { subtotalCents, itbisCents } = useMemo(() => calcItbisIncluded(itemsTotalCents, 1800), [itemsTotalCents])
  const shippingCents = useMemo(() => toCents(shippingInput), [shippingInput])
  const totalCents = useMemo(() => itemsTotalCents + shippingCents, [itemsTotalCents, shippingCents])

  function addToCart(p: ProductResult) {
    setCart((prev) => {
      const existing = prev.find((x) => x.productId === p.id)
      if (existing) {
        return prev.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x))
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          sku: p.sku ?? null,
          reference: p.reference ?? null,
          stock: p.stock,
          qty: 1,
          unitPriceCents: p.priceCents,
          wasPriceOverridden: false,
        },
      ]
    })
  }

  async function onSave() {
    startSave(async () => {
      try {
        if (saleType === SaleType.CREDITO && (!customerId || customerId === "generic")) {
          toast({ title: "Crédito", description: "Para crédito debes seleccionar un cliente." })
          return
        }

        if (saleType === SaleType.CONTADO && !paymentMethod) {
          toast({ title: "Método de pago", description: "Debes seleccionar un método de pago para ventas al contado." })
          return
        }

        const sale = await createSale({
          customerId: customerId === "generic" ? "generic" : customerId,
          type: saleType,
          paymentMethod: saleType === SaleType.CONTADO ? paymentMethod : null,
          items: cart.map((c) => ({
            productId: c.productId,
            qty: c.qty,
            unitPriceCents: c.unitPriceCents,
            wasPriceOverridden: c.wasPriceOverridden,
          })),
          shippingCents: shippingCents > 0 ? shippingCents : undefined,
          username: user.username,
        })

        toast({ title: "Venta guardada", description: `Factura ${sale.invoiceCode}` })
        setCart([])
        setShippingInput("")
        setQuery("")
        setResults([])
        if (saleType === SaleType.CONTADO) {
          setPaymentMethod(PaymentMethod.EFECTIVO)
        }

        // Thermal receipt by default
        window.open(`/receipts/sale/${sale.invoiceCode}`, "_blank")
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error guardando venta"
        toast({ title: "No se pudo guardar", description: msg })
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Venta</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Cliente</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={customerId ?? ""}
                onChange={(e) => setCustomerId(e.target.value || null)}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.isGeneric ? "(Genérico) " : ""}{c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={saleType === SaleType.CONTADO ? "default" : "secondary"}
                onClick={() => {
                  setSaleType(SaleType.CONTADO)
                  if (!paymentMethod) setPaymentMethod(PaymentMethod.EFECTIVO)
                }}
              >
                Contado
              </Button>
              <Button
                type="button"
                variant={saleType === SaleType.CREDITO ? "default" : "secondary"}
                onClick={() => setSaleType(SaleType.CREDITO)}
              >
                Crédito
              </Button>
            </div>

            {saleType === SaleType.CONTADO && (
              <div className="grid gap-2">
                <Label>Método de pago</Label>
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={paymentMethod ?? ""}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value={PaymentMethod.EFECTIVO}>Efectivo</option>
                  <option value={PaymentMethod.TRANSFERENCIA}>Transferencia</option>
                  <option value={PaymentMethod.TARJETA}>Tarjeta</option>
                </select>
              </div>
            )}

            <Separator />

            <div className="grid gap-2">
              <Label>Buscar producto (descripción / código / referencia)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10"
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
                          onClick={() => addToCart(p)}
                          className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              Código: {p.sku ?? "—"} · Ref: {p.reference ?? "—"} · Stock: {p.stock}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold">{formatRD(p.priceCents)}</div>
                            <Plus className="h-4 w-4 text-muted-foreground" />
                          </div>
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
            <CardTitle>Carrito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <div className="text-sm text-muted-foreground">Agrega productos para empezar.</div>
            ) : (
              <div className="space-y-3">
                {cart.map((c) => (
                  <div key={c.productId} className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        Código: {c.sku ?? "—"} · Ref: {c.reference ?? "—"}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setCart((p) =>
                              p.map((x) =>
                                x.productId === c.productId ? { ...x, qty: Math.max(1, x.qty - 1) } : x
                              )
                            )
                          }
                        >
                          -
                        </Button>
                        <div className="w-10 text-center text-sm font-semibold">{c.qty}</div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setCart((p) => p.map((x) => (x.productId === c.productId ? { ...x, qty: x.qty + 1 } : x)))
                          }
                        >
                          +
                        </Button>
                        <div className="ml-2 text-sm text-muted-foreground">x</div>
                        {user.canOverridePrice ? (
                          <div className="w-28">
                            <PriceInput
                              valueCents={c.unitPriceCents}
                              onChangeCents={(unitPriceCents) =>
                                setCart((p) =>
                                  p.map((x) =>
                                    x.productId === c.productId
                                      ? {
                                          ...x,
                                          unitPriceCents,
                                          wasPriceOverridden: unitPriceCents !== c.unitPriceCents ? true : x.wasPriceOverridden,
                                        }
                                      : x
                                  )
                                )
                              }
                            />
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">{formatRD(c.unitPriceCents)}</div>
                        )}
                      </div>
                      {!allowNegativeStock && c.qty > c.stock && (
                        <div className="mt-2 text-xs font-medium text-destructive">
                          Stock insuficiente (Stock: {c.stock}). Ajustes → “Permitir vender sin stock”.
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-sm font-semibold">{formatRD(c.unitPriceCents * c.qty)}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setCart((p) => p.filter((x) => x.productId !== c.productId))}
                        aria-label="Quitar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-4xl font-semibold tracking-tight" suppressHydrationWarning>
              {formatRD(totalCents)}
            </div>
            <div className="grid gap-2">
              <div className="grid gap-2">
                <Label>Flete (opcional)</Label>
                <Input
                  value={shippingInput}
                  onChange={(e) => setShippingInput(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid gap-1 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span suppressHydrationWarning>{formatRD(subtotalCents)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>ITBIS (18% incluido)</span>
                <span suppressHydrationWarning>{formatRD(itbisCents)}</span>
              </div>
              {shippingCents > 0 && (
                <div className="flex items-center justify-between">
                  <span>Flete</span>
                  <span suppressHydrationWarning>{formatRD(shippingCents)}</span>
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between text-base font-semibold text-foreground">
                <span>Total</span>
                <span suppressHydrationWarning>{formatRD(totalCents)}</span>
              </div>
            </div>
            <Button
              type="button"
              className="w-full"
              size="lg"
              disabled={isSaving || cart.length === 0}
              onClick={onSave}
            >
              {isSaving ? "Guardando…" : "Guardar e imprimir"}
            </Button>
            <div className="text-xs text-muted-foreground">
              Precios incluyen ITBIS. Factura tamaño carta con serie A.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
