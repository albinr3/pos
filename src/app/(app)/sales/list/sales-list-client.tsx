"use client"

import { useEffect, useState, useTransition, useMemo } from "react"
import { Edit, Receipt, Trash2, Search, Printer, Plus } from "lucide-react"
import Link from "next/link"
import { SaleType, PaymentMethod } from "@prisma/client"


import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/app/price-input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatDateDO } from "@/lib/date-time"
import { DOMINICAN_BANKS } from "@/lib/dominican-banks"
import {
  calcDiscountedDocumentTotalsByTaxMode,
  formatRD,
  normalizeDiscountPercentBp,
} from "@/lib/money"
import { applyRecipeAdjustmentsWithScope, sortRecipeAdjustments, type RecipeApplyScope } from "@/lib/recipe-adjustment-scope"
import { formatCustomerLabel, isGenericCustomer } from "@/lib/customer-display"
import { cn } from "@/lib/utils"
import type { CurrentUser } from "@/lib/auth"

import { cancelSale, getSaleById, listSales, updateSale, searchProducts, listCustomers } from "../actions"

type Sale = Awaited<ReturnType<typeof listSales>>["items"][number]
type SaleDetail = Awaited<ReturnType<typeof getSaleById>>
type ProductResult = Awaited<ReturnType<typeof searchProducts>>[number]
type Customer = Awaited<ReturnType<typeof listCustomers>>[number]

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
  itbisRateBp: number
  recipeItems: RecipeItem[]
  recipeAdjustments: RecipeAdjustment[]
}

type DiscountMode = "AUTO" | "MANUAL"

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

const PAGE_SIZE = 50

function clampPercentInput(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "")
  const parts = normalized.split(".")
  if (parts.length <= 1) return normalized
  return `${parts[0]}.${parts.slice(1).join("")}`
}

function toInt(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function SalesListClient() {
  const [sales, setSales] = useState<Sale[]>([])
  const [isLoading, startLoading] = useTransition()
  const [query, setQuery] = useState("")
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  const [openEdit, setOpenEdit] = useState(false)
  const [editingSale, setEditingSale] = useState<SaleDetail | null>(null)
  const [documentSalePricesIncludeItbis, setDocumentSalePricesIncludeItbis] = useState(true)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [saleType, setSaleType] = useState<SaleType>(SaleType.CONTADO)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(PaymentMethod.EFECTIVO)
  const [transferBankName, setTransferBankName] = useState("")
  const [manualDiscountInput, setManualDiscountInput] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [isSaving, startSaving] = useTransition()
  const [recipeDialogLineId, setRecipeDialogLineId] = useState<string | null>(null)
  const [recipeDialogMode, setRecipeDialogMode] = useState<"SIN" | "EXTRA" | null>(null)
  const [recipeApplyScope, setRecipeApplyScope] = useState<RecipeApplyScope>("ONE")
  const [recipeDraftByIngredient, setRecipeDraftByIngredient] = useState<Record<string, "SIN" | "EXTRA">>({})

  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<ProductResult[]>([])
  const [, startSearch] = useTransition()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const canApplyDiscounts = Boolean(user?.canApplyDiscounts || user?.isOwner)
  const recipeDialogCartItem = useMemo(
    () => cart.find((item) => item.lineId === recipeDialogLineId) ?? null,
    [cart, recipeDialogLineId]
  )
  const genericCustomer = useMemo(
    () => customers.find((customer) => customer.isGeneric) ?? null,
    [customers]
  )
  const effectiveCustomerId = customerId ?? genericCustomer?.id ?? null
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === effectiveCustomerId) ?? null,
    [customers, effectiveCustomerId]
  )
  const autoDiscountPercentBp = useMemo(
    () => normalizeDiscountPercentBp(selectedCustomer?.saleDiscountPercentBp ?? 0),
    [selectedCustomer]
  )
  const manualDiscountPercentBp = useMemo(() => {
    const parsed = Number.parseFloat(manualDiscountInput.replace(",", "."))
    if (!Number.isFinite(parsed)) return 0
    return normalizeDiscountPercentBp(parsed * 100)
  }, [manualDiscountInput])
  const effectiveDiscountPercentBp = useMemo(() => {
    if (canApplyDiscounts) return manualDiscountPercentBp
    return autoDiscountPercentBp
  }, [autoDiscountPercentBp, canApplyDiscounts, manualDiscountPercentBp])

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

  useEffect(() => {
    if (autoDiscountPercentBp > 0) {
      setManualDiscountInput((autoDiscountPercentBp / 100).toFixed(2))
    } else {
      setManualDiscountInput("")
    }
  }, [effectiveCustomerId, autoDiscountPercentBp])

  function refresh(q?: string) {
    startLoading(async () => {
      try {
        const r = await listSales({ query: q, take: PAGE_SIZE })
        setSales(r.items)
        setNextCursor(r.nextCursor)
      } catch {
        setSales([])
        setNextCursor(null)
      }
    })
  }

  useEffect(() => {
    refresh("")
    listCustomers().then(setCustomers).catch(() => { })
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
        const r = await listSales({ query: q, cursor: nextCursor, take: PAGE_SIZE })
        setSales((prev) => [...prev, ...r.items])
        setNextCursor(r.nextCursor)
      } catch {
        setNextCursor(null)
      }
    })
  }

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      return
    }

    const t = setTimeout(() => {
      startSearch(async () => {
        try {
          const r = await searchProducts(q)
          setSearchResults(r)
        } catch {
          setSearchResults([])
        }
      })
    }, 200)

    return () => clearTimeout(t)
  }, [searchQuery])

  async function loadSaleForEdit(id: string) {
    try {
      const sale = await getSaleById(id)
      if (!sale) {
        toast({ title: "Error", description: "Venta no encontrada" })
        return
      }
      setEditingSale(sale)
      setDocumentSalePricesIncludeItbis(sale.salePricesIncludeItbis ?? true)
      setCustomerId(sale.customerId ?? genericCustomer?.id ?? null)
      setSaleType(sale.type)
      setPaymentMethod(sale.paymentMethod || PaymentMethod.EFECTIVO)
      setTransferBankName(sale.transferBankName || "")
      setManualDiscountInput(
        sale.discountPercentBp > 0
          ? (sale.discountPercentBp / 100).toFixed(2)
          : ""
      )
      setCart(
        sale.items.map((item) => ({
          lineId: buildCartLineId(
            item.productId,
            (item.recipeAdjustments ?? []).map((adjustment) => ({
              ingredientId: adjustment.ingredientId,
              ingredientName: adjustment.ingredientName,
              adjustmentType: adjustment.type,
            }))
          ),
          productId: item.productId,
          name: item.product.name,
          sku: item.product.sku,
          reference: item.product.reference,
          stock: item.product.stock,
          qty: item.qty,
          unitPriceCents: item.unitPriceCents,
          wasPriceOverridden: item.wasPriceOverridden,
          itbisRateBp: item.itbisRateBp ?? item.product.itbisRateBp ?? 1800,
          recipeItems: item.product.recipeItems ?? [],
          recipeAdjustments: (item.recipeAdjustments ?? []).map((adjustment) => ({
            ingredientId: adjustment.ingredientId,
            ingredientName: adjustment.ingredientName,
            adjustmentType: adjustment.type,
          })),
        }))
      )
      setOpenEdit(true)
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo cargar la venta" })
    }
  }

  function addProductToCart(p: ProductResult, recipeAdjustments: RecipeAdjustment[] = []) {
    const normalizedAdjustments = sortRecipeAdjustments(recipeAdjustments)
    const lineId = buildCartLineId(p.id, normalizedAdjustments)

    setCart((prev) => {
      const existing = prev.find((x) => x.lineId === lineId)
      if (existing) return prev.map((x) => (x.lineId === lineId ? { ...x, qty: x.qty + 1 } : x))
      return [
        ...prev,
        {
          lineId,
          productId: p.id,
          name: p.name,
          sku: p.sku,
          reference: p.reference,
          stock: p.stock,
          qty: 1,
          unitPriceCents: p.priceCents,
          wasPriceOverridden: false,
          itbisRateBp: p.itbisRateBp ?? 1800,
          recipeItems: p.recipeItems ?? [],
          recipeAdjustments: normalizedAdjustments,
        },
      ]
    })
  }

  function handleProductSelection(p: ProductResult) {
    addProductToCart(p)
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

  async function handleSave() {
    if (!editingSale) return

    if (saleType === SaleType.CREDITO && (!effectiveCustomerId || isGenericCustomer(selectedCustomer))) {
      toast({ title: "Error", description: "Para crédito debes seleccionar un cliente" })
      return
    }

    if (saleType === SaleType.CONTADO && !paymentMethod) {
      toast({ title: "Error", description: "Debes seleccionar un método de pago para ventas al contado" })
      return
    }
    if (saleType === SaleType.CONTADO && paymentMethod === PaymentMethod.TRANSFERENCIA && !transferBankName) {
      toast({ title: "Error", description: "Debes seleccionar el banco de la transferencia" })
      return
    }

    startSaving(async () => {
      try {
        const discountModeForSave: DiscountMode = canApplyDiscounts ? "MANUAL" : "AUTO"
        await updateSale({
          id: editingSale.id,
          customerId: effectiveCustomerId,
          type: saleType,
          paymentMethod: saleType === SaleType.CONTADO ? paymentMethod : null,
          transferBankName:
            saleType === SaleType.CONTADO && paymentMethod === PaymentMethod.TRANSFERENCIA
              ? transferBankName
              : null,
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
          discountMode: discountModeForSave,
          manualDiscountPercentBp:
            discountModeForSave === "MANUAL" ? manualDiscountPercentBp : undefined,
        })
        toast({ title: "Guardado", description: "Venta actualizada" })
        setOpenEdit(false)
        setEditingSale(null)
        refresh(query)
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo actualizar" })
      }
    })
  }

  async function handleCancel(id: string) {
    if (!confirm("¿Cancelar esta venta? Se revertirá el stock descontado.")) return
    try {
      const result = await cancelSale(id, "admin")
      if (result.success) {
        toast({ title: "Listo", description: "Venta cancelada" })
        refresh(query)
      } else {
        toast({ title: "No se pudo cancelar", description: result.error })
      }
    } catch {
      toast({ title: "Error", description: "Error de comunicación con el servidor" })
    }
  }

  const {
    subtotalCents,
    itbisCents,
    discountTotalCents,
    itemsTotalCents,
  } = useMemo(() => {
    return calcDiscountedDocumentTotalsByTaxMode(
      cart.map((item) => ({
        unitPriceCents: item.unitPriceCents,
        qty: item.qty,
        itbisRateBp: item.itbisRateBp,
      })),
      documentSalePricesIncludeItbis,
      effectiveDiscountPercentBp
    )
  }, [cart, documentSalePricesIncludeItbis, effectiveDiscountPercentBp])
  const shippingCents = editingSale?.shippingCents ?? 0
  const totalCents = itemsTotalCents + shippingCents

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 text-left">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-green-600" /> Lista de Facturas
          </CardTitle>
          <Button asChild size="sm" className="bg-purple-600 hover:bg-purple-700 text-white shadow-sm">
            <Link href="/sales">
              <Plus className="mr-2 h-4 w-4" />
              Nueva venta
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por factura, cliente o productos" />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id} className={s.cancelledAt ? "bg-red-50" : ""}>
                    <TableCell className="font-medium">
                      {s.invoiceCode}
                      {s.returnStatus && (
                        <div className="mt-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-semibold",
                              s.returnStatus === "TOTAL"
                                ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                                : "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
                            )}
                          >
                            {s.returnStatus === "TOTAL" ? "Devolución total" : "Devolución parcial"}
                          </Badge>
                        </div>
                      )}
                      {s.cancelledAt && <div className="text-xs text-red-600 font-semibold">CANCELADA</div>}
                    </TableCell>
                    <TableCell>{formatDateDO(s.soldAt)}</TableCell>
                    <TableCell>
                      {formatCustomerLabel(s.customer, { includeVisualId: true })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-semibold",
                          s.type === SaleType.CONTADO
                            ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
                            : "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                        )}
                      >
                        {s.type === SaleType.CONTADO ? "Contado" : "Crédito"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatRD(s.totalCents)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          asChild
                          size="icon"
                          className="bg-green-500 hover:bg-green-600 text-white"
                          title="Reimprimir"
                        >
                          <Link href={`/api/print/sale/${s.invoiceCode}`} target="_blank" aria-label="Reimprimir">
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                        {!s.cancelledAt && (
                          <>
                            <Button
                              size="icon"
                              onClick={() => loadSaleForEdit(s.id)}
                              aria-label="Editar"
                              className="bg-blue-500 hover:bg-blue-600 text-white"
                              title="Editar"
                              disabled={!user || (!user.canEditSales && !user.isOwner)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              onClick={() => handleCancel(s.id)}
                              aria-label="Cancelar"
                              className="bg-red-500 hover:bg-red-600 text-white"
                              title="Cancelar"
                              disabled={!user || (!user.canCancelSales && !user.isOwner)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {s.cancelledAt && (
                          <span className="text-xs text-red-600">Cancelada {formatDateDO(s.cancelledAt)}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {!isLoading && sales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <img
                          src="/lupa.webp"
                          alt="No hay resultados"
                          width={192}
                          height={192}
                          className="mb-4 opacity-60"
                        />
                        <p className="text-lg font-medium text-muted-foreground">No se encontraron ventas</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {query ? "Intenta con otros términos de búsqueda" : "Aún no se han registrado ventas"}
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

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Venta{editingSale?.invoiceCode ? ` - ${editingSale.invoiceCode}` : ""}</DialogTitle>
          </DialogHeader>

          {editingSale && (
            <div className="grid gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Tipo de venta</Label>
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    value={saleType}
                    onChange={(e) => {
                      setSaleType(e.target.value as SaleType)
                      if (e.target.value === SaleType.CONTADO && !paymentMethod) {
                        setPaymentMethod(PaymentMethod.EFECTIVO)
                      }
                      if (e.target.value !== SaleType.CONTADO) {
                        setTransferBankName("")
                      }
                    }}
                    disabled={!user || (!user.canChangeSaleType && !user.isOwner)}
                  >
                    <option value={SaleType.CONTADO}>Contado</option>
                    <option value={SaleType.CREDITO}>Crédito</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>Cliente</Label>
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={effectiveCustomerId ?? ""}
                    onChange={(e) => setCustomerId(e.target.value || null)}
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatCustomerLabel(c, { includeVisualId: true })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {saleType === SaleType.CONTADO && (
                <div className="grid gap-2">
                  <Label>Método de pago</Label>
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={paymentMethod ?? ""}
                    onChange={(e) => {
                      const nextMethod = e.target.value as PaymentMethod
                      setPaymentMethod(nextMethod)
                      if (nextMethod !== PaymentMethod.TRANSFERENCIA) {
                        setTransferBankName("")
                      }
                    }}
                  >
                    <option value={PaymentMethod.EFECTIVO}>Efectivo</option>
                    <option value={PaymentMethod.TRANSFERENCIA}>Transferencia</option>
                    <option value={PaymentMethod.TARJETA}>Tarjeta</option>
                  </select>
                </div>
              )}
              {saleType === SaleType.CONTADO && paymentMethod === PaymentMethod.TRANSFERENCIA && (
                <div className="grid gap-2">
                  <Label>Banco de la transferencia</Label>
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={transferBankName}
                    onChange={(e) => setTransferBankName(e.target.value)}
                  >
                    <option value="">Selecciona un banco</option>
                    {DOMINICAN_BANKS.map((bankName) => (
                      <option key={bankName} value={bankName}>
                        {bankName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid gap-2">
                <Label>Descuento (%)</Label>
                <Input
                  value={manualDiscountInput}
                  onChange={(e) => setManualDiscountInput(clampPercentInput(e.target.value))}
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={!canApplyDiscounts}
                />
                {!canApplyDiscounts && (
                  <p className="text-xs text-muted-foreground">
                    El descuento mostrado viene del cliente. Tu usuario no puede modificarlo.
                  </p>
                )}
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
                      <button key={p.id} onClick={() => handleProductSelection(p)} className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b last:border-b-0">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-sm text-muted-foreground">Código: {p.sku ?? "—"} · Precio: {formatRD(p.priceCents)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Productos ({cart.length})</Label>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                  {cart.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-2">No hay productos</div>
                  ) : (
                    cart.map((c) => (
                      <div key={c.lineId} className="border rounded p-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs text-muted-foreground">Código: {c.sku ?? "—"} · Stock: {c.stock}</div>
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
                          </div>
                          <div className="flex items-center gap-1">
                            {c.recipeItems.length > 0 && (
                              <Button variant="outline" size="sm" onClick={() => openRecipeDialogForCartItem(c)}>
                                Personalizar
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => setCart((p) => p.filter((x) => x.lineId !== c.lineId))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div>
                            <Label className="text-xs">Cantidad</Label>
                            <Input value={String(c.qty)} onChange={(e) => setCart((p) => p.map((x) => (x.lineId === c.lineId ? { ...x, qty: Math.max(1, toInt(e.target.value)) } : x)))} inputMode="numeric" />
                          </div>
                          <div>
                            <Label className="text-xs">Precio unitario</Label>
                            {user && user.canOverridePrice ? (
                              <PriceInput
                                valueCents={c.unitPriceCents}
                                onChangeCents={(cents) => {
                                  // Obtener el precio original del producto
                                  const product = searchResults.find((p) => p.id === c.productId) || editingSale?.items.find((item) => item.productId === c.productId)?.product
                                  const originalPriceCents = product?.priceCents || c.unitPriceCents
                                  setCart((p) => p.map((x) => (x.lineId === c.lineId ? { ...x, unitPriceCents: cents, wasPriceOverridden: cents !== originalPriceCents } : x)))
                                }}
                              />
                            ) : (
                              <div className="h-10 rounded-md border bg-muted px-3 py-2 text-sm font-semibold">{formatRD(c.unitPriceCents)}</div>
                            )}
                          </div>
                          <div>
                            <Label className="text-xs">Total</Label>
                            <div className="h-10 rounded-md border bg-muted px-3 py-2 text-sm font-semibold">{formatRD(c.qty * c.unitPriceCents)}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t pt-2 space-y-1">
                {discountTotalCents > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Descuento ({(effectiveDiscountPercentBp / 100).toFixed(2)}%):</span>
                    <span className="font-semibold">-{formatRD(discountTotalCents)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-semibold">{formatRD(subtotalCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ITBIS {documentSalePricesIncludeItbis ? "(incluido)" : "(no incluido)"}:</span>
                  <span className="font-semibold">{formatRD(itbisCents)}</span>
                </div>
                {shippingCents > 0 && (
                  <div className="flex justify-between">
                    <span>Flete:</span>
                    <span className="font-semibold">{formatRD(shippingCents)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1">
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
            <Button onClick={handleSave} disabled={isSaving || cart.length === 0}>
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recipe Adjustments Dialog */}
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
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(recipeDialogCartItem?.recipeItems ?? []).map((item) => {
                const current = recipeDraftByIngredient[item.ingredientId]
                const checked = Boolean(current)

                return (
                  <label key={item.ingredientId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 cursor-pointer">
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


