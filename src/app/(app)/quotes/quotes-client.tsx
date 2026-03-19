"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { ProductKind, UnitType } from "@prisma/client"
import { Plus, Search, Trash2, Grid3x3, List } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PriceInput } from "@/components/app/price-input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { formatRD, calcItbisIncluded, toCents } from "@/lib/money"
import { formatQty, formatQtyNumber, parseQty, unitAllowsDecimals } from "@/lib/units"
import { applyRecipeAdjustmentsWithScope, sortRecipeAdjustments, type RecipeApplyScope } from "@/lib/recipe-adjustment-scope"
import { toast } from "@/hooks/use-toast"

import type { CurrentUser } from "@/lib/auth"

import { createQuote, getQuoteById, listAllProductsForQuotes, listCustomers, searchProducts, updateQuote } from "./actions"

type ProductResult = Awaited<ReturnType<typeof searchProducts>>[number]

type RecipeAdjustment = {
  ingredientId: string
  ingredientName: string
  adjustmentType: "SIN" | "EXTRA"
}

type RecipeItem = NonNullable<ProductResult["recipeItems"]>[number]

type CartItem = {
  lineId: string
  productId: string
  name: string
  sku: string | null
  reference: string | null
  stock: number
  qty: number
  unitPriceCents: number
  wasPriceOverridden: boolean
  unit: UnitType
  itbisRateBp: number
  productKind: ProductKind
  recipeItems: RecipeItem[]
  recipeAdjustments: RecipeAdjustment[]
}

type Customer = Awaited<ReturnType<typeof listCustomers>>[number]

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000
}

function buildCartLineId(productId: string, recipeAdjustments: RecipeAdjustment[]) {
  const adjustmentsKey = recipeAdjustments
    .map((adjustment) => `${adjustment.ingredientId}:${adjustment.adjustmentType}`)
    .sort()
    .join(",")
  return adjustmentsKey ? `${productId}::${adjustmentsKey}` : productId
}

function formatAdjustmentLabel(adjustment: RecipeAdjustment) {
  return `${adjustment.adjustmentType === "SIN" ? "Sin" : "Extra"} ${adjustment.ingredientName}`
}

function getRecipeVariantLabels(recipeAdjustments: RecipeAdjustment[]) {
  if (recipeAdjustments.length === 0) return ["Normal"]
  return recipeAdjustments.map(formatAdjustmentLabel)
}

function formatQtyBadge(value: number) {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, "")
}

export function QuotesClient({ defaultViewMode = "list", itbisRateBp = 1800 }: { defaultViewMode?: string; itbisRateBp?: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editQuoteId = searchParams.get("edit")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProductResult[]>([])
  const [isSearching, startSearch] = useTransition()
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window === "undefined") return defaultViewMode === "grid" ? "grid" : "list"
    const saved = localStorage.getItem("quotesViewMode")
    if (saved === "grid" || saved === "list") return saved
    return defaultViewMode === "grid" ? "grid" : "list"
  })
  const [allProducts, setAllProducts] = useState<ProductResult[]>([])
  const [isLoadingProducts, startLoadingProducts] = useTransition()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string | null>("generic")

  const [cart, setCart] = useState<CartItem[]>([])
  const [shippingInput, setShippingInput] = useState("")
  const [validUntilInput, setValidUntilInput] = useState("")
  const [notes, setNotes] = useState("")
  const [user, setUser] = useState<CurrentUser | null>(null)
  const canOverridePrice = Boolean(user?.canOverridePrice || user?.isOwner)
  const [isSaving, startSave] = useTransition()
  const [isLoadingQuote, startLoadingQuote] = useTransition()
  const [editingQuoteCode, setEditingQuoteCode] = useState<string | null>(null)
  const [recipeDialogLineId, setRecipeDialogLineId] = useState<string | null>(null)
  const [recipeDialogMode, setRecipeDialogMode] = useState<"SIN" | "EXTRA" | null>(null)
  const [recipeApplyScope, setRecipeApplyScope] = useState<RecipeApplyScope>("ONE")
  const [recipeDraftByIngredient, setRecipeDraftByIngredient] = useState<Record<string, "SIN" | "EXTRA">>({})
  const recipeDialogCartItem = useMemo(
    () => cart.find((item) => item.lineId === recipeDialogLineId) ?? null,
    [cart, recipeDialogLineId]
  )

  function resetForm() {
    setCustomerId("generic")
    setCart([])
    setShippingInput("")
    setValidUntilInput("")
    setNotes("")
    setQuery("")
    setResults([])
  }

  useEffect(() => {
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

  useEffect(() => {
    listCustomers()
      .then((data) => {
        const sorted = [...data].sort((a, b) => {
          if (a.isGeneric && !b.isGeneric) return -1
          if (!a.isGeneric && b.isGeneric) return 1
          return a.name.localeCompare(b.name, "es", { sensitivity: "base" })
        })
        setCustomers(sorted)
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    if (!editQuoteId) return

    startLoadingQuote(async () => {
      try {
        const quote = await getQuoteById(editQuoteId)
        if (!quote) {
          toast({ title: "Cotización no encontrada", description: "No se pudo cargar la cotización para editar" })
          router.replace("/quotes")
          return
        }

        setCustomerId(quote.customerId ?? "generic")
        setCart(
          quote.items.map((item) => {
            const recipeAdjustments: RecipeAdjustment[] = (item.recipeAdjustments ?? []).map((adjustment) => ({
              ingredientId: adjustment.ingredientId,
              ingredientName: adjustment.ingredientName,
              adjustmentType: adjustment.type,
            }))
            const lineId = buildCartLineId(item.productId, recipeAdjustments)

            return {
              lineId,
              productId: item.productId,
              name: item.product?.name ?? "Producto",
              sku: item.product?.sku ?? null,
              reference: item.product?.reference ?? null,
              stock: Number(item.product?.stock ?? 0),
              qty: Number(item.qty),
              unitPriceCents: item.unitPriceCents,
              wasPriceOverridden: item.wasPriceOverridden,
              unit: (item.product?.unit as UnitType) ?? UnitType.UNIDAD,
              itbisRateBp: item.product?.itbisRateBp ?? itbisRateBp,
              productKind: (item.product?.productKind as ProductKind) ?? ProductKind.BASIC,
              recipeItems: (item.product?.recipeItems ?? []).map((recipeItem) => {
                const ingredientNameValue =
                  "ingredientName" in recipeItem
                    ? recipeItem.ingredientName
                    : recipeItem.ingredient?.name ?? "Ingrediente"
                const ingredientUnitValue =
                  "ingredientUnit" in recipeItem
                    ? recipeItem.ingredientUnit
                    : recipeItem.ingredient?.unit ?? UnitType.UNIDAD
                return {
                  ingredientId: recipeItem.ingredientId,
                  qty: Number(recipeItem.qty),
                  ingredientName: String(ingredientNameValue ?? "Ingrediente"),
                  ingredientUnit: (ingredientUnitValue as UnitType) ?? UnitType.UNIDAD,
                }
              }),
              recipeAdjustments,
            }
          })
        )
        setShippingInput(quote.shippingCents > 0 ? (quote.shippingCents / 100).toFixed(2) : "")
        setValidUntilInput(quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : "")
        setNotes(quote.notes ?? "")
        setQuery("")
        setResults([])
        setEditingQuoteCode(quote.quoteCode)
      } catch {
        toast({ title: "Error", description: "No se pudo cargar la cotización para editar" })
      }
    })
  }, [editQuoteId, router, itbisRateBp])

  useEffect(() => {
    // Cargar todos los productos cuando se cambia a vista de grid
    if (viewMode === "grid") {
      startLoadingProducts(async () => {
        try {
          const products = await listAllProductsForQuotes()
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
              const products = await listAllProductsForQuotes()
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

  const itemsTotalCents = useMemo(
    () => cart.reduce((s, i) => s + Math.round(i.unitPriceCents * i.qty), 0),
    [cart]
  )
  const { subtotalCents, itbisCents } = useMemo(() => {
    let totalSubtotal = 0
    let totalItbis = 0
    for (const item of cart) {
      const lineTotal = Math.round(item.unitPriceCents * item.qty)
      const { subtotalCents: lineSub, itbisCents: lineItbis } = calcItbisIncluded(lineTotal, item.itbisRateBp)
      totalSubtotal += lineSub
      totalItbis += lineItbis
    }
    return { subtotalCents: totalSubtotal, itbisCents: totalItbis }
  }, [cart])
  const shippingCents = useMemo(() => toCents(shippingInput), [shippingInput])
  const totalCents = useMemo(() => itemsTotalCents + shippingCents, [itemsTotalCents, shippingCents])
  const itbisLabel = useMemo(() => {
    if (cart.length === 0) {
      return `ITBIS (${(itbisRateBp / 100).toFixed(2)}% incluido)`
    }
    const uniqueRates = Array.from(new Set(cart.map((item) => item.itbisRateBp)))
    if (uniqueRates.length === 1) {
      return `ITBIS (${(uniqueRates[0] / 100).toFixed(2)}% incluido)`
    }
    return "ITBIS (incluido)"
  }, [cart, itbisRateBp])

  function addToCart(p: ProductResult, recipeAdjustments: RecipeAdjustment[] = []) {
    const productUnit = (p.unit as UnitType) ?? UnitType.UNIDAD
    const increment = unitAllowsDecimals(productUnit) ? 0.5 : 1
    const normalizedAdjustments = sortRecipeAdjustments(recipeAdjustments)
    const lineId = buildCartLineId(p.id, normalizedAdjustments)

    setCart((prev) => {
      const existing = prev.find((x) => x.lineId === lineId)
      if (existing) {
        return prev.map((x) =>
          x.lineId === lineId
            ? { ...x, qty: roundQty(x.qty + increment) }
            : x
        )
      }
      return [
        ...prev,
        {
          lineId,
          productId: p.id,
          name: p.name,
          sku: p.sku ?? null,
          reference: p.reference ?? null,
          stock: p.stock,
          qty: increment,
          unitPriceCents: p.priceCents,
          wasPriceOverridden: false,
          unit: productUnit,
          itbisRateBp: p.itbisRateBp ?? itbisRateBp,
          productKind: (p.productKind as ProductKind) ?? ProductKind.BASIC,
          recipeItems: p.recipeItems ?? [],
          recipeAdjustments: normalizedAdjustments,
        },
      ]
    })
  }

  function closeRecipeDialog() {
    setRecipeDialogLineId(null)
    setRecipeDialogMode(null)
    setRecipeApplyScope("ONE")
    setRecipeDraftByIngredient({})
  }

  function openRecipeDialogForCartItem(item: CartItem) {
    setRecipeDialogLineId(item.lineId)
    setRecipeDialogMode(null)
    setRecipeApplyScope(item.qty > 1 ? "ONE" : "ALL")
    setRecipeDraftByIngredient(
      item.recipeAdjustments.reduce<Record<string, "SIN" | "EXTRA">>((acc, adjustment) => {
        acc[adjustment.ingredientId] = adjustment.adjustmentType
        return acc
      }, {})
    )
  }

  function resolveRecipeApplyScope(item: CartItem | null, scope: RecipeApplyScope): RecipeApplyScope {
    if (!item) return "ALL"
    return scope === "ONE" && item.qty > 1 ? "ONE" : "ALL"
  }

  function applyRecipeAdjustmentsToCartLine(
    lineId: string,
    recipeAdjustments: RecipeAdjustment[],
    scope: RecipeApplyScope
  ) {
    setCart((prev) =>
      applyRecipeAdjustmentsWithScope({
        lines: prev,
        lineId,
        recipeAdjustments,
        scope,
        buildLineId: buildCartLineId,
        splitQty: 1,
      })
    )
  }

  async function onSave() {
    startSave(async () => {
      try {
        const validUntil = validUntilInput ? new Date(validUntilInput) : null

        if (editQuoteId) {
          await updateQuote({
            id: editQuoteId,
            customerId: customerId === "generic" ? null : customerId,
            items: cart.map((c) => ({
              productId: c.productId,
              qty: c.qty,
              unitPriceCents: c.unitPriceCents,
              wasPriceOverridden: c.wasPriceOverridden,
              recipeAdjustments: c.recipeAdjustments.map((adjustment) => ({
                ingredientId: adjustment.ingredientId,
                adjustmentType: adjustment.adjustmentType,
              })),
            })),
            shippingCents: shippingCents > 0 ? shippingCents : undefined,
            validUntil,
            notes: notes || undefined,
          })

          toast({
            title: "Cotización actualizada",
            description: editingQuoteCode ? `Cotización ${editingQuoteCode}` : "Cambios guardados",
          })

          if (editingQuoteCode) {
            router.replace(`/api/print/quote/${editingQuoteCode}`)
          } else {
            router.push("/quotes/list")
          }
          return
        }

        const quote = await createQuote({
          customerId: customerId === "generic" ? null : customerId,
          items: cart.map((c) => ({
            productId: c.productId,
            qty: c.qty,
            unitPriceCents: c.unitPriceCents,
            wasPriceOverridden: c.wasPriceOverridden,
            recipeAdjustments: c.recipeAdjustments.map((adjustment) => ({
              ingredientId: adjustment.ingredientId,
              adjustmentType: adjustment.adjustmentType,
            })),
          })),
          shippingCents: shippingCents > 0 ? shippingCents : undefined,
          validUntil,
          notes: notes || undefined,
        })

        toast({ title: "Cotización guardada", description: `Cotización ${quote.quoteCode}` })
        resetForm()
        router.push(`/api/print/quote/${quote.quoteCode}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error guardando cotización"
        toast({ title: "No se pudo guardar", description: msg })
      }
    })
  }

  function getCartQuantity(productId: string) {
    return cart
      .filter((c) => c.productId === productId)
      .reduce((sum, item) => sum + item.qty, 0)
  }

  return (
    <div className={`grid gap-6 ${viewMode === "grid" ? "lg:grid-cols-[1fr_400px]" : "lg:grid-cols-[1fr_380px]"}`}>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>{editQuoteId ? `Editando ${editingQuoteCode ?? "cotización"}` : "Nueva Cotización"}</CardTitle>
                {isLoadingQuote && <span className="text-sm text-muted-foreground">Cargando…</span>}
              </div>
              <div className="flex items-center gap-3">
                {editQuoteId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetForm()
                      setEditingQuoteCode(null)
                      router.push("/quotes")
                    }}
                  >
                    Cancelar edición
                  </Button>
                )}
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
                              Código: {p.sku ?? "—"} · Ref: {p.reference ?? "—"} · Stock: {formatQty(p.stock, (p.unit as UnitType) ?? UnitType.UNIDAD)}
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
                                loading="lazy"
                                decoding="async"
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
                                {formatQtyBadge(getCartQuantity(p.id))}
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
                              {formatQty(p.stock, (p.unit as UnitType) ?? UnitType.UNIDAD)} disponible
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
                                  loading="lazy"
                                  decoding="async"
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
                                  {formatQtyBadge(cartQty)}
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
                                {formatQty(p.stock, (p.unit as UnitType) ?? UnitType.UNIDAD)} disponible
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
                {cart.map((c) => {
                  const allowsDecimals = unitAllowsDecimals(c.unit)
                  const step = allowsDecimals ? 0.5 : 1
                  const minQty = allowsDecimals ? 0.001 : 1

                  return (
                    <div key={c.lineId} className="flex items-start justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          Código: {c.sku ?? "—"} · Ref: {c.reference ?? "—"} · Unidad: {c.unit.toLowerCase()}
                        </div>
                        {c.recipeItems.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {getRecipeVariantLabels(c.recipeAdjustments).map((label) => (
                              <Badge
                                key={`${c.lineId}-${label}`}
                                variant={label === "Normal" ? "secondary" : "outline"}
                                className="text-[11px]"
                              >
                                {label}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setCart((p) =>
                                p.map((x) =>
                                  x.lineId === c.lineId
                                    ? { ...x, qty: Math.max(minQty, roundQty(x.qty - step)) }
                                    : x
                                )
                              )
                            }
                          >
                            -
                          </Button>
                          <Input
                            value={formatQtyNumber(c.qty, c.unit)}
                            onChange={(e) => {
                              const parsedQty = parseQty(e.target.value, c.unit)
                              const nextQty = Math.max(minQty, roundQty(parsedQty))
                              setCart((p) =>
                                p.map((x) =>
                                  x.lineId === c.lineId
                                    ? { ...x, qty: nextQty }
                                    : x
                                )
                              )
                            }}
                            inputMode={allowsDecimals ? "decimal" : "numeric"}
                            className="h-8 w-20 px-2 text-center"
                            aria-label={`Cantidad de ${c.name}`}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setCart((p) =>
                                p.map((x) =>
                                  x.lineId === c.lineId
                                    ? { ...x, qty: roundQty(x.qty + step) }
                                    : x
                                )
                              )
                            }
                          >
                            +
                          </Button>
                          <div className="ml-2 text-sm text-muted-foreground">x</div>
                          {canOverridePrice ? (
                            <div className="w-28">
                              <PriceInput
                                valueCents={c.unitPriceCents}
                                onChangeCents={(unitPriceCents) =>
                                  setCart((p) =>
                                    p.map((x) => {
                                      if (x.lineId !== c.lineId) return x
                                      const product = allProducts.find((item) => item.id === c.productId) || results.find((item) => item.id === c.productId)
                                      const originalPriceCents = product?.priceCents ?? c.unitPriceCents
                                      return {
                                        ...x,
                                        unitPriceCents,
                                        wasPriceOverridden: unitPriceCents !== originalPriceCents,
                                      }
                                    })
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
                        <div className="text-sm font-semibold">{formatRD(Math.round(c.unitPriceCents * c.qty))}</div>
                        {c.recipeItems.length > 0 && (
                          <Button type="button" variant="outline" size="sm" onClick={() => openRecipeDialogForCartItem(c)}>
                            Personalizar
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setCart((p) => p.filter((x) => x.lineId !== c.lineId))}
                          aria-label="Quitar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
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
                  : `Tienes ${cart.length} línea${cart.length !== 1 ? "s" : ""} en el carrito.`}
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
                  <div key={c.lineId} className="flex items-center justify-between text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatQtyNumber(c.qty, c.unit)} x {formatRD(c.unitPriceCents)}
                      </div>
                      {c.recipeItems.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {getRecipeVariantLabels(c.recipeAdjustments).map((label) => (
                            <Badge
                              key={`${c.lineId}-summary-${label}`}
                              variant={label === "Normal" ? "secondary" : "outline"}
                              className="text-[11px]"
                            >
                              {label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">{formatRD(Math.round(c.unitPriceCents * c.qty))}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setCart((p) => p.filter((x) => x.lineId !== c.lineId))}
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
                <span>{itbisLabel}</span>
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
              disabled={isSaving || isLoadingQuote || cart.length === 0}
              onClick={onSave}
            >
              {isSaving ? "Guardando…" : editQuoteId ? "Guardar cambios" : "Guardar y generar PDF"}
            </Button>
            <div className="text-xs text-muted-foreground">
              Precios incluyen ITBIS según la configuración actual. Se generará un PDF para compartir.
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!recipeDialogCartItem}
        onOpenChange={(open) => {
          if (!open) {
            closeRecipeDialog()
          }
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Ajustes de receta — {recipeDialogCartItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="text-sm text-muted-foreground">
              Selecciona el modo y marca los ingredientes que quieras ajustar. Los ajustes ya aplicados se mantienen
              al cambiar de modo.
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={recipeDialogMode === "SIN" ? "default" : "outline"}
                onClick={() => setRecipeDialogMode("SIN")}
              >
                Sin
              </Button>
              <Button
                type="button"
                variant={recipeDialogMode === "EXTRA" ? "default" : "outline"}
                onClick={() => setRecipeDialogMode("EXTRA")}
              >
                Extra
              </Button>
            </div>
            {recipeDialogCartItem && recipeDialogCartItem.qty > 1 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Aplicar a:</div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={recipeApplyScope === "ONE" ? "default" : "outline"}
                    onClick={() => setRecipeApplyScope("ONE")}
                  >
                    Solo 1 unidad
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={recipeApplyScope === "ALL" ? "default" : "outline"}
                    onClick={() => setRecipeApplyScope("ALL")}
                  >
                    Todas las unidades
                  </Button>
                </div>
              </div>
            )}
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(recipeDialogCartItem?.recipeItems ?? []).map((item) => {
                const current = recipeDraftByIngredient[item.ingredientId]
                const checked = Boolean(current)

                return (
                  <label key={item.ingredientId} className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{item.ingredientName}</div>
                      {current && (
                        <div className="text-xs text-muted-foreground">
                          Aplicado: {current === "SIN" ? "Sin" : "Extra"}
                        </div>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={checked}
                      disabled={!recipeDialogMode}
                      onChange={() => {
                        if (!recipeDialogMode) return
                        setRecipeDraftByIngredient((prev) => {
                          const next = { ...prev }
                          if (next[item.ingredientId] === recipeDialogMode) {
                            delete next[item.ingredientId]
                          } else {
                            next[item.ingredientId] = recipeDialogMode
                          }
                          return next
                        })
                      }}
                    />
                  </label>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                closeRecipeDialog()
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (recipeDialogCartItem) {
                  const scope = resolveRecipeApplyScope(recipeDialogCartItem, recipeApplyScope)
                  const adjustments = (recipeDialogCartItem.recipeItems ?? []).flatMap((item) => {
                    const adjustmentType = recipeDraftByIngredient[item.ingredientId]
                    if (!adjustmentType) return []
                    return [
                      {
                        ingredientId: item.ingredientId,
                        ingredientName: item.ingredientName,
                        adjustmentType,
                      } as RecipeAdjustment,
                    ]
                  })
                  applyRecipeAdjustmentsToCartLine(recipeDialogCartItem.lineId, adjustments, scope)
                  const variantLabel =
                    adjustments.length > 0 ? adjustments.map(formatAdjustmentLabel).join(", ") : "Normal"
                  const description =
                    adjustments.length === 0
                      ? scope === "ONE"
                        ? "Se dejó 1 unidad en versión normal."
                        : "Se dejó toda la línea en versión normal."
                      : scope === "ONE"
                        ? `Se personalizó 1 unidad: ${variantLabel}.`
                        : `Se personalizó toda la línea: ${variantLabel}.`
                  toast({
                    title: "Personalización aplicada",
                    description,
                  })
                }
                closeRecipeDialog()
              }}
            >
              Aplicar ajustes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}









