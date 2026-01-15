"use client"

import { useEffect, useState, useTransition } from "react"
import { Edit, Plus, Search, Trash2, DollarSign } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"

import { createOperatingExpense, deleteOperatingExpense, listOperatingExpenses, updateOperatingExpense } from "./actions"

type Expense = Awaited<ReturnType<typeof listOperatingExpenses>>[number]

export function OperatingExpensesClient() {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Expense[]>([])
  const [isLoading, startLoading] = useTransition()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("0")
  const [category, setCategory] = useState("")
  const [expenseDate, setExpenseDate] = useState("")
  const [notes, setNotes] = useState("")
  const [isSaving, startSaving] = useTransition()

  function refresh() {
    startLoading(async () => {
      try {
        const r = await listOperatingExpenses()
        setItems(r)
      } catch {
        setItems([])
      }
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  function resetForm(e?: Expense | null) {
    const x = e ?? null
    setEditing(x)
    setDescription(x?.description ?? "")
    setAmount(((x?.amountCents ?? 0) / 100).toFixed(2))
    setCategory(x?.category ?? "")
    setExpenseDate(x?.expenseDate ? new Date(x.expenseDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0])
    setNotes(x?.notes ?? "")
  }

  const title = editing ? "Editar gasto operativo" : "Nuevo gasto operativo"

  async function onSave() {
    startSaving(async () => {
      try {
        const amountCents = toCents(amount)
        const date = expenseDate ? new Date(expenseDate) : new Date()

        if (editing) {
          await updateOperatingExpense({
            id: editing.id,
            description,
            amountCents,
            expenseDate: date,
            category: category || null,
            notes: notes || null,
          })
          toast({ title: "Guardado", description: "Gasto operativo actualizado" })
        } else {
          await createOperatingExpense({
            description,
            amountCents,
            expenseDate: date,
            category: category || null,
            notes: notes || null,
            username: "admin",
          })
          toast({ title: "Guardado", description: "Gasto operativo creado" })
        }
        setOpen(false)
        resetForm(null)
        refresh()
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
      }
    })
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar este gasto operativo?")) return
    try {
      await deleteOperatingExpense(id)
      toast({ title: "Listo", description: "Gasto operativo eliminado" })
      refresh()
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo eliminar" })
    }
  }

  const filteredItems = items.filter((item) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      item.description.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      item.notes?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" /> Gastos Operativos
            </CardTitle>
            <div className="text-sm text-muted-foreground">Registra y consulta gastos operativos de la empresa.</div>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(null) }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(null); setOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px]">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Descripción *</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Pago de arriendo" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Monto (RD$) *</Label>
                    <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Fecha *</Label>
                    <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Categoría (opcional)</Label>
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ej: Arriendo, Sueldos, Servicios, Marketing" />
                </div>

                <div className="grid gap-2">
                  <Label>Notas (opcional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="secondary" onClick={() => setOpen(false)} type="button">
                  Cancelar
                </Button>
                <Button onClick={onSave} disabled={isSaving} type="button">
                  {isSaving ? "Guardando…" : "Guardar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por descripción, categoría o notas" />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{new Date(item.expenseDate).toLocaleDateString("es-DO")}</TableCell>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell>{item.category ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatRD(item.amountCents)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={() => {
                            resetForm(item)
                            setOpen(true)
                          }}
                          aria-label="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} aria-label="Eliminar">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      {isLoading ? "Cargando…" : query ? "No se encontraron gastos" : "No hay gastos operativos"}
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











