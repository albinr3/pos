"use client"

import { useMemo, useState, useTransition } from "react"
import { formatDateDO } from "@/lib/date-time"
import { Mail, Megaphone, Search, Send, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

import { sendMassMarketingEmail, type MarketingAccountItem } from "./actions"

function StatusBadge({ status }: { status: MarketingAccountItem["status"] }) {
  const config: Record<MarketingAccountItem["status"], { label: string; className: string }> = {
    TRIALING: { label: "Trial", className: "bg-blue-100 text-blue-800 border-blue-300" },
    ACTIVE: { label: "Activo", className: "bg-green-100 text-green-800 border-green-300" },
    GRACE: { label: "Gracia", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    BLOCKED: { label: "Bloqueado", className: "bg-red-100 text-red-800 border-red-300" },
    CANCELED: { label: "Cancelado", className: "bg-gray-100 text-gray-800 border-gray-300" },
  }

  const data = config[status]
  return <Badge className={data.className}>{data.label}</Badge>
}

export function EmailMarketingClient({ initialAccounts }: { initialAccounts: MarketingAccountItem[] }) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")

  const filteredAccounts = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()

    return initialAccounts.filter((account) => {
      if (statusFilter !== "all" && account.status !== statusFilter) {
        return false
      }

      if (!searchTerm) {
        return true
      }

      return (
        account.name.toLowerCase().includes(searchTerm) ||
        (account.ownerEmail || "").toLowerCase().includes(searchTerm) ||
        account.id.toLowerCase().includes(searchTerm)
      )
    })
  }, [initialAccounts, search, statusFilter])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const selectedAccounts = useMemo(
    () => initialAccounts.filter((account) => selectedSet.has(account.id)),
    [initialAccounts, selectedSet]
  )

  const uniqueSelectedRecipients = useMemo(() => {
    const emails = new Set<string>()
    for (const account of selectedAccounts) {
      if (account.ownerEmail) {
        emails.add(account.ownerEmail.toLowerCase())
      }
    }
    return emails.size
  }, [selectedAccounts])

  const toggleSelection = (accountId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(accountId)) {
        return prev.filter((id) => id !== accountId)
      }
      return [...prev, accountId]
    })
  }

  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const account of filteredAccounts) {
        next.add(account.id)
      }
      return Array.from(next)
    })
  }

  const clearSelection = () => {
    setSelectedIds([])
  }

  const handleSend = () => {
    if (!selectedIds.length) {
      toast({ title: "Selecciona al menos una cuenta", variant: "destructive" })
      return
    }

    if (!subject.trim()) {
      toast({ title: "El asunto es obligatorio", variant: "destructive" })
      return
    }

    if (!message.trim()) {
      toast({ title: "El contenido es obligatorio", variant: "destructive" })
      return
    }

    startTransition(async () => {
      const result = await sendMassMarketingEmail({
        accountIds: selectedIds,
        subject,
        message,
      })

      if (!result.success) {
        toast({
          title: "No se pudo enviar la campana",
          description: result.error || "Error desconocido",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Campana enviada",
        description: `Enviados: ${result.sentCount || 0}. Fallidos: ${result.failedCount || 0}.`,
      })
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Email Marketing</h1>
        <p className="text-muted-foreground">
          Selecciona cuentas y envia correos masivos a sus emails principales.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Campana de correo
          </CardTitle>
          <CardDescription>
            Se envia 1 correo por email unico, aunque varias cuentas compartan el mismo correo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="subject">Asunto</Label>
            <Input
              id="subject"
              placeholder="Ej: Novedades de MOVOPos para tu negocio"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={180}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="message">Mensaje</Label>
            <Textarea
              id="message"
              placeholder="Escribe aqui el contenido del correo..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              maxLength={12000}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" />
              Cuentas seleccionadas: <strong>{selectedIds.length}</strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <Mail className="h-4 w-4" />
              Destinatarios unicos: <strong>{uniqueSelectedRecipients}</strong>
            </span>
          </div>

          <div>
            <Button onClick={handleSend} disabled={isPending || !selectedIds.length}>
              <Send className="mr-2 h-4 w-4" />
              {isPending ? "Enviando..." : "Enviar campana"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seleccion de cuentas</CardTitle>
          <CardDescription>
            {filteredAccounts.length} cuenta{filteredAccounts.length === 1 ? "" : "s"} visibles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por negocio, email o ID"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="TRIALING">Trial</SelectItem>
                <SelectItem value="ACTIVE">Activo</SelectItem>
                <SelectItem value="GRACE">Gracia</SelectItem>
                <SelectItem value="BLOCKED">Bloqueado</SelectItem>
                <SelectItem value="CANCELED">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={selectAllFiltered} type="button">
              Seleccionar visibles
            </Button>
            <Button variant="outline" onClick={clearSelection} type="button">
              Limpiar
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seleccion</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No hay cuentas para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map((account) => {
                    const isSelected = selectedSet.has(account.id)
                    return (
                      <TableRow key={account.id}>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            onClick={() => toggleSelection(account.id)}
                            type="button"
                          >
                            {isSelected ? "Seleccionada" : "Seleccionar"}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{account.name}</div>
                          <div className="text-xs text-muted-foreground">{account.id}</div>
                        </TableCell>
                        <TableCell>
                          {account.ownerEmail ? (
                            <span>{account.ownerEmail}</span>
                          ) : (
                            <span className="text-muted-foreground">Sin email</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={account.status} />
                        </TableCell>
                        <TableCell>{formatDateDO(account.createdAt)}</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
