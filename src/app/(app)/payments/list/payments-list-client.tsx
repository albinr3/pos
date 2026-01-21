"use client"

import { useEffect, useState, useTransition } from "react"
import { Receipt, Trash2, Search, Printer } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD } from "@/lib/money"
import type { CurrentUser } from "@/lib/auth"

import { cancelPayment, listAllPayments } from "../../ar/actions"

type Payment = Awaited<ReturnType<typeof listAllPayments>>[number]

function methodLabel(method: string) {
  switch (method) {
    case "EFECTIVO":
      return "Efectivo"
    case "TRANSFERENCIA":
      return "Transferencia"
    case "TARJETA":
      return "Tarjeta"
    default:
      return "Otro"
  }
}

export function PaymentsListClient() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [isLoading, startLoading] = useTransition()
  const [query, setQuery] = useState("")
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
        const r = await listAllPayments()
        setPayments(r)
      } catch {
        setPayments([])
      }
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCancel(id: string) {
    if (!confirm("¿Cancelar este recibo? Se recalculará el balance de la cuenta por cobrar.")) return
    try {
      await cancelPayment(id)
      toast({ title: "Listo", description: "Recibo cancelado" })
      refresh()
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo cancelar" })
    }
  }

  const filteredPayments = payments.filter((p) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      p.ar.sale.invoiceCode.toLowerCase().includes(q) ||
      p.ar.customer.name.toLowerCase().includes(q) ||
      methodLabel(p.method).toLowerCase().includes(q)
    )
  })

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Lista de Recibos
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por factura, cliente o método" />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((p) => (
                  <TableRow key={p.id} className={p.cancelledAt ? "bg-red-50" : ""}>
                    <TableCell>
                      {new Date(p.paidAt).toLocaleDateString("es-DO")}
                      {p.cancelledAt && <div className="text-xs text-red-600 font-semibold">CANCELADO</div>}
                    </TableCell>
                    <TableCell className="font-medium">{p.ar.sale.invoiceCode}</TableCell>
                    <TableCell>{p.ar.customer.name}</TableCell>
                    <TableCell>{methodLabel(p.method)}</TableCell>
                    <TableCell className="text-right font-medium">{formatRD(p.amountCents)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!p.cancelledAt && (
                          <Button
                            className="bg-red-500 hover:bg-red-600 text-white"
                            size="icon"
                            onClick={() => handleCancel(p.id)}
                            aria-label="Cancelar"
                            title="Cancelar"
                            disabled={!user || (!user.canCancelPayments && user.role !== "ADMIN")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button asChild size="icon" className="bg-blue-500 hover:bg-blue-600 text-white" title="Ver recibo">
                          <Link href={`/receipts/payment/${p.id}`} target="_blank" aria-label="Ver recibo">
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                        {p.cancelledAt && (
                          <span className="text-xs text-red-600">Cancelado {new Date(p.cancelledAt).toLocaleDateString("es-DO")}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {!isLoading && filteredPayments.length === 0 && (
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
                        <p className="text-lg font-medium text-muted-foreground">No se encontraron recibos</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {query ? "Intenta con otros términos de búsqueda" : "Aún no se han registrado recibos"}
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
    </div>
  )
}















