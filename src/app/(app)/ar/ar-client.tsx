"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"

import { CreditCard, HandCoins, Printer, Receipt, Search } from "lucide-react"
import { PaymentMethod } from "@prisma/client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"
import { PriceInput } from "@/components/app/price-input"

import { addPayment, listOpenAR } from "./actions"

type AR = Awaited<ReturnType<typeof listOpenAR>>[number]

function methodLabel(m: PaymentMethod) {
  switch (m) {
    case PaymentMethod.EFECTIVO:
      return "Efectivo"
    case PaymentMethod.TRANSFERENCIA:
      return "Transferencia"
    case PaymentMethod.TARJETA:
      return "Tarjeta"
    default:
      return "Otro"
  }
}

export function ARClient() {
  const [items, setItems] = useState<AR[]>([])
  const [isLoading, startLoading] = useTransition()
  const [query, setQuery] = useState("")
  const [skip, setSkip] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, startLoadingMore] = useTransition()

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<AR | null>(null)
  const [amountCents, setAmountCents] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO)
  const [note, setNote] = useState("")
  const [isSaving, startSaving] = useTransition()

  const [openReceipts, setOpenReceipts] = useState(false)
  const [selectedForReceipts, setSelectedForReceipts] = useState<AR | null>(null)

  function refresh() {
    setSkip(0)
    startLoading(async () => {
      try {
        const r = await listOpenAR({ query, skip: 0, take: 10 })
        setItems(r)
        setHasMore(r.length === 10)
      } catch {
        setItems([])
        setHasMore(false)
      }
    })
  }

  function loadMore() {
    startLoadingMore(async () => {
      try {
        const newSkip = skip + 10
        const r = await listOpenAR({ query, skip: newSkip, take: 10 })
        setItems((prev) => [...prev, ...r])
        setSkip(newSkip)
        setHasMore(r.length === 10)
      } catch {
        setHasMore(false)
      }
    })
  }

  useEffect(() => {
    refresh()
  }, [query])

  const totalBalance = useMemo(() => items.reduce((s, i) => s + i.balanceCents, 0), [items])

  function openPayment(ar: AR) {
    setSelected(ar)
    setAmountCents(ar.balanceCents ?? 0)
    setMethod(PaymentMethod.EFECTIVO)
    setNote("")
    setOpen(true)
  }

  async function onPay() {
    if (!selected) return

    // Validar que el monto no exceda el balance
    if (amountCents > selected.balanceCents) {
      toast({ 
        title: "Error", 
        description: `No puedes abonar más del balance pendiente (${formatRD(selected.balanceCents)})`,
        variant: "destructive"
      })
      return
    }

    if (amountCents <= 0) {
      toast({ 
        title: "Error", 
        description: "El monto debe ser mayor a cero",
        variant: "destructive"
      })
      return
    }

    startSaving(async () => {
      try {
        // Asegurar que no se exceda el balance (por si acaso)
        const finalAmount = Math.min(amountCents, selected.balanceCents)
        const result = await addPayment({
          arId: selected.id,
          amountCents: finalAmount,
          method,
          note: note || null,
          username: "admin",
        })
        toast({ title: "Pago registrado", description: "Abono aplicado correctamente" })
        setOpen(false)
        setSelected(null)
        refresh()

        window.open(`/receipts/payment/${result.paymentId}`, "_blank")
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo registrar el pago" })
      }
    })
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(totalBalance)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Facturas a crédito</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input
              className="pl-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por número de factura o cliente..."
            />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((ar) => (
                  <TableRow key={ar.id}>
                    <TableCell className="font-medium">{ar.sale.invoiceCode}</TableCell>
                    <TableCell>{ar.customer.name}</TableCell>
                    <TableCell className="text-right">{formatRD(ar.totalCents)}</TableCell>
                    <TableCell className="text-right">{formatRD(ar.balanceCents)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={() => openPayment(ar)} title="Abonar / Saldar">
                          <HandCoins className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Abonar</span>
                        </Button>
                        {ar.payments.length > 0 && (
                          <Button
                            size="sm"
                            className="bg-purple-primary hover:bg-purple-primary/90 text-white"
                            onClick={() => {
                              setSelectedForReceipts(ar)
                              setOpenReceipts(true)
                            }}
                            title="Ver Recibos"
                          >
                            <Receipt className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Recibos ({ar.payments.length})</span>
                            <span className="sm:hidden">{ar.payments.length}</span>
                          </Button>
                        )}
                        <Button size="sm" asChild className="bg-blue-500 hover:bg-blue-600 text-white" title="Reimprimir">
                          <Link href={`/receipts/sale/${ar.sale.invoiceCode}`} target="_blank">
                            <Printer className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Reimprimir</span>
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {!isLoading && items.length === 0 && (
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
                        <p className="text-lg font-medium text-muted-foreground">No se encontraron cuentas por cobrar</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {query ? "Intenta con otros términos de búsqueda" : "Aún no hay cuentas por cobrar pendientes"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="w-full sm:w-auto"
              >
                {isLoadingMore ? "Cargando..." : "Cargar más"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Registrar abono</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="grid gap-3">
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <CreditCard className="h-4 w-4" /> {selected.sale.invoiceCode}
                </div>
                <div className="text-muted-foreground">{selected.customer.name}</div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <span>Total</span>
                  <span className="font-semibold">{formatRD(selected.totalCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pendiente</span>
                  <span className="font-semibold">{formatRD(selected.balanceCents)}</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Monto a abonar</Label>
                <PriceInput 
                  valueCents={amountCents} 
                  onChangeCents={setAmountCents}
                  maxCents={selected.balanceCents}
                />
                {amountCents > selected.balanceCents && (
                  <div className="text-xs font-medium text-destructive">
                    El monto no puede exceder el balance pendiente ({formatRD(selected.balanceCents)})
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Balance pendiente: {formatRD(selected.balanceCents)}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Método</Label>
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                >
                  {Object.values(PaymentMethod).map((m) => (
                    <option key={m} value={m}>
                      {methodLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label>Nota (opcional)</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              {selected.payments.length > 0 && (
                <div className="rounded-md border p-3 text-sm">
                  <div className="mb-2 font-semibold">Pagos anteriores</div>
                  <div className="grid gap-2">
                    {selected.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-md border p-2">
                        <div className="text-xs text-muted-foreground">
                          {new Date(p.paidAt).toLocaleString("es-DO")}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold">{formatRD(p.amountCents)}</div>
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/receipts/payment/${p.id}`} target="_blank">
                              <Printer className="mr-2 h-4 w-4" /> Reimprimir
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button 
              type="button" 
              onClick={onPay} 
              disabled={isSaving || !selected || amountCents <= 0 || amountCents > (selected?.balanceCents ?? 0)}
            >
              {isSaving ? "Guardando…" : "Guardar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openReceipts} onOpenChange={setOpenReceipts}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              Recibos de Pago{selectedForReceipts?.sale.invoiceCode ? ` - ${selectedForReceipts.sale.invoiceCode}` : ""}
            </DialogTitle>
          </DialogHeader>

          {selectedForReceipts && (
            <div className="grid gap-4">
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <CreditCard className="h-4 w-4" /> {selectedForReceipts.sale.invoiceCode}
                </div>
                <div className="text-muted-foreground">{selectedForReceipts.customer.name}</div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <span>Total</span>
                  <span className="font-semibold">{formatRD(selectedForReceipts.totalCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pendiente</span>
                  <span className="font-semibold">{formatRD(selectedForReceipts.balanceCents)}</span>
                </div>
              </div>

              {selectedForReceipts.payments.length > 0 ? (
                <div className="rounded-md border">
                  <div className="border-b p-3 font-semibold">Recibos de Pago ({selectedForReceipts.payments.length})</div>
                  <div className="divide-y">
                    {selectedForReceipts.payments.map((p) => (
                      <div key={p.id} className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="grid gap-1">
                            <div className="text-sm font-medium">{formatRD(p.amountCents)}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(p.paidAt).toLocaleString("es-DO", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                            <div className="text-xs text-muted-foreground">Método: {methodLabel(p.method)}</div>
                            {p.note && <div className="text-xs text-muted-foreground">Nota: {p.note}</div>}
                          </div>
                          <Button asChild size="sm" variant="secondary">
                            <Link href={`/receipts/payment/${p.id}`} target="_blank">
                              <Printer className="mr-2 h-4 w-4" /> Ver Recibo
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                  No hay recibos de pago registrados
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => setOpenReceipts(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
