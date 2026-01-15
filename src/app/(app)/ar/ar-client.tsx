"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"

import { CreditCard, HandCoins, Printer, Receipt } from "lucide-react"
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

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<AR | null>(null)
  const [amountCents, setAmountCents] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO)
  const [note, setNote] = useState("")
  const [isSaving, startSaving] = useTransition()

  const [openReceipts, setOpenReceipts] = useState(false)
  const [selectedForReceipts, setSelectedForReceipts] = useState<AR | null>(null)

  function refresh() {
    startLoading(async () => {
      try {
        const r = await listOpenAR()
        setItems(r)
      } catch {
        setItems([])
      }
    })
  }

  useEffect(() => {
    refresh()
  }, [])

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
        <CardContent>
          <div className="rounded-md border">
            <Table>
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
                        <Button variant="secondary" onClick={() => openPayment(ar)}>
                          <HandCoins className="mr-2 h-4 w-4" /> Abonar / Saldar
                        </Button>
                        {ar.payments.length > 0 && (
                          <Button variant="outline" onClick={() => { setSelectedForReceipts(ar); setOpenReceipts(true) }}>
                            <Receipt className="mr-2 h-4 w-4" /> Ver Recibos ({ar.payments.length})
                          </Button>
                        )}
                        <Button asChild variant="ghost">
                          <Link href={`/receipts/sale/${ar.sale.invoiceCode}`} target="_blank">
                            <Printer className="mr-2 h-4 w-4" /> Reimprimir
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      {isLoading ? "Cargando…" : "No hay cuentas por cobrar pendientes"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
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
