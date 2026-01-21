"use client"

import { useEffect, useState, useTransition, useMemo } from "react"
import { Edit, Receipt, Trash2, Search, Printer } from "lucide-react"
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
import { formatRD, calcItbisIncluded } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { CurrentUser } from "@/lib/auth"

import { cancelSale, getSaleById, listSales, updateSale, searchProducts, listCustomers } from "../actions"

type Sale = Awaited<ReturnType<typeof listSales>>[number]
type SaleDetail = Awaited<ReturnType<typeof getSaleById>>
type ProductResult = Awaited<ReturnType<typeof searchProducts>>[number]
type Customer = Awaited<ReturnType<typeof listCustomers>>[number]

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

function toInt(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function SalesListClient() {
  const [sales, setSales] = useState<Sale[]>([])
  const [isLoading, startLoading] = useTransition()
  const [query, setQuery] = useState("")

  const [openEdit, setOpenEdit] = useState(false)
  const [editingSale, setEditingSale] = useState<SaleDetail | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [saleType, setSaleType] = useState<SaleType>(SaleType.CONTADO)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(PaymentMethod.EFECTIVO)
  const [cart, setCart] = useState<CartItem[]>([])
  const [isSaving, startSaving] = useTransition()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<ProductResult[]>([])
  const [isSearching, startSearch] = useTransition()
  const [user, setUser] = useState<CurrentUser | null>(null)

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

  function refresh() {
    startLoading(async () => {
      try {
        const r = await listSales()
        setSales(r)
      } catch {
        setSales([])
      }
    })
  }

  useEffect(() => {
    refresh()
    listCustomers().then(setCustomers).catch(() => {})
  }, [])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
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
      setCustomerId(sale.customerId)
      setSaleType(sale.type)
      setPaymentMethod(sale.paymentMethod || PaymentMethod.EFECTIVO)
      setCart(
        sale.items.map((item) => ({
          productId: item.productId,
          name: item.product.name,
          sku: item.product.sku,
          reference: item.product.reference,
          stock: item.product.stock,
          qty: item.qty,
          unitPriceCents: item.unitPriceCents,
          wasPriceOverridden: item.wasPriceOverridden,
        }))
      )
      setOpenEdit(true)
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo cargar la venta" })
    }
  }

  function addProduct(p: ProductResult) {
    setCart((prev) => {
      const existing = prev.find((x) => x.productId === p.id)
      if (existing) return prev.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x))
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          reference: p.reference,
          stock: p.stock,
          qty: 1,
          unitPriceCents: p.priceCents,
          wasPriceOverridden: false,
        },
      ]
    })
  }

  async function handleSave() {
    if (!editingSale) return

    if (saleType === SaleType.CREDITO && !customerId) {
      toast({ title: "Error", description: "Para crédito debes seleccionar un cliente" })
      return
    }

    if (saleType === SaleType.CONTADO && !paymentMethod) {
      toast({ title: "Error", description: "Debes seleccionar un método de pago para ventas al contado" })
      return
    }

    startSaving(async () => {
      try {
        await updateSale({
          id: editingSale.id,
          customerId: customerId === "generic" ? null : customerId,
          type: saleType,
          paymentMethod: saleType === SaleType.CONTADO ? paymentMethod : null,
          items: cart.map((c) => ({
            productId: c.productId,
            qty: c.qty,
            unitPriceCents: c.unitPriceCents,
            wasPriceOverridden: c.wasPriceOverridden,
          })),
        })
        toast({ title: "Guardado", description: "Venta actualizada" })
        setOpenEdit(false)
        setEditingSale(null)
        refresh()
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo actualizar" })
      }
    })
  }

  async function handleCancel(id: string) {
    if (!confirm("¿Cancelar esta venta? Se revertirá el stock descontado.")) return
    try {
      await cancelSale(id, "admin")
      toast({ title: "Listo", description: "Venta cancelada" })
      refresh()
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo cancelar" })
    }
  }

  const filteredSales = sales.filter((s) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      s.invoiceCode.toLowerCase().includes(q) ||
      s.customer?.name.toLowerCase().includes(q) ||
      s.items.some((item) => item.product.name.toLowerCase().includes(q))
    )
  })

  const totalCents = cart.reduce((s, i) => s + i.unitPriceCents * i.qty, 0)
  const { subtotalCents, itbisCents } = useMemo(() => calcItbisIncluded(totalCents, 1800), [totalCents])

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-green-600" /> Lista de Facturas
          </CardTitle>
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
                {filteredSales.map((s) => (
                  <TableRow key={s.id} className={s.cancelledAt ? "bg-red-50" : ""}>
                    <TableCell className="font-medium">
                      {s.invoiceCode}
                      {s.cancelledAt && <div className="text-xs text-red-600 font-semibold">CANCELADA</div>}
                    </TableCell>
                    <TableCell>{new Date(s.soldAt).toLocaleDateString("es-DO")}</TableCell>
                    <TableCell>{s.customer?.name ?? "Cliente"}</TableCell>
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
                          <Link href={`/receipts/sale/${s.invoiceCode}`} target="_blank" aria-label="Reimprimir">
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
                              disabled={!user || (!user.canEditSales && user.role !== "ADMIN")}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              onClick={() => handleCancel(s.id)} 
                              aria-label="Cancelar"
                              className="bg-red-500 hover:bg-red-600 text-white"
                              title="Cancelar"
                              disabled={!user || (!user.canCancelSales && user.role !== "ADMIN")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {s.cancelledAt && (
                          <span className="text-xs text-red-600">Cancelada {new Date(s.cancelledAt).toLocaleDateString("es-DO")}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {!isLoading && filteredSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <img
                          src="/lupa.png"
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
                    }}
                    disabled={!user || (!user.canChangeSaleType && user.role !== "ADMIN")}
                  >
                    <option value={SaleType.CONTADO}>Contado</option>
                    <option value={SaleType.CREDITO}>Crédito</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>Cliente</Label>
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={customerId || "generic"}
                    onChange={(e) => setCustomerId(e.target.value === "generic" ? null : e.target.value)}
                  >
                    <option value="generic">Cliente general</option>
                    {customers
                      .filter((c) => !c.isGeneric)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
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
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  >
                    <option value={PaymentMethod.EFECTIVO}>Efectivo</option>
                    <option value={PaymentMethod.TRANSFERENCIA}>Transferencia</option>
                    <option value={PaymentMethod.TARJETA}>Tarjeta</option>
                  </select>
                </div>
              )}

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
                      <div key={c.productId} className="border rounded p-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs text-muted-foreground">Código: {c.sku ?? "—"} · Stock: {c.stock}</div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => setCart((p) => p.filter((x) => x.productId !== c.productId))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div>
                            <Label className="text-xs">Cantidad</Label>
                            <Input value={String(c.qty)} onChange={(e) => setCart((p) => p.map((x) => (x.productId === c.productId ? { ...x, qty: Math.max(1, toInt(e.target.value)) } : x)))} inputMode="numeric" />
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
                                  setCart((p) => p.map((x) => (x.productId === c.productId ? { ...x, unitPriceCents: cents, wasPriceOverridden: cents !== originalPriceCents } : x)))
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
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-semibold">{formatRD(subtotalCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ITBIS:</span>
                  <span className="font-semibold">{formatRD(itbisCents)}</span>
                </div>
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
    </div>
  )
}

