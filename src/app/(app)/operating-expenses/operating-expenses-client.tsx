"use client"

import { useEffect, useState, useTransition } from "react"
import { Edit, Plus, Search, Trash2, DollarSign, Filter } from "lucide-react"
import { PaymentMethod } from "@prisma/client"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"
import {
  CREATE_TREASURY_ACCOUNT_OPTION_VALUE,
  CREATE_TREASURY_ACCOUNT_URL,
  filterTreasuryAccountsByPaymentMethod,
  isCreateTreasuryAccountOption,
  pickTreasuryAccountIdForPaymentMethod,
} from "@/lib/treasury-account-selection"
import { listTreasuryAccounts } from "../treasury/actions"

import {
  createOperatingExpense,
  deleteOperatingExpense,
  listOperatingExpenseCategories,
  listOperatingExpenses,
  updateOperatingExpense,
} from "./actions"

type Expense = Awaited<ReturnType<typeof listOperatingExpenses>>[number]
type TreasuryAccountOption = Awaited<ReturnType<typeof listTreasuryAccounts>>[number]
const BUSINESS_TZ_OFFSET_MS = -4 * 60 * 60 * 1000

function toInputDateValue(value: Date | string) {
  const d = new Date(value)
  const shifted = new Date(d.getTime() + BUSINESS_TZ_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function fromInputDateValue(value: string) {
  const [y, m, day] = value.split("-").map((x) => Number(x))
  return new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0) - BUSINESS_TZ_OFFSET_MS)
}

export function OperatingExpensesClient() {
  const router = useRouter()
  const today = toInputDateValue(new Date())
  const [query, setQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState<string>("__all__")
  const [items, setItems] = useState<Expense[]>([])
  const [savedCategories, setSavedCategories] = useState<string[]>([])
  const [isLoading, startLoading] = useTransition()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [appliedFromDate, setAppliedFromDate] = useState(today)
  const [appliedToDate, setAppliedToDate] = useState(today)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("0")
  const [category, setCategory] = useState("")
  const [expenseDate, setExpenseDate] = useState("")
  const [notes, setNotes] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO)
  const [treasuryAccountId, setTreasuryAccountId] = useState("")
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccountOption[]>([])
  const availableTreasuryAccounts = filterTreasuryAccountsByPaymentMethod(treasuryAccounts, paymentMethod)
  const [isSaving, startSaving] = useTransition()

  function refresh(input?: { from?: string; to?: string }) {
    startLoading(async () => {
      try {
        const r = await listOperatingExpenses(input)
        setItems(r)
      } catch {
        setItems([])
      }
    })
  }

  useEffect(() => {
    refresh({ from: appliedFromDate, to: appliedToDate })
  }, [appliedFromDate, appliedToDate])

  useEffect(() => {
    startLoading(async () => {
      try {
        const categories = await listOperatingExpenseCategories()
        setSavedCategories(categories)
      } catch {
        setSavedCategories([])
      }
    })
  }, [])

  useEffect(() => {
    startLoading(async () => {
      try {
        const accounts = await listTreasuryAccounts()
        setTreasuryAccounts(accounts)
        if (accounts[0]) {
          setTreasuryAccountId((current) =>
            current || pickTreasuryAccountIdForPaymentMethod(accounts, PaymentMethod.EFECTIVO)
          )
        }
      } catch {
        setTreasuryAccounts([])
      }
    })
  }, [])

  useEffect(() => {
    const nextTreasuryAccountId = pickTreasuryAccountIdForPaymentMethod(
      treasuryAccounts,
      paymentMethod,
      treasuryAccountId
    )
    if (nextTreasuryAccountId !== treasuryAccountId) {
      setTreasuryAccountId(nextTreasuryAccountId)
    }
  }, [treasuryAccounts, paymentMethod, treasuryAccountId])

  function resetForm(e?: Expense | null) {
    const x = e ?? null
    setEditing(x)
    setDescription(x?.description ?? "")
    setAmount(((x?.amountCents ?? 0) / 100).toFixed(2))
    setCategory(x?.category ?? "")
    setExpenseDate(x?.expenseDate ? toInputDateValue(x.expenseDate) : toInputDateValue(new Date()))
    setNotes(x?.notes ?? "")
    const nextMethod = (x?.paymentMethod as PaymentMethod) ?? PaymentMethod.EFECTIVO
    setPaymentMethod(nextMethod)
    setTreasuryAccountId(
      pickTreasuryAccountIdForPaymentMethod(treasuryAccounts, nextMethod, x?.treasuryAccountId ?? treasuryAccountId)
    )
  }

  const title = editing ? "Editar gasto operativo" : "Nuevo gasto operativo"

  async function onSave() {
    startSaving(async () => {
      try {
        const amountCents = toCents(amount)
        const date = expenseDate ? fromInputDateValue(expenseDate) : new Date()
        if (!availableTreasuryAccounts.some((account) => account.id === treasuryAccountId)) {
          throw new Error("Selecciona una cuenta de tesorería")
        }

        if (editing) {
          await updateOperatingExpense({
            id: editing.id,
            description,
            amountCents,
            paymentMethod,
            treasuryAccountId,
            expenseDate: date,
            category: category || null,
            notes: notes || null,
          })
          toast({ title: "Guardado", description: "Gasto operativo actualizado" })
        } else {
          await createOperatingExpense({
            description,
            amountCents,
            paymentMethod,
            treasuryAccountId,
            expenseDate: date,
            category: category || null,
            notes: notes || null,
          })
          toast({ title: "Guardado", description: "Gasto operativo creado" })
        }
        const normalizedCategory = category.trim()
        if (normalizedCategory && !savedCategories.some((c) => c.toLowerCase() === normalizedCategory.toLowerCase())) {
          setSavedCategories((prev) => [...prev, normalizedCategory].sort((a, b) => a.localeCompare(b)))
        }
        setOpen(false)
        resetForm(null)
        refresh({ from: appliedFromDate, to: appliedToDate })
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
      refresh({ from: appliedFromDate, to: appliedToDate })
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo eliminar" })
    }
  }

  function onApplyDateFilter() {
    if (!fromDate || !toDate) {
      toast({ title: "Rango inválido", description: "Selecciona fecha desde y hasta." })
      return
    }
    if (fromDate > toDate) {
      toast({ title: "Rango inválido", description: "La fecha desde no puede ser mayor que la fecha hasta." })
      return
    }
    setAppliedFromDate(fromDate)
    setAppliedToDate(toDate)
  }

  const filteredItems = items.filter((item) => {
    // Filtro por categoría
    if (filterCategory !== "__all__") {
      if (filterCategory === "__none__") {
        if (item.category) return false
      } else {
        if (item.category?.toLowerCase() !== filterCategory.toLowerCase()) return false
      }
    }
    // Filtro por texto
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Monto (RD$) *</Label>
                    <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Fecha *</Label>
                    <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Método de pago *</Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(value) => {
                        const nextMethod = value as PaymentMethod
                        setPaymentMethod(nextMethod)
                        setTreasuryAccountId((current) =>
                          pickTreasuryAccountIdForPaymentMethod(treasuryAccounts, nextMethod, current)
                        )
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PaymentMethod.EFECTIVO}>Efectivo</SelectItem>
                        <SelectItem value={PaymentMethod.TRANSFERENCIA}>Transferencia</SelectItem>
                        <SelectItem value={PaymentMethod.TARJETA}>Tarjeta</SelectItem>
                        <SelectItem value={PaymentMethod.OTRO}>Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Cuenta de tesorería *</Label>
                    <Select
                      value={treasuryAccountId}
                      onValueChange={(value) => {
                        if (isCreateTreasuryAccountOption(value)) {
                          router.push(CREATE_TREASURY_ACCOUNT_URL)
                          return
                        }
                        setTreasuryAccountId(value)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una cuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTreasuryAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={CREATE_TREASURY_ACCOUNT_OPTION_VALUE}>+ Crear nueva cuenta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Categoría (opcional)</Label>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Ej: Arriendo, Sueldos, Servicios, Marketing"
                    list="operating-expense-categories"
                  />
                  <datalist id="operating-expense-categories">
                    {savedCategories.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
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
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" /> Categoría
              </Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="__none__">Sin categoría</SelectItem>
                  {savedCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="secondary" type="button" onClick={onApplyDateFilter}>
              Aplicar
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input
              className="pl-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por descripción, categoría o notas"
            />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[600px]">
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
                    <TableCell>{new Date(item.expenseDate).toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo" })}</TableCell>
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











