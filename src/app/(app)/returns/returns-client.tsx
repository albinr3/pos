"use client"

import { useEffect, useState, useTransition } from "react"
import { Search, Plus, Minus, X } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD } from "@/lib/money"

import { createReturn, getSaleForReturn, searchSalesForReturn } from "./actions"

type SaleForReturn = Awaited<ReturnType<typeof getSaleForReturn>>
type SaleSearchResult = Awaited<ReturnType<typeof searchSalesForReturn>>[number]

type ReturnItem = {
  saleItemId: string
  productId: string
  name: string
  sku: string | null
  reference: string | null
  qty: number
  availableQty: number
  unitPriceCents: number
}

export function ReturnsClient() {
  const [saleSearchQuery, setSaleSearchQuery] = useState("")
  const [saleSearchResults, setSaleSearchResults] = useState<SaleSearchResult[]>([])
  const [isSearching, startSearch] = useTransition()
  const [selectedSale, setSelectedSale] = useState<SaleForReturn | null>(null)
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [notes, setNotes] = useState("")
  const [isSaving, startSaving] = useTransition()

  useEffect(() => {
    const q = saleSearchQuery.trim()
    if (!q) {
      setSaleSearchResults([])
      return
    }

    const t = setTimeout(() => {
      startSearch(async () => {
        try {
          const r = await searchSalesForReturn(q)
          setSaleSearchResults(r)
        } catch {
          setSaleSearchResults([])
        }
      })
    }, 300)

    return () => clearTimeout(t)
  }, [saleSearchQuery])

  async function selectSale(sale: SaleSearchResult) {
    try {
      const saleDetail = await getSaleForReturn(sale.id)
      if (!saleDetail) {
        toast({ title: "Error", description: "No se pudo cargar la venta" })
        return
      }
      setSelectedSale(saleDetail)
      setReturnItems([])
      setSaleSearchQuery("")
      setSaleSearchResults([])
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Error cargando venta" })
    }
  }

  function addItem(item: SaleForReturn["items"][number]) {
    if (item.availableQty <= 0) {
      toast({ title: "No disponible", description: "No hay cantidad disponible para devolver de este producto" })
      return
    }

    setReturnItems((prev) => {
      const existing = prev.find((x) => x.saleItemId === item.id)
      if (existing) {
        if (existing.qty >= item.availableQty) {
          toast({ title: "Límite alcanzado", description: "Ya has agregado la cantidad máxima disponible" })
          return prev
        }
        return prev.map((x) =>
          x.saleItemId === item.id ? { ...x, qty: Math.min(x.qty + 1, item.availableQty) } : x
        )
      }
      return [
        ...prev,
        {
          saleItemId: item.id,
          productId: item.productId,
          name: item.product.name,
          sku: item.product.sku,
          reference: item.product.reference,
          qty: 1,
          availableQty: item.availableQty,
          unitPriceCents: item.unitPriceCents,
        },
      ]
    })
  }

  function updateItemQty(saleItemId: string, newQty: number) {
    setReturnItems((prev) =>
      prev.map((item) => {
        if (item.saleItemId === saleItemId) {
          const qty = Math.max(1, Math.min(newQty, item.availableQty))
          return { ...item, qty }
        }
        return item
      })
    )
  }

  function removeItem(saleItemId: string) {
    setReturnItems((prev) => prev.filter((x) => x.saleItemId !== saleItemId))
  }

  const totalCents = returnItems.reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0)

  async function handleSave() {
    if (!selectedSale) return
    if (returnItems.length === 0) {
      toast({ title: "Error", description: "Debes agregar al menos un producto a devolver" })
      return
    }

    startSaving(async () => {
      try {
        const result = await createReturn({
          saleId: selectedSale.id,
          items: returnItems.map((item) => ({
            saleItemId: item.saleItemId,
            productId: item.productId,
            qty: item.qty,
            unitPriceCents: item.unitPriceCents,
          })),
          notes: notes || null,
        })

        toast({ title: "Devolución creada", description: `Devolución ${result.returnCode} registrada exitosamente` })
        setSelectedSale(null)
        setReturnItems([])
        setNotes("")
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error creando devolución"
        toast({ title: "Error", description: msg })
      }
    })
  }

  return (
    <div className="grid gap-6">
      {!selectedSale ? (
        <Card>
          <CardHeader>
            <CardTitle>Buscar Venta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número de factura o cliente..."
                value={saleSearchQuery}
                onChange={(e) => setSaleSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            {!isSearching && saleSearchResults.length === 0 && !saleSearchQuery.trim() && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <img
                  src="/lupaok.png"
                  alt="Buscar venta"
                  width={200}
                  height={200}
                  className="mb-4 opacity-60"
                />
                <p className="text-lg font-medium text-muted-foreground">
                  Busca número de factura o cliente para crear una devolución
                </p>
              </div>
            )}

            {saleSearchResults.length > 0 && (
              <div className="rounded-md border overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Factura</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saleSearchResults.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-medium">{sale.invoiceCode}</TableCell>
                        <TableCell>{sale.customer?.name ?? "Cliente genérico"}</TableCell>
                        <TableCell>{new Date(sale.soldAt).toLocaleDateString("es-DO")}</TableCell>
                        <TableCell className="text-right">{formatRD(sale.totalCents)}</TableCell>
                        <TableCell className="text-right">
                          <Button onClick={() => selectSale(sale)} size="sm">
                            Seleccionar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {isSearching && saleSearchQuery.trim() && (
              <div className="text-center text-sm text-muted-foreground">Buscando...</div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Venta: {selectedSale.invoiceCode}</CardTitle>
                <Button variant="outline" onClick={() => setSelectedSale(null)}>
                  Cambiar venta
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold">Cliente:</span> {selectedSale.customer?.name ?? "Cliente genérico"}
                </div>
                <div>
                  <span className="font-semibold">Fecha:</span>{" "}
                  {new Date(selectedSale.soldAt).toLocaleDateString("es-DO")}
                </div>
                <div>
                  <span className="font-semibold">Total:</span> {formatRD(selectedSale.totalCents)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Productos de la Venta</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table className="min-w-[650px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Vendido</TableHead>
                      <TableHead>Devuelto</TableHead>
                      <TableHead>Disponible</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSale.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.product.name}</div>
                            {(item.product.sku || item.product.reference) && (
                              <div className="text-xs text-muted-foreground">
                                {item.product.sku && `SKU: ${item.product.sku}`}
                                {item.product.sku && item.product.reference && " · "}
                                {item.product.reference && `Ref: ${item.product.reference}`}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{item.qty}</TableCell>
                        <TableCell>{item.returnedQty}</TableCell>
                        <TableCell>
                          <span className={item.availableQty > 0 ? "font-semibold" : "text-muted-foreground"}>
                            {item.availableQty}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{formatRD(item.unitPriceCents)}</TableCell>
                        <TableCell className="text-right">
                          {item.availableQty > 0 ? (
                            <Button onClick={() => addItem(item)} size="sm" variant="outline">
                              <Plus className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin disponibilidad</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {returnItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Productos a Devolver</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead className="text-right">Precio Unit.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returnItems.map((item) => (
                        <TableRow key={item.saleItemId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{item.name}</div>
                              {(item.sku || item.reference) && (
                                <div className="text-xs text-muted-foreground">
                                  {item.sku && `SKU: ${item.sku}`}
                                  {item.sku && item.reference && " · "}
                                  {item.reference && `Ref: ${item.reference}`}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => updateItemQty(item.saleItemId, item.qty - 1)}
                                disabled={item.qty <= 1}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                value={item.qty}
                                onChange={(e) => updateItemQty(item.saleItemId, parseInt(e.target.value) || 1)}
                                className="w-20 text-center"
                                min={1}
                                max={item.availableQty}
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => updateItemQty(item.saleItemId, item.qty + 1)}
                                disabled={item.qty >= item.availableQty}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatRD(item.unitPriceCents)}</TableCell>
                          <TableCell className="text-right">
                            {formatRD(item.unitPriceCents * item.qty)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => removeItem(item.saleItemId)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableHeader>
                      <TableRow>
                        <TableCell colSpan={3} className="text-right font-semibold">
                          Total:
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatRD(totalCents)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableHeader>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Información Adicional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas sobre la devolución..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSelectedSale(null)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || returnItems.length === 0}>
              {isSaving ? "Guardando..." : "Guardar Devolución"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}












