"use client"

import { useEffect, useState, useTransition } from "react"
import { FileText, Trash2, Search } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD } from "@/lib/money"

import { listQuotes, deleteQuote } from "../actions"

type Quote = Awaited<ReturnType<typeof listQuotes>>[number]

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-DO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d))
}

export function QuotesListClient() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [isLoading, startLoading] = useTransition()
  const [query, setQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null)
  const [isDeleting, startDeleting] = useTransition()

  function refresh() {
    startLoading(async () => {
      try {
        const r = await listQuotes()
        setQuotes(r)
      } catch {
        setQuotes([])
      }
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  const filteredQuotes = quotes.filter((q) => {
    if (!query.trim()) return true
    const qLower = query.toLowerCase()
    return (
      q.quoteCode.toLowerCase().includes(qLower) ||
      q.customer?.name.toLowerCase().includes(qLower) ||
      false
    )
  })

  async function handleDelete() {
    if (!quoteToDelete) return

    startDeleting(async () => {
      try {
        await deleteQuote(quoteToDelete.id)
        toast({ title: "Cotización eliminada", description: `Cotización ${quoteToDelete.quoteCode} eliminada` })
        setDeleteDialogOpen(false)
        setQuoteToDelete(null)
        refresh()
      } catch (e) {
        toast({
          title: "Error",
          description: e instanceof Error ? e.message : "No se pudo eliminar la cotización",
        })
      }
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Cotizaciones</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por código o cliente..."
                  className="w-64 pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : filteredQuotes.length === 0 ? (
            <div className="py-12">
              <div className="flex flex-col items-center justify-center text-center">
                <img
                  src="/lupa.png"
                  alt="No hay resultados"
                  width={192}
                  height={192}
                  className="mb-4 opacity-60"
                />
                <p className="text-lg font-medium text-muted-foreground">No se encontraron cotizaciones</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {query ? "Intenta con otros términos de búsqueda" : "Aún no se han registrado cotizaciones"}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Válida hasta</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuotes.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell className="font-medium">{quote.quoteCode}</TableCell>
                      <TableCell>{quote.customer?.name ?? "Cliente general"}</TableCell>
                      <TableCell>{fmtDate(quote.quotedAt)}</TableCell>
                      <TableCell>{quote.validUntil ? fmtDate(quote.validUntil) : "—"}</TableCell>
                      <TableCell className="text-right">{formatRD(quote.totalCents)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild className="bg-blue-500 hover:bg-blue-600 text-white" size="sm" title="Ver PDF">
                            <Link href={`/quotes/${quote.quoteCode}`} target="_blank">
                              <FileText className="mr-2 h-4 w-4" /> Ver PDF
                            </Link>
                          </Button>
                          <Button
                            className="bg-red-500 hover:bg-red-600 text-white"
                            size="sm"
                            onClick={() => {
                              setQuoteToDelete(quote)
                              setDeleteDialogOpen(true)
                            }}
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar cotización</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              ¿Estás seguro de que deseas eliminar la cotización <strong>{quoteToDelete?.quoteCode}</strong>?
              Esta acción no se puede deshacer.
            </p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}










