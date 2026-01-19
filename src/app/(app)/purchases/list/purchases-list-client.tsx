"use client"

import { useEffect, useState, useTransition } from "react"
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

import { cancelPurchase, getPurchaseById, listAllPurchases, updatePurchase, searchProductsForPurchase } from "../actions"

type Purchase = Awaited<ReturnType<typeof listAllPurchases>>[number]
type PurchaseDetail = Awaited<ReturnType<typeof getPurchaseById>>
type ProductResult = Awaited<ReturnType<typeof searchProductsForPurchase>>[number]

type CartItem = {
  productId: string
  name: string
  sku: string | null
  reference: string | null
  qty: number
  unitCostCents: number
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
  const [supplierName, setSupplierName] = useState("")
  const [notes, setNotes] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [updateCost, setUpdateCost] = useState(false)
  const [isSaving, startSaving] = useTransition()

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<ProductResult[]>([])
  const [isSearching, startSearch] = useTransition()

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
          const r = await searchProductsForPurchase(q)
          setSearchResults(r)
        } catch {
          setSearchResults([])
        }
      })
    }, 200)

    return () => clearTimeout(t)
  }, [searchQuery])

  async function loadPurchaseForEdit(id: string) {
    try {
      const purchase = await getPurchaseById(id)
      if (!purchase) {
        toast({ title: "Error", description: "Compra no encontrada" })
        return
      }
      setEditingPurchase(purchase)
      setSupplierName(purchase.supplierName ?? "")
      setNotes(purchase.notes ?? "")
      setCart(
        purchase.items.map((item) => ({
          productId: item.productId,
          name: item.product.name,
          sku: item.product.sku,
          reference: item.product.reference,
          qty: item.qty,
          unitCostCents: item.unitCostCents,
        }))
      )
      setUpdateCost(false)
      setOpenEdit(true)
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo cargar la compra" })
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
          qty: 1,
          unitCostCents: p.costCents ?? 0,
        },
      ]
    })
  }

  async function handleSave() {
    if (!editingPurchase) return

    startSaving(async () => {
      try {
        await updatePurchase({
          id: editingPurchase.id,
          supplierName: supplierName || null,
          notes: notes || null,
          items: cart.map((c) => ({ productId: c.productId, qty: c.qty, unitCostCents: c.unitCostCents })),
          updateProductCost: updateCost,
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
      await cancelPurchase(id, "admin")
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

  const totalCents = cart.reduce((s, i) => s + i.qty * i.unitCostCents, 0)

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
                    <TableCell>{p.supplierName ?? "—"}</TableCell>
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
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Compra</DialogTitle>
          </DialogHeader>

          {editingPurchase && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Suplidor (opcional)</Label>
                <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Nota (opcional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="rounded-md border p-3">
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} className="mt-1" />
                  <span>
                    <span className="font-medium">Actualizar costo del producto</span>
                    <span className="block text-xs text-muted-foreground">Si lo activas, el costo del producto se actualizará al costo unitario de esta compra.</span>
                  </span>
                </label>
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
                        <div className="text-sm text-muted-foreground">Código: {p.sku ?? "—"} · Costo: {formatRD(p.costCents ?? 0)}</div>
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
                            <div className="text-xs text-muted-foreground">Código: {c.sku ?? "—"}</div>
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
                            <Label className="text-xs">Costo unitario</Label>
                            <Input value={((c.unitCostCents ?? 0) / 100).toFixed(2)} onChange={(e) => setCart((p) => p.map((x) => (x.productId === c.productId ? { ...x, unitCostCents: toCents(e.target.value) } : x)))} inputMode="decimal" />
                          </div>
                          <div>
                            <Label className="text-xs">Total</Label>
                            <div className="h-10 rounded-md border bg-muted px-3 py-2 text-sm font-semibold">{formatRD(c.qty * c.unitCostCents)}</div>
                          </div>
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
            <Button onClick={handleSave} disabled={isSaving || cart.length === 0}>
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

