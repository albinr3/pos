"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Plus, Search, Trash2, FileText, Grid3x3, List } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { PriceInput } from "@/components/app/price-input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { formatRD, calcItbisIncluded, toCents } from "@/lib/money"
import { toast } from "@/hooks/use-toast"

import { getCurrentUserStub } from "@/lib/auth-stub"

import { createQuote, listCustomers, searchProducts } from "./actions"
import { listAllProductsForSale } from "../sales/actions"

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

export function QuotesClient() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProductResult[]>([])
  const [isSearching, startSearch] = useTransition()
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [allProducts, setAllProducts] = useState<ProductResult[]>([])
  const [isLoadingProducts, startLoadingProducts] = useTransition()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string | null>("generic")

  const [cart, setCart] = useState<CartItem[]>([])
  const [shippingInput, setShippingInput] = useState("")
  const [validUntilInput, setValidUntilInput] = useState("")
  const [notes, setNotes] = useState("")
  const user = useMemo(() => getCurrentUserStub(), [])
  const [isSaving, startSave] = useTransition()

  useEffect(() => {
    listCustomers().then(setCustomers).catch(() => {})
    // Cargar preferencia de vista desde localStorage
    const savedViewMode = localStorage.getItem("quotesViewMode") as "list" | "grid" | null
    if (savedViewMode) {
      setViewMode(savedViewMode)
    }
  }, [])

  useEffect(() => {
    // Cargar todos los productos cuando se cambia a vista de grid
    if (viewMode === "grid") {
      startLoadingProducts(async () => {
        try {
          const products = await listAllProductsForSale()
          setAllProducts(products)
        } catch {
          setAllProducts([])
        }
      })
    }
    // Guardar preferencia
    localStorage.setItem("quotesViewMode", viewMode)
  }, [viewMode])

  useEffect(() => {
    const q = query.trim()
    
    const handle = setTimeout(() => {
      if (q) {
        startSearch(async () => {
          try {
            const r = await searchProducts(q)
            setResults(r)
          } catch {
            setResults([])
          }
        })
      } else {
        // Si no hay query y estamos en vista de grid, cargar todos los productos
        if (viewMode === "grid") {
          startLoadingProducts(async () => {
            try {
              const products = await listAllProductsForSale()
              setAllProducts(products)
            } catch {
              setAllProducts([])
            }
          })
        } else {
          setResults([])
        }
      }
    }, 200)

    return () => clearTimeout(handle)
  }, [query, viewMode])

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
        const validUntil = validUntilInput ? new Date(validUntilInput) : null

        const quote = await createQuote({
          customerId: customerId === "generic" ? null : customerId,
          items: cart.map((c) => ({
            productId: c.productId,
            qty: c.qty,
            unitPriceCents: c.unitPriceCents,
            wasPriceOverridden: c.wasPriceOverridden,
          })),
          shippingCents: shippingCents > 0 ? shippingCents : undefined,
          validUntil: validUntil,
          notes: notes || undefined,
          username: user.username,
        })

        toast({ title: "Cotización guardada", description: `Cotización ${quote.quoteCode}` })
        setCart([])
        setShippingInput("")
        setValidUntilInput("")
        setNotes("")
        setQuery("")
        setResults([])

        // Redirigir a la página de visualización/PDF
        router.push(`/quotes/${quote.quoteCode}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error guardando cotización"
        toast({ title: "No se pudo guardar", description: msg })
      }
    })
  }

  function getCartQuantity(productId: string) {
    const item = cart.find((c) => c.productId === productId)
    return item?.qty ?? 0
  }

  return (
    <div className={`grid gap-6 ${viewMode === "grid" ? "lg:grid-cols-[1fr_400px]" : "lg:grid-cols-[1fr_380px]"}`}>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Nueva Cotización</CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <List className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Lista</span>
                </div>
                <Switch
                  checked={viewMode === "grid"}
                  onCheckedChange={(checked) => setViewMode(checked ? "grid" : "list")}
                  aria-label="Cambiar vista"
                />
                <div className="flex items-center gap-2">
                  <Grid3x3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Imágenes</span>
                </div>
              </div>
            </div>
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

            <div className="grid gap-2">
              <Label>Válida hasta (opcional)</Label>
              <Input
                type="date"
                value={validUntilInput}
                onChange={(e) => setValidUntilInput(e.target.value)}
              />
            </div>

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
            {viewMode === "list" ? (
              // Vista de lista (original)
              query.trim() && (
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
              )
            ) : (
              // Vista de grid (imágenes)
              <div className="space-y-4">
                {query.trim() ? (
                  // Mostrar resultados de búsqueda en grid
                  results.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      {isSearching ? "Buscando…" : "Sin resultados"}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                      {results.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => addToCart(p)}
                          className="group relative flex flex-col rounded-lg border-2 border-border hover:border-purple-primary transition-colors bg-card shadow-sm"
                        >
                          <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden rounded-t-lg">
                            {p.imageUrls && p.imageUrls.length > 0 ? (
                              <img
                                src={p.imageUrls[0]}
                                alt={p.name}
                                className="object-contain max-w-full max-h-full"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                <div className="text-center p-4">
                                  <div className="text-2xl mb-1">{p.name.charAt(0).toUpperCase()}</div>
                                  <div className="text-xs">Sin imagen</div>
                                </div>
                              </div>
                            )}
                            {getCartQuantity(p.id) > 0 ? (
                              <div className="absolute top-2 right-2 bg-purple-primary text-white rounded-full min-w-[24px] h-6 px-2 flex items-center justify-center text-xs font-semibold shadow-lg">
                                {getCartQuantity(p.id)}
                              </div>
                            ) : (
                              <div className="absolute top-2 right-2 bg-purple-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                <Plus className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div className="p-3 space-y-1">
                            <div className="font-medium text-sm truncate">{p.name}</div>
                            <div className="text-sm font-semibold text-purple-primary">{formatRD(p.priceCents)}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.stock} disponible{p.stock !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  // Mostrar todos los productos en grid
                  isLoadingProducts ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Cargando productos…</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                      {/* Tarjeta para crear producto */}
                      <Link
                        href="/products"
                        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-purple-primary transition-colors bg-muted/30 aspect-square p-4 text-center"
                      >
                        <Plus className="h-12 w-12 text-muted-foreground mb-2" />
                        <span className="text-sm font-medium text-muted-foreground">Crear producto</span>
                      </Link>

                      {allProducts.map((p) => {
                        const cartQty = getCartQuantity(p.id)
                        return (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => addToCart(p)}
                            className="group relative flex flex-col rounded-lg border-2 border-border hover:border-purple-primary transition-colors bg-card shadow-sm"
                          >
                            <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden rounded-t-lg">
                              {p.imageUrls && p.imageUrls.length > 0 ? (
                                <img
                                  src={p.imageUrls[0]}
                                  alt={p.name}
                                  className="object-contain max-w-full max-h-full"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                  <div className="text-center p-4">
                                    <div className="text-2xl mb-1">{p.name.charAt(0).toUpperCase()}</div>
                                    <div className="text-xs">Sin imagen</div>
                                  </div>
                                </div>
                              )}
                              {cartQty > 0 ? (
                                <div className="absolute top-2 right-2 bg-purple-primary text-white rounded-full min-w-[24px] h-6 px-2 flex items-center justify-center text-xs font-semibold shadow-lg">
                                  {cartQty}
                                </div>
                              ) : (
                                <div className="absolute top-2 right-2 bg-purple-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Plus className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                            <div className="p-3 space-y-1">
                              <div className="font-medium text-sm truncate">{p.name}</div>
                              <div className="text-sm font-semibold text-purple-primary">{formatRD(p.priceCents)}</div>
                              <div className="text-xs text-muted-foreground">
                                {p.stock} disponible{p.stock !== 1 ? "s" : ""}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            )}
            </div>
          </CardContent>
        </Card>

        {viewMode === "list" && (
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
        )}

        {viewMode === "grid" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Productos</CardTitle>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const element = document.getElementById("cart-summary")
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  }}
                  className="text-sm text-purple-primary hover:underline"
                >
                  Ver carrito ({cart.length})
                </button>
              )}
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {cart.length === 0
                  ? "Agrega productos al carrito haciendo clic en las imágenes."
                  : `Tienes ${cart.length} producto${cart.length !== 1 ? "s" : ""} en el carrito.`}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4" id="cart-summary">
        <Card>
          <CardHeader>
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-4xl font-semibold tracking-tight" suppressHydrationWarning>
              {formatRD(totalCents)}
            </div>
            {viewMode === "grid" && cart.length > 0 && (
              <div className="rounded-md border p-3 space-y-2 max-h-[200px] overflow-y-auto">
                {cart.map((c) => (
                  <div key={c.productId} className="flex items-center justify-between text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.qty} x {formatRD(c.unitPriceCents)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">{formatRD(c.unitPriceCents * c.qty)}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setCart((p) => p.filter((x) => x.productId !== c.productId))}
                        aria-label="Quitar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
              <div className="grid gap-2">
                <Label>Notas (opcional)</Label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Notas adicionales para la cotización..."
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
              {isSaving ? "Guardando…" : "Guardar y generar PDF"}
            </Button>
            <div className="text-xs text-muted-foreground">
              Precios incluyen ITBIS. Se generará un PDF para compartir.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}










