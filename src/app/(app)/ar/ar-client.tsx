"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"

import { CheckSquare, Clock3, CreditCard, HandCoins, Printer, Receipt, Search, WifiOff } from "lucide-react"
import { PaymentMethod } from "@prisma/client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DOMINICAN_BANKS } from "@/lib/dominican-banks"
import { formatDateDO, formatDateTimeDO } from "@/lib/date-time"
import { formatPaymentWithBank, getPaymentMethodLabel } from "@/lib/payment-methods"
import { toast } from "@/hooks/use-toast"
import { formatRD } from "@/lib/money"
import { PriceInput } from "@/components/app/price-input"
import { useOnlineStatus } from "@/hooks/use-online-status"
import {
  savePendingPayment,
  savePendingBatchPayment,
  getARCache,
  getPendingCounts,
} from "@/lib/indexed-db"
import { syncARToIndexedDB } from "@/app/(app)/sync/actions"
import { saveARCache } from "@/lib/indexed-db"

import { addPayment, addBatchPayment, getARSummaryStats, listOpenAR } from "./actions"

type AR = Awaited<ReturnType<typeof listOpenAR>>[number]

function methodLabel(m: PaymentMethod) {
  return getPaymentMethodLabel(m)
}

function formatCustomerLabel(customer?: { visualId?: number | null; name?: string | null } | null) {
  const name = customer?.name?.trim() || "Cliente"
  if (typeof customer?.visualId !== "number") return name
  return `(${customer.visualId}) ${name}`
}

function parseVisualIdSearch(rawQuery: string) {
  const trimmed = rawQuery.trim()
  if (!trimmed) return null

  // Acepta formatos: 12, #12, (12)
  if (!/^[#(]?\s*\d+\s*\)?$/.test(trimmed)) return null
  const digits = trimmed.replace(/\D/g, "")
  return digits || null
}

function matchesARQuery(
  ar: {
    sale?: { invoiceCode?: string | null } | null
    customer?: { name?: string | null; visualId?: number | null } | null
  },
  rawQuery: string
) {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true

  const visualIdText = String(ar.customer?.visualId ?? "")
  const normalizedVisualSearch = parseVisualIdSearch(q)

  return (
    (ar.sale?.invoiceCode || "").toLowerCase().includes(q) ||
    (ar.customer?.name || "").toLowerCase().includes(q) ||
    (normalizedVisualSearch ? visualIdText.includes(normalizedVisualSearch) : false)
  )
}

function isOverdueFromDueDate(dueDate: Date | string | null | undefined) {
  if (!dueDate) return false
  const due = new Date(dueDate)
  const today = new Date()
  due.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return due.getTime() <= today.getTime()
}

function compareByCustomerAndDate(a: { customer?: { name?: string | null } | null; createdAt?: Date | string | null }, b: { customer?: { name?: string | null } | null; createdAt?: Date | string | null }) {
  const nameA = (a.customer?.name ?? "").toLocaleLowerCase()
  const nameB = (b.customer?.name ?? "").toLocaleLowerCase()
  const byName = nameA.localeCompare(nameB, "es")
  if (byName !== 0) return byName

  const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0
  const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0
  return createdAtA - createdAtB
}

export function ARClient() {
  const isOnline = useOnlineStatus()
  const [mounted, setMounted] = useState(false)
  const [items, setItems] = useState<AR[]>([])
  
  // Evitar error de hidratación: solo mostrar indicador después de montar
  useEffect(() => {
    setMounted(true)
  }, [])
  const [isLoading, startLoading] = useTransition()
  const [query, setQuery] = useState("")
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [skip, setSkip] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, startLoadingMore] = useTransition()

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<AR | null>(null)
  const [amountCents, setAmountCents] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO)
  const [transferBankName, setTransferBankName] = useState("")
  const [note, setNote] = useState("")
  const [isSaving, startSaving] = useTransition()
  const [pendingCounts, setPendingCounts] = useState({ sales: 0, payments: 0 })
  const [summary, setSummary] = useState({
    openBalanceCents: 0,
    openCount: 0,
    overdueCount: 0,
  })

  const [openReceipts, setOpenReceipts] = useState(false)
  const [selectedForReceipts, setSelectedForReceipts] = useState<AR | null>(null)

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [openBatch, setOpenBatch] = useState(false)
  const [batchAmountCents, setBatchAmountCents] = useState(0)
  const [batchMethod, setBatchMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO)
  const [batchTransferBankName, setBatchTransferBankName] = useState("")
  const [batchNote, setBatchNote] = useState("")
  const [isBatchSaving, startBatchSaving] = useTransition()
  const paymentMethods = [
    PaymentMethod.EFECTIVO,
    PaymentMethod.TRANSFERENCIA,
    PaymentMethod.TARJETA,
    PaymentMethod.OTRO,
  ]

  function isLikelyOfflineError(error: unknown) {
    if (typeof navigator !== "undefined" && !navigator.onLine) return true
    if (error instanceof TypeError) return true
    if (error instanceof Error) {
      const msg = error.message.toLowerCase()
      return msg.includes("failed to fetch") || msg.includes("network") || msg.includes("fetch")
    }
    return false
  }

  function refresh() {
    setSkip(0)
    startLoading(async () => {
      try {
        if (isOnline) {
          try {
            const [r, stats] = await Promise.all([
              listOpenAR({ query, overdueOnly, skip: 0, take: 10 }),
              getARSummaryStats(),
            ])
            setItems(r as any)
            setHasMore(r.length === 10)
            setSummary(stats)

            // Pre-cargar a IndexedDB
            try {
              const arData = await syncARToIndexedDB()
              await saveARCache(arData)
            } catch (error) {
              console.error("Error pre-cargando AR:", error)
            }
            return
          } catch {
            // Fallback a cache local
          }
        }

        // Cargar desde cache offline
        const cached = (await getARCache()).map((item: any) => ({
          ...item,
          payments: item.payments ?? [],
        }))
        const overdueCount = cached.filter((ar: any) => isOverdueFromDueDate(ar.dueDate)).length
        const openBalanceCents = cached.reduce((sum: number, ar: any) => sum + (ar.balanceCents ?? 0), 0)
        setSummary({
          openBalanceCents,
          openCount: cached.length,
          overdueCount,
        })
        // Filtrar por query si existe
        let filtered = cached
        if (query.trim()) {
          filtered = cached.filter((ar: any) => matchesARQuery(ar, query))
        }
        if (overdueOnly) {
          filtered = filtered.filter((ar: any) => isOverdueFromDueDate(ar.dueDate))
        }
        filtered = [...filtered].sort(compareByCustomerAndDate)
        setItems(filtered.slice(0, 10) as any)
        setHasMore(filtered.length > 10)
      } catch {
        setItems([])
        setHasMore(false)
        setSummary({ openBalanceCents: 0, openCount: 0, overdueCount: 0 })
      }
    })
  }

  function loadMore() {
    startLoadingMore(async () => {
      try {
        if (isOnline) {
          try {
            const newSkip = skip + 10
            const r = await listOpenAR({ query, overdueOnly, skip: newSkip, take: 10 })
            setItems((prev) => [...prev, ...r])
            setSkip(newSkip)
            setHasMore(r.length === 10)
            return
          } catch {
            // Fallback a cache local
          }
        }

        // Cargar mas desde cache offline
        const cached = (await getARCache()).map((item: any) => ({
          ...item,
          payments: item.payments ?? [],
        }))
        let filtered = cached
        if (query.trim()) {
          filtered = cached.filter((ar: any) => matchesARQuery(ar, query))
        }
        if (overdueOnly) {
          filtered = filtered.filter((ar: any) => isOverdueFromDueDate(ar.dueDate))
        }
        filtered = [...filtered].sort(compareByCustomerAndDate)
        const newSkip = skip + 10
        const more = filtered.slice(newSkip, newSkip + 10)
        setItems((prev) => [...prev, ...more] as any)
        setSkip(newSkip)
        setHasMore(filtered.length > newSkip + 10)
      } catch {
        setHasMore(false)
      }
    })
  }

  useEffect(() => {
    refresh()
    
    // Actualizar contadores de pendientes
    const updatePendingCounts = async () => {
      const counts = await getPendingCounts()
      setPendingCounts(counts)
    }
    updatePendingCounts()
    const interval = setInterval(updatePendingCounts, 5000) // Actualizar cada 5 segundos
    
    return () => clearInterval(interval)
  }, [query, overdueOnly, isOnline])

  // Multi-select helpers
  const selectedItems = useMemo(() => items.filter((i) => selectedIds.has(i.id)), [items, selectedIds])
  const selectedCustomerId = selectedItems.length > 0 ? selectedItems[0].customerId : null
  const selectedTotalBalance = useMemo(() => selectedItems.reduce((s, i) => s + i.balanceCents, 0), [selectedItems])
  const selectablePageIds = useMemo(() => {
    const targetCustomerId = selectedCustomerId ?? items[0]?.customerId
    if (!targetCustomerId) return [] as string[]
    return items.filter((i) => i.customerId === targetCustomerId).map((i) => i.id)
  }, [items, selectedCustomerId])
  const isPageSelectionComplete = useMemo(
    () => selectablePageIds.length > 0 && selectablePageIds.every((id) => selectedIds.has(id)),
    [selectablePageIds, selectedIds]
  )

  const toggleSelect = useCallback((ar: AR) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(ar.id)) {
        next.delete(ar.id)
        return next
      }
      // Verificar que es del mismo cliente
      if (next.size > 0) {
        const firstSelected = items.find((i) => next.has(i.id))
        if (firstSelected && firstSelected.customerId !== ar.customerId) {
          toast({
            title: "Cliente diferente",
            description: "Solo puedes seleccionar facturas del mismo cliente",
            variant: "destructive",
          })
          return prev
        }
      }
      next.add(ar.id)
      return next
    })
  }, [items])

  const toggleSelectAll = useCallback(() => {
    if (selectablePageIds.length === 0) return

    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (isPageSelectionComplete) {
        for (const id of selectablePageIds) next.delete(id)
      } else {
        for (const id of selectablePageIds) next.add(id)
      }
      return next
    })
  }, [isPageSelectionComplete, selectablePageIds])

  function openBatchPayment() {
    if (selectedItems.length === 0) return
    setBatchAmountCents(selectedTotalBalance)
    setBatchMethod(PaymentMethod.EFECTIVO)
    setBatchTransferBankName("")
    setBatchNote("")
    setOpenBatch(true)
  }

  async function onBatchPay() {
    if (selectedItems.length === 0) return

    if (batchAmountCents <= 0) {
      toast({ title: "Error", description: "El monto debe ser mayor a cero", variant: "destructive" })
      return
    }
    if (batchAmountCents > selectedTotalBalance) {
      toast({ title: "Error", description: `No puedes pagar más del balance pendiente (${formatRD(selectedTotalBalance)})`, variant: "destructive" })
      return
    }
    if (batchMethod === PaymentMethod.TRANSFERENCIA && !batchTransferBankName) {
      toast({ title: "Banco requerido", description: "Debes seleccionar el banco de la transferencia", variant: "destructive" })
      return
    }

    startBatchSaving(async () => {
      try {
        if (!isOnline) {
          const sortedItems = [...selectedItems].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          const tempId = `temp_batch_payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          await savePendingBatchPayment({
            tempId,
            arIds: sortedItems.map((i) => i.id),
            amountCents: batchAmountCents,
            method: batchMethod as string,
            transferBankName: batchMethod === PaymentMethod.TRANSFERENCIA ? batchTransferBankName : null,
            note: batchNote || null,
            username: "admin",
            createdAt: Date.now(),
          })
          toast({ title: "Pago múltiple guardado (offline)", description: "Se sincronizará cuando vuelva la conexión" })
          const counts = await getPendingCounts()
          setPendingCounts(counts)
        } else {
          const result = await addBatchPayment({
            arIds: selectedItems.map((i) => i.id),
            amountCents: batchAmountCents,
            method: batchMethod,
            transferBankName: batchMethod === PaymentMethod.TRANSFERENCIA ? batchTransferBankName : null,
            note: batchNote || null,
          })
          toast({ title: "Pago registrado", description: `${selectedItems.length} factura(s) cobradas correctamente` })
          window.open(`/api/print/payment/${result.paymentIds[0]}`, "_blank")
        }

        setOpenBatch(false)
        setSelectedIds(new Set())
        refresh()
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo registrar el pago", variant: "destructive" })
      }
    })
  }

  function openPayment(ar: AR) {
    setSelected(ar)
    setAmountCents(ar.balanceCents ?? 0)
    setMethod(PaymentMethod.EFECTIVO)
    setTransferBankName("")
    setNote("")
    setOpen(true)
  }

  async function onPay() {
    if (!selected) return

    // Validar que el monto no exceda el balance
    if (amountCents > selected.balanceCents) {
      toast({
        title: "Error",
        description: `No puedes abonar m s del balance pendiente (${formatRD(selected.balanceCents)})`,
        variant: "destructive",
      })
      return
    }

    if (amountCents <= 0) {
      toast({
        title: "Error",
        description: "El monto debe ser mayor a cero",
        variant: "destructive",
      })
      return
    }

    if (method === PaymentMethod.TRANSFERENCIA && !transferBankName) {
      toast({
        title: "Banco requerido",
        description: "Debes seleccionar el banco de la transferencia",
        variant: "destructive",
      })
      return
    }

    const savePaymentOffline = async (finalAmount: number) => {
      const tempId = `temp_payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      await savePendingPayment({
        tempId,
        arId: selected.id,
        amountCents: finalAmount,
        method: method as string,
        transferBankName: method === PaymentMethod.TRANSFERENCIA ? transferBankName : null,
        note: note || null,
        username: "admin",
        createdAt: Date.now(),
      })

      toast({
        title: "Pago guardado (offline)",
        description: "Se guardar  cuando vuelva la conexi¢n",
      })

      const counts = await getPendingCounts()
      setPendingCounts(counts)

      // Actualizar balance localmente (para mostrar en UI)
      setItems((prev) =>
        prev.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                balanceCents: item.balanceCents - finalAmount,
                status: item.balanceCents - finalAmount === 0 ? "PAGADA" : "PARCIAL",
              }
            : item
        )
      )
    }

    startSaving(async () => {
      try {
        // Asegurar que no se exceda el balance (por si acaso)
        const finalAmount = Math.min(amountCents, selected.balanceCents)

        if (!isOnline) {
          await savePaymentOffline(finalAmount)
        } else {
          try {
            const result = await addPayment({
              arId: selected.id,
              amountCents: finalAmount,
              method,
              transferBankName: method === PaymentMethod.TRANSFERENCIA ? transferBankName : null,
              note: note || null,
            })
            toast({ title: "Pago registrado", description: "Abono aplicado correctamente" })
            window.open(`/api/print/payment/${result.paymentId}`, "_blank")
          } catch (e) {
            if (isLikelyOfflineError(e)) {
              await savePaymentOffline(finalAmount)
            } else {
              throw e
            }
          }
        }

        setOpen(false)
        setSelected(null)
        setTransferBankName("")
        refresh()
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo registrar el pago" })
      }
    })
  }

  return (
    <div className="grid gap-6">
      {/* Indicador de modo offline */}
      {mounted && !isOnline && (
        <div className="rounded-md border border-yellow-500 bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4" />
            <span className="font-semibold">Modo offline</span>
            <span className="text-muted-foreground">
              {pendingCounts.sales > 0 && `${pendingCounts.sales} venta(s) pendiente(s)`}
              {pendingCounts.sales > 0 && pendingCounts.payments > 0 && " • "}
              {pendingCounts.payments > 0 && `${pendingCounts.payments} pago(s) pendiente(s)`}
            </span>
          </div>
        </div>
      )}
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(summary.openBalanceCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{summary.openCount} facturas</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Facturas vencidas</CardTitle>
            <Clock3 className="h-5 w-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-rose-500">{summary.overdueCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">facturas</div>
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
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded accent-rose-500"
              checked={overdueOnly}
              onChange={(e) => {
                setSelectedIds(new Set())
                setOverdueOnly(e.target.checked)
              }}
            />
            Solo facturas vencidas
          </label>

          {/* Barra de acciones batch */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-500 bg-green-50 p-3 text-sm dark:bg-green-900/20">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-green-600" />
                <span className="font-semibold text-green-800 dark:text-green-200">
                  {selectedIds.size} factura(s) seleccionada(s)
                </span>
                <span className="text-green-700 dark:text-green-300">
                  — Total: {formatRD(selectedTotalBalance)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Deseleccionar
                </Button>
                <Button
                  size="sm"
                  className="bg-green-500 hover:bg-green-600 text-white"
                  onClick={openBatchPayment}
                >
                  <HandCoins className="h-4 w-4 mr-2" />
                  Cobrar seleccionadas
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-green-500 cursor-pointer"
                      checked={isPageSelectionComplete}
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((ar) => {
                  const isOverdue = isOverdueFromDueDate(ar.dueDate)
                  const daysUntilDue = ar.dueDate 
                    ? Math.ceil((new Date(ar.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                    : null
                  
                  const isChecked = selectedIds.has(ar.id)
                  const isDisabled = selectedCustomerId !== null && ar.customerId !== selectedCustomerId && !isChecked
                  const disableIndividualPay = selectedIds.size > 1 && isChecked

                  return (
                  <TableRow key={ar.id} className={isChecked ? "bg-green-50/50 dark:bg-green-900/10" : ""}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded accent-green-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        checked={isChecked}
                        disabled={isDisabled}
                        onChange={() => toggleSelect(ar)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{ar.sale.invoiceCode}</TableCell>
                    <TableCell>{formatCustomerLabel(ar.customer)}</TableCell>
                    <TableCell>
                      {ar.dueDate ? (
                        <div className="text-sm">
                          <div className={isOverdue ? "font-semibold text-red-600" : daysUntilDue !== null && daysUntilDue <= 7 ? "font-semibold text-amber-600" : ""}>
                            {formatDateDO(ar.dueDate, {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                            })}
                          </div>
                          {isOverdue && (
                            <div className="text-xs text-red-500">Vencida</div>
                          )}
                          {!isOverdue && daysUntilDue !== null && daysUntilDue <= 7 && daysUntilDue > 0 && (
                            <div className="text-xs text-amber-600">{daysUntilDue} día(s)</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatRD(ar.totalCents)}</TableCell>
                    <TableCell className="text-right">{formatRD(ar.balanceCents)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          className="bg-green-500 hover:bg-green-600 text-white"
                          onClick={() => openPayment(ar)}
                          title="Abonar / Saldar"
                          disabled={disableIndividualPay}
                        >
                          <HandCoins className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Abonar</span>
                        </Button>
                        {ar.payments?.length > 0 && (
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
                            <span className="hidden sm:inline">Recibos ({ar.payments?.length ?? 0})</span>
                            <span className="sm:hidden">{ar.payments?.length ?? 0}</span>
                          </Button>
                        )}
                        <Button size="sm" asChild className="bg-blue-500 hover:bg-blue-600 text-white" title="Reimprimir">
                          <Link href={`/api/print/sale/${ar.sale.invoiceCode}`} target="_blank">
                            <Printer className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Reimprimir</span>
                          </Link>
                        </Button>

                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}

                {!isLoading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <img
                          src="/lupa.webp"
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
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Registrar abono</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="grid gap-3 overflow-y-auto pr-1">
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <CreditCard className="h-4 w-4" /> {selected.sale.invoiceCode}
                </div>
                <div className="text-muted-foreground">{formatCustomerLabel(selected.customer)}</div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <span>Total</span>
                  <span className="font-semibold">{formatRD(selected.totalCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pendiente</span>
                  <span className="font-semibold">{formatRD(selected.balanceCents)}</span>
                </div>
                {selected.dueDate && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                      <span>Vence</span>
                      <span className={
                        isOverdueFromDueDate(selected.dueDate)
                          ? "font-semibold text-red-600" 
                          : "font-semibold"
                      }>
                        {formatDateDO(selected.dueDate, {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </span>
                    </div>
                    {isOverdueFromDueDate(selected.dueDate) && (
                      <div className="mt-1 text-xs text-red-600 font-semibold">
                        ⚠️ Factura vencida
                      </div>
                    )}
                  </>
                )}
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
                  onChange={(e) => {
                    const nextMethod = e.target.value as PaymentMethod
                    setMethod(nextMethod)
                    if (nextMethod !== PaymentMethod.TRANSFERENCIA) {
                      setTransferBankName("")
                    }
                  }}
                >
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>
                      {methodLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              {method === PaymentMethod.TRANSFERENCIA && (
                <div className="grid gap-2">
                  <Label>Banco de la transferencia</Label>
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={transferBankName}
                    onChange={(e) => setTransferBankName(e.target.value)}
                  >
                    <option value="">Selecciona un banco</option>
                    {DOMINICAN_BANKS.map((bankName) => (
                      <option key={bankName} value={bankName}>
                        {bankName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid gap-2">
                <Label>Nota (opcional)</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              {selected.payments?.length > 0 && (
                <div className="rounded-md border p-3 text-sm">
                  <div className="mb-2 font-semibold">Pagos anteriores</div>
                  <div className="grid gap-2">
                    {selected.payments?.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-md border p-2">
                        <div className="text-xs text-muted-foreground">
                          {formatDateTimeDO(p.paidAt)}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold">{formatRD(p.amountCents)}</div>
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/api/print/payment/${p.id}`} target="_blank">
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
                <div className="text-muted-foreground">{formatCustomerLabel(selectedForReceipts.customer)}</div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <span>Total</span>
                  <span className="font-semibold">{formatRD(selectedForReceipts.totalCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pendiente</span>
                  <span className="font-semibold">{formatRD(selectedForReceipts.balanceCents)}</span>
                </div>
                {selectedForReceipts.dueDate && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                      <span>Vence</span>
                      <span className={
                        isOverdueFromDueDate(selectedForReceipts.dueDate)
                          ? "font-semibold text-red-600" 
                          : "font-semibold"
                      }>
                        {formatDateDO(selectedForReceipts.dueDate, {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {selectedForReceipts.payments?.length > 0 ? (
                <div className="rounded-md border">
                  <div className="border-b p-3 font-semibold">Recibos de Pago ({selectedForReceipts.payments?.length ?? 0})</div>
                  <div className="divide-y">
                    {selectedForReceipts.payments?.map((p) => (
                      <div key={p.id} className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="grid gap-1">
                            <div className="text-sm font-medium">{formatRD(p.amountCents)}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDateTimeDO(p.paidAt, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Método: {formatPaymentWithBank(p.method, p.transferBankName)}
                            </div>
                            {p.note && <div className="text-xs text-muted-foreground">Nota: {p.note}</div>}
                          </div>
                          <Button asChild size="sm" variant="secondary">
                            <Link href={`/api/print/payment/${p.id}`} target="_blank">
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

      {/* Batch payment dialog */}
      <Dialog open={openBatch} onOpenChange={setOpenBatch}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Cobrar {selectedItems.length} factura(s)</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 overflow-y-auto pr-1">
            {/* Cliente */}
            {selectedItems.length > 0 && (
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <CreditCard className="h-4 w-4" /> {formatCustomerLabel(selectedItems[0].customer)}
                </div>
                <Separator className="my-2" />
                {selectedItems
                  .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                  .map((ar) => (
                  <div key={ar.id} className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground">{ar.sale.invoiceCode}</span>
                    <span className="font-semibold">{formatRD(ar.balanceCents)}</span>
                  </div>
                ))}
                <Separator className="my-2" />
                <div className="flex items-center justify-between font-semibold">
                  <span>Total pendiente</span>
                  <span>{formatRD(selectedTotalBalance)}</span>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Monto a pagar</Label>
              <PriceInput
                valueCents={batchAmountCents}
                onChangeCents={setBatchAmountCents}
                maxCents={selectedTotalBalance}
              />
              {batchAmountCents > selectedTotalBalance && (
                <div className="text-xs font-medium text-destructive">
                  El monto no puede exceder el balance pendiente ({formatRD(selectedTotalBalance)})
                </div>
              )}
              {batchAmountCents < selectedTotalBalance && batchAmountCents > 0 && (
                <div className="text-xs text-muted-foreground">
                  Se aplicará desde la factura más antigua
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Método</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={batchMethod}
                onChange={(e) => {
                  const nextMethod = e.target.value as PaymentMethod
                  setBatchMethod(nextMethod)
                  if (nextMethod !== PaymentMethod.TRANSFERENCIA) {
                    setBatchTransferBankName("")
                  }
                }}
              >
                {paymentMethods.map((m) => (
                  <option key={m} value={m}>
                    {methodLabel(m)}
                  </option>
                ))}
              </select>
            </div>

            {batchMethod === PaymentMethod.TRANSFERENCIA && (
              <div className="grid gap-2">
                <Label>Banco de la transferencia</Label>
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={batchTransferBankName}
                  onChange={(e) => setBatchTransferBankName(e.target.value)}
                >
                  <option value="">Selecciona un banco</option>
                  {DOMINICAN_BANKS.map((bankName) => (
                    <option key={bankName} value={bankName}>
                      {bankName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Nota (opcional)</Label>
              <Input value={batchNote} onChange={(e) => setBatchNote(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => setOpenBatch(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={onBatchPay}
              disabled={isBatchSaving || selectedItems.length === 0 || batchAmountCents <= 0 || batchAmountCents > selectedTotalBalance}
            >
              {isBatchSaving ? "Guardando…" : "Guardar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

