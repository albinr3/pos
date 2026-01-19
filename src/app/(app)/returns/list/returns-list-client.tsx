"use client"

import { useEffect, useState, useTransition } from "react"
import { Trash2, Search, Receipt } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { formatRD } from "@/lib/money"

import { cancelReturn, listReturns } from "../actions"

type Return = Awaited<ReturnType<typeof listReturns>>[number]

export function ReturnsListClient() {
  const [returns, setReturns] = useState<Return[]>([])
  const [isLoading, startLoading] = useTransition()
  const [query, setQuery] = useState("")
  const [openCancel, setOpenCancel] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [isCancelling, startCancelling] = useTransition()

  function refresh() {
    startLoading(async () => {
      try {
        const r = await listReturns()
        setReturns(r)
      } catch {
        setReturns([])
      }
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  const filtered = returns.filter((r) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      r.returnCode.toLowerCase().includes(q) ||
      r.sale.invoiceCode.toLowerCase().includes(q) ||
      r.sale.customer?.name.toLowerCase().includes(q) ||
      r.user.name.toLowerCase().includes(q)
    )
  })

  async function handleCancel(id: string) {
    setCancellingId(id)
    setOpenCancel(true)
  }

  async function confirmCancel() {
    if (!cancellingId) return

    startCancelling(async () => {
      try {
        await cancelReturn(cancellingId)
        toast({ title: "Cancelada", description: "Devolución cancelada exitosamente" })
        setOpenCancel(false)
        setCancellingId(null)
        refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error cancelando devolución"
        toast({ title: "Error", description: msg })
      }
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Devoluciones</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-64 pl-8"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Devolución</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <img
                          src="/lupa.png"
                          alt="No hay resultados"
                          width={192}
                          height={192}
                          className="mb-4 opacity-60"
                        />
                        <p className="text-lg font-medium text-muted-foreground">No se encontraron devoluciones</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {query ? "Intenta con otros términos de búsqueda" : "Aún no se han registrado devoluciones"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.returnCode}</TableCell>
                      <TableCell>
                        <Link
                          href={`/sales/list`}
                          className="text-primary hover:underline"
                          target="_blank"
                        >
                          {r.sale.invoiceCode}
                        </Link>
                      </TableCell>
                      <TableCell>{r.sale.customer?.name ?? "Cliente genérico"}</TableCell>
                      <TableCell>
                        {new Date(r.returnedAt).toLocaleString("es-DO", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>{r.user.name}</TableCell>
                      <TableCell className="text-right">{formatRD(r.totalCents)}</TableCell>
                      <TableCell>
                        {r.cancelledAt ? (
                          <Badge variant="destructive">Cancelada</Badge>
                        ) : (
                          <Badge variant="default">Activa</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            className="bg-blue-500 hover:bg-blue-600 text-white"
                            size="icon"
                            onClick={() => window.open(`/receipts/return/${r.returnCode}`, "_blank")}
                            title="Ver recibo"
                          >
                            <Receipt className="h-4 w-4" />
                          </Button>
                          {!r.cancelledAt && (
                            <Button
                              className="bg-red-500 hover:bg-red-600 text-white"
                              size="icon"
                              onClick={() => handleCancel(r.id)}
                              title="Cancelar devolución"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={openCancel} onOpenChange={setOpenCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Devolución</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              ¿Estás seguro de que deseas cancelar esta devolución? Esta acción revertirá el stock y los cambios en
              cuentas por cobrar.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCancel(false)} disabled={isCancelling}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={isCancelling}>
              {isCancelling ? "Cancelando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

