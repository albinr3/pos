"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { AlertTriangle, ArrowLeftRight, Landmark, Plus, RefreshCw, RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"

import {
  createTreasuryTransfer,
  createTreasuryAccount,
  getTreasuryDashboard,
  listTreasuryAccounts,
  previewTreasuryTransfer,
  reverseTreasuryTransfer,
  setTreasuryOpeningBalance,
  updateTreasuryAccount,
} from "./actions"

type TreasuryAccountRow = Awaited<ReturnType<typeof listTreasuryAccounts>>[number]
type DashboardData = Awaited<ReturnType<typeof getTreasuryDashboard>>

function toInputDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const TODAY = toInputDateValue(new Date())

type AccountForm = {
  id?: string
  name: string
  type: "CAJA" | "BANCO"
  currency: string
  bankName: string
  accountNumber: string
  isActive: boolean
}

const EMPTY_FORM: AccountForm = {
  name: "",
  type: "CAJA",
  currency: "DOP",
  bankName: "",
  accountNumber: "",
  isActive: true,
}

const RD_BANK_OPTIONS: string[] = [
  "Banreservas",
  "Banco Popular Dominicano",
  "Banco BHD",
  "Scotiabank República Dominicana",
  "Banco Santa Cruz",
  "Banco Caribe",
  "Banco Vimenca",
  "Banco Ademi",
  "Banco Lafise Dominicana",
  "Citibank, N.A. República Dominicana",
]

const MOVEMENT_SOURCE_LABELS: Record<string, string> = {
  OPENING_BALANCE: "Saldo inicial",
  SALE_CASH: "Venta contado",
  AR_PAYMENT: "Cobro CxC",
  PURCHASE: "Compra",
  OPERATING_EXPENSE: "Gasto operativo",
  CASH_RETURN: "Devolución",
  TREASURY_TRANSFER: "Transferencia interna",
}

function getMovementSourceLabel(source: string) {
  return MOVEMENT_SOURCE_LABELS[source] ?? source
}

export function TreasuryClient() {
  const shouldAutoOpenCreateDialog =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("newAccount") === "1"
  const [accounts, setAccounts] = useState<TreasuryAccountRow[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [fromDate, setFromDate] = useState(TODAY)
  const [toDate, setToDate] = useState(TODAY)

  const [openAccountDialog, setOpenAccountDialog] = useState(shouldAutoOpenCreateDialog)
  const [accountForm, setAccountForm] = useState<AccountForm>(EMPTY_FORM)
  const [openingAccountId, setOpeningAccountId] = useState("")
  const [openingAmount, setOpeningAmount] = useState("0")
  const [openingDate, setOpeningDate] = useState(TODAY)
  const [openingNote, setOpeningNote] = useState("")
  const [newAccountOpeningAmount, setNewAccountOpeningAmount] = useState("")
  const [newAccountOpeningDate, setNewAccountOpeningDate] = useState(TODAY)
  const [transferFromAccountId, setTransferFromAccountId] = useState("")
  const [transferToAccountId, setTransferToAccountId] = useState("")
  const [transferAmount, setTransferAmount] = useState("")
  const [transferDate, setTransferDate] = useState(TODAY)
  const [transferNote, setTransferNote] = useState("")

  const [isLoading, startLoading] = useTransition()
  const [isSaving, startSaving] = useTransition()
  const manualOpeningAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.type === "CAJA" && account.name.trim().toLocaleLowerCase("es") === "caja efectivo"
      ),
    [accounts]
  )
  const bankOptions =
    accountForm.bankName && !RD_BANK_OPTIONS.includes(accountForm.bankName)
      ? [accountForm.bankName, ...RD_BANK_OPTIONS]
      : RD_BANK_OPTIONS

  const load = useCallback(
    ({
      fromDate: selectedFromDate,
      toDate: selectedToDate,
      transferFromAccountId: selectedTransferFromAccountId,
      transferToAccountId: selectedTransferToAccountId,
    }: {
      fromDate: string
      toDate: string
      transferFromAccountId: string
      transferToAccountId: string
    }) => {
    startLoading(async () => {
      try {
        const [accountsResult, dashboardResult] = await Promise.all([
          listTreasuryAccounts(true),
          getTreasuryDashboard({ from: selectedFromDate, to: selectedToDate }),
        ])
        setAccounts(accountsResult)
        setDashboard(dashboardResult)
        const activeAccounts = accountsResult.filter((account) => account.isActive)
        const cajaEfectivo = accountsResult.find(
          (account) => account.type === "CAJA" && account.name.trim().toLocaleLowerCase("es") === "caja efectivo"
        )
        if (cajaEfectivo) {
          setOpeningAccountId((current) => (current === cajaEfectivo.id ? current : cajaEfectivo.id))
        } else {
          setOpeningAccountId("")
        }

        if (activeAccounts.length > 0) {
          const fromExists = activeAccounts.some((account) => account.id === selectedTransferFromAccountId)
          const nextFrom = fromExists ? selectedTransferFromAccountId : activeAccounts[0].id
          const toExists =
            selectedTransferToAccountId &&
            activeAccounts.some((account) => account.id === selectedTransferToAccountId && account.id !== nextFrom)
          const nextTo = toExists
            ? selectedTransferToAccountId
            : (activeAccounts.find((account) => account.id !== nextFrom)?.id ?? "")

          setTransferFromAccountId(nextFrom)
          setTransferToAccountId(nextTo)
        }
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo cargar tesorería",
          variant: "destructive",
        })
      }
    })
    },
    [startLoading]
  )

  function resetAccountForm() {
    setAccountForm(EMPTY_FORM)
    setNewAccountOpeningAmount("")
    setNewAccountOpeningDate(TODAY)
  }

  function openCreateAccount() {
    resetAccountForm()
    setOpenAccountDialog(true)
  }

  useEffect(() => {
    load({
      fromDate: TODAY,
      toDate: TODAY,
      transferFromAccountId: "",
      transferToAccountId: "",
    })
  }, [load])

  useEffect(() => {
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    if (params.get("newAccount") !== "1") return

    params.delete("newAccount")
    const nextQuery = params.toString()
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname
    window.history.replaceState({}, "", nextUrl)
  }, [])

  function openEditAccount(account: TreasuryAccountRow) {
    setAccountForm({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      bankName: account.bankName || "",
      accountNumber: account.accountNumber || "",
      isActive: account.isActive,
    })
    setOpenAccountDialog(true)
  }

  function saveAccount() {
    if (!accountForm.name.trim()) {
      toast({ title: "Error", description: "El nombre es requerido", variant: "destructive" })
      return
    }
    if (!accountForm.id && !newAccountOpeningAmount.trim()) {
      // Validación preventiva: al crear cuenta el saldo inicial es obligatorio.
      toast({ title: "Error", description: "El saldo inicial es obligatorio", variant: "destructive" })
      return
    }

    startSaving(async () => {
      try {
        if (accountForm.id) {
          await updateTreasuryAccount({
            id: accountForm.id,
            name: accountForm.name,
            type: accountForm.type,
            currency: accountForm.currency,
            bankName: accountForm.bankName || null,
            accountNumber: accountForm.accountNumber || null,
            isActive: accountForm.isActive,
          })
          toast({ title: "Cuenta actualizada" })
        } else {
          await createTreasuryAccount({
            name: accountForm.name,
            type: accountForm.type,
            currency: accountForm.currency,
            bankName: accountForm.bankName || null,
            accountNumber: accountForm.accountNumber || null,
            openingBalanceCents: toCents(newAccountOpeningAmount || "0"),
            openingBalanceDate: new Date(`${newAccountOpeningDate}T00:00:00`),
          })
          toast({ title: "Cuenta creada" })
        }

        setOpenAccountDialog(false)
        resetAccountForm()
        load({
          fromDate,
          toDate,
          transferFromAccountId,
          transferToAccountId,
        })
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo guardar la cuenta",
          variant: "destructive",
        })
      }
    })
  }

  function saveOpeningBalance() {
    if (!openingAccountId || !manualOpeningAccounts.some((account) => account.id === openingAccountId)) {
      toast({
        title: "Error",
        description: "No se encontró la cuenta Caja Efectivo para registrar saldo inicial",
        variant: "destructive",
      })
      return
    }

    startSaving(async () => {
      try {
        await setTreasuryOpeningBalance({
          treasuryAccountId: openingAccountId,
          amountCents: toCents(openingAmount),
          effectiveAt: new Date(`${openingDate}T00:00:00`),
          note: openingNote || null,
        })
        toast({ title: "Saldo inicial registrado" })
        setOpeningAmount("0")
        setOpeningNote("")
        load({
          fromDate,
          toDate,
          transferFromAccountId,
          transferToAccountId,
        })
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo registrar el saldo inicial",
          variant: "destructive",
        })
      }
    })
  }

  function saveTransfer() {
    if (!transferFromAccountId || !transferToAccountId) {
      toast({
        title: "Error",
        description: "Debes seleccionar cuenta origen y destino",
        variant: "destructive",
      })
      return
    }

    if (transferFromAccountId === transferToAccountId) {
      toast({
        title: "Error",
        description: "La cuenta origen y destino deben ser diferentes",
        variant: "destructive",
      })
      return
    }

    const amountCents = toCents(transferAmount || "0")
    if (amountCents <= 0) {
      toast({ title: "Error", description: "El monto debe ser mayor que cero", variant: "destructive" })
      return
    }

    startSaving(async () => {
      try {
        const transferredAt = new Date(`${transferDate}T00:00:00`)

        const projection = await previewTreasuryTransfer({
          fromTreasuryAccountId: transferFromAccountId,
          toTreasuryAccountId: transferToAccountId,
          amountCents,
          transferredAt,
        })

        if (projection.willBeNegative) {
          const confirmed = window.confirm(
            `La cuenta "${projection.fromTreasuryAccountName}" quedará en negativo.\n\n` +
              `Saldo antes: ${formatRD(projection.sourceBalanceCents)}\n` +
              `Saldo proyectado: ${formatRD(projection.projectedSourceBalanceCents)}\n\n` +
              "¿Deseas continuar?"
          )
          if (!confirmed) return
        }

        const result = await createTreasuryTransfer({
          fromTreasuryAccountId: transferFromAccountId,
          toTreasuryAccountId: transferToAccountId,
          amountCents,
          transferredAt,
          note: transferNote || null,
        })

        toast({ title: "Transferencia registrada", description: result.reference })
        setTransferAmount("")
        setTransferNote("")
        load({
          fromDate,
          toDate,
          transferFromAccountId,
          transferToAccountId,
        })
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo registrar la transferencia",
          variant: "destructive",
        })
      }
    })
  }

  function reverseTransfer(transferId: string) {
    const reasonInput = window.prompt("Motivo de anulación")
    if (reasonInput === null) return
    const reason = reasonInput.trim()
    if (!reason) {
      toast({ title: "Error", description: "Debes indicar un motivo", variant: "destructive" })
      return
    }

    startSaving(async () => {
      try {
        const result = await reverseTreasuryTransfer({
          transferId,
          reason,
        })
        toast({
          title: "Transferencia anulada",
          description: `${result.originalReference} -> ${result.reverseReference}`,
        })
        load({
          fromDate,
          toDate,
          transferFromAccountId,
          transferToAccountId,
        })
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo anular la transferencia",
          variant: "destructive",
        })
      }
    })
  }

  const totals = dashboard?.totals
  const activeAccounts = accounts.filter((account) => account.isActive)

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            load({
              fromDate,
              toDate,
              transferFromAccountId,
              transferToAccountId,
            })
          }
          disabled={isLoading}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
        <Button type="button" onClick={openCreateAccount}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva cuenta
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Entradas del período</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(totals?.inCents ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Salidas del período</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(totals?.outCents ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Saldo esperado acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(totals?.balanceCents ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Saldos por cuenta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Entradas</TableHead>
                  <TableHead>Salidas</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dashboard?.accounts ?? []).map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <div className="font-medium">{account.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {account.bankName || "-"} {account.accountNumber ? `· ${account.accountNumber}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>{account.type}</TableCell>
                    <TableCell>{formatRD(account.inCents)}</TableCell>
                    <TableCell>{formatRD(account.outCents)}</TableCell>
                    <TableCell className="font-semibold">{formatRD(account.balanceCents)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openEditAccount(accounts.find((x) => x.id === account.id) || ({
                        id: account.id,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        accountId: "",
                        name: account.name,
                        type: account.type,
                        currency: account.currency,
                        bankName: account.bankName,
                        accountNumber: account.accountNumber,
                        isActive: account.isActive,
                        createdByUserId: null,
                      } as TreasuryAccountRow))}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(dashboard?.accounts ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No hay cuentas disponibles
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saldo inicial manual</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="grid gap-1 md:col-span-2">
            <Label>Cuenta</Label>
            <Select value={openingAccountId} onValueChange={setOpeningAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una cuenta" />
              </SelectTrigger>
              <SelectContent>
                {manualOpeningAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Monto RD$</Label>
            <Input value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} inputMode="decimal" />
          </div>
          <div className="grid gap-1">
            <Label>Fecha</Label>
            <Input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Nota</Label>
            <Input value={openingNote} onChange={(e) => setOpeningNote(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="md:col-span-5">
            {manualOpeningAccounts.length === 0 && (
              <p className="mb-2 text-sm text-muted-foreground">
                Solo la cuenta Caja Efectivo permite saldo inicial manual.
              </p>
            )}
            <Button type="button" onClick={saveOpeningBalance} disabled={isSaving || manualOpeningAccounts.length === 0}>
              Guardar saldo inicial
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Transferencia interna
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="grid gap-1 md:col-span-2">
            <Label>Cuenta origen</Label>
            <Select
              value={transferFromAccountId}
              onValueChange={(value) => {
                setTransferFromAccountId(value)
                if (value === transferToAccountId) {
                  const nextDestination = activeAccounts.find((account) => account.id !== value)?.id ?? ""
                  setTransferToAccountId(nextDestination)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona origen" />
              </SelectTrigger>
              <SelectContent>
                {activeAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1 md:col-span-2">
            <Label>Cuenta destino</Label>
            <Select value={transferToAccountId} onValueChange={setTransferToAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona destino" />
              </SelectTrigger>
              <SelectContent>
                {activeAccounts
                  .filter((account) => account.id !== transferFromAccountId)
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Monto RD$</Label>
            <Input value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} inputMode="decimal" />
          </div>
          <div className="grid gap-1">
            <Label>Fecha</Label>
            <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
          </div>
          <div className="grid gap-1 md:col-span-3">
            <Label>Nota</Label>
            <Input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="md:col-span-5 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={saveTransfer} disabled={isSaving || activeAccounts.length < 2}>
              Guardar transferencia
            </Button>
            {activeAccounts.length < 2 && (
              <div className="inline-flex items-center gap-2 text-xs text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                Necesitas al menos 2 cuentas activas para transferir.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos del período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dashboard?.movements ?? []).map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{new Date(movement.occurredAt).toLocaleString("es-DO")}</TableCell>
                    <TableCell>{movement.treasuryAccountName}</TableCell>
                    <TableCell>{getMovementSourceLabel(movement.source)}</TableCell>
                    <TableCell>
                      <div>{movement.reference}</div>
                      {movement.note && <div className="text-xs text-muted-foreground">{movement.note}</div>}
                    </TableCell>
                    <TableCell>
                      {movement.transferStatus ? (
                        <Badge variant={movement.transferStatus === "ACTIVE" ? "secondary" : "outline"}>
                          {movement.transferStatus === "ACTIVE" ? "Activo" : "Reversado"}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{movement.method || "-"}</TableCell>
                    <TableCell className={movement.direction === "IN" ? "text-emerald-600" : "text-red-600"}>
                      {movement.direction === "IN" ? "+" : "-"}
                      {formatRD(movement.amountCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {movement.canReverseTransfer && movement.transferId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => reverseTransfer(movement.transferId as string)}
                          disabled={isSaving}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Anular
                        </Button>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(dashboard?.movements ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No hay movimientos en el rango seleccionado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={openAccountDialog} onOpenChange={setOpenAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{accountForm.id ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Nombre</Label>
              <Input
                value={accountForm.name}
                onChange={(e) => setAccountForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Tipo</Label>
                <Select
                  value={accountForm.type}
                  onValueChange={(value) => setAccountForm((prev) => ({ ...prev, type: value as "CAJA" | "BANCO" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAJA">CAJA</SelectItem>
                    <SelectItem value="BANCO">BANCO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Moneda</Label>
                <Input
                  value={accountForm.currency}
                  onChange={(e) => setAccountForm((prev) => ({ ...prev, currency: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Banco {accountForm.type === "BANCO" ? "" : "(opcional)"}</Label>
                <Select
                  value={accountForm.bankName}
                  onValueChange={(value) => setAccountForm((prev) => ({ ...prev, bankName: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un banco" />
                  </SelectTrigger>
                  <SelectContent
                    // Evita que el dropdown se salga de la pantalla: limita su alto al espacio disponible del viewport.
                    className="max-h-[var(--radix-select-content-available-height)]"
                  >
                    {bankOptions.map((bank) => (
                      <SelectItem key={bank} value={bank}>
                        {bank}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Número (opcional)</Label>
                <Input
                  value={accountForm.accountNumber}
                  onChange={(e) => setAccountForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                />
              </div>
            </div>
            {!accountForm.id && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label>Saldo inicial RD$ (obligatorio)</Label>
                  <Input
                    value={newAccountOpeningAmount}
                    onChange={(e) => setNewAccountOpeningAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Fecha saldo inicial</Label>
                  <Input
                    type="date"
                    value={newAccountOpeningDate}
                    onChange={(e) => setNewAccountOpeningDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {accountForm.id && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>Activa</Label>
                <Select
                  value={accountForm.isActive ? "active" : "inactive"}
                  onValueChange={(value) => setAccountForm((prev) => ({ ...prev, isActive: value === "active" }))}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="inactive">Inactiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpenAccountDialog(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveAccount} disabled={isSaving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
