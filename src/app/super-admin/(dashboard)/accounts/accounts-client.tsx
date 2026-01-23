"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"
import {
  Building2,
  Search,
  Filter,
  Eye,
  MoreHorizontal,
  Users,
  Package,
  ShoppingCart,
  Calendar,
  Mail,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { AccountListItem } from "./actions"

function formatMoney(cents: number, currency: "DOP" | "USD"): string {
  const amount = cents / 100
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
  }
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(amount)
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    TRIALING: { label: "Trial", className: "bg-blue-100 text-blue-800 border-blue-300" },
    ACTIVE: { label: "Activo", className: "bg-green-100 text-green-800 border-green-300" },
    GRACE: { label: "Gracia", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    BLOCKED: { label: "Bloqueado", className: "bg-red-100 text-red-800 border-red-300" },
    CANCELED: { label: "Cancelado", className: "bg-gray-100 text-gray-800 border-gray-300" },
  }
  const { label, className } = config[status] || { label: status, className: "" }
  return <Badge className={className}>{label}</Badge>
}

export function AccountsClient({ initialAccounts }: { initialAccounts: AccountListItem[] }) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [currencyFilter, setCurrencyFilter] = useState<string>("all")
  const [providerFilter, setProviderFilter] = useState<string>("all")

  const filteredAccounts = useMemo(() => {
    return initialAccounts.filter((account) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesName = account.name.toLowerCase().includes(searchLower)
        const matchesEmail = account.ownerEmail?.toLowerCase().includes(searchLower)
        const matchesId = account.id.toLowerCase().includes(searchLower)
        if (!matchesName && !matchesEmail && !matchesId) return false
      }

      // Status filter
      if (statusFilter !== "all" && account.status !== statusFilter) return false

      // Currency filter
      if (currencyFilter !== "all" && account.currency !== currencyFilter) return false

      // Provider filter
      if (providerFilter !== "all" && account.provider !== providerFilter) return false

      return true
    })
  }, [initialAccounts, search, statusFilter, currencyFilter, providerFilter])

  const getExpirationInfo = (account: AccountListItem) => {
    if (account.status === "TRIALING" && account.trialEndsAt) {
      return {
        label: "Trial termina",
        date: account.trialEndsAt,
      }
    }
    if (account.status === "GRACE" && account.graceEndsAt) {
      return {
        label: "Gracia termina",
        date: account.graceEndsAt,
      }
    }
    if (account.status === "ACTIVE" && account.currentPeriodEndsAt) {
      return {
        label: "Período termina",
        date: account.currentPeriodEndsAt,
      }
    }
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cuentas</h1>
        <p className="text-muted-foreground">Gestión de todas las cuentas del sistema</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, email o ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
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
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Moneda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las monedas</SelectItem>
                <SelectItem value="DOP">DOP</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Método de pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los métodos</SelectItem>
                <SelectItem value="MANUAL">Transferencia</SelectItem>
                <SelectItem value="LEMON">Tarjeta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de cuentas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {filteredAccounts.length} cuenta{filteredAccounts.length !== 1 ? "s" : ""}
          </CardTitle>
          <CardDescription>
            {search || statusFilter !== "all" || currencyFilter !== "all" || providerFilter !== "all"
              ? "Resultados filtrados"
              : "Todas las cuentas registradas"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Negocio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Uso</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No se encontraron cuentas
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map((account) => {
                    const expInfo = getExpirationInfo(account)
                    return (
                      <TableRow key={account.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <Link
                              href={`/super-admin/accounts/${account.id}`}
                              className="font-medium hover:underline"
                            >
                              {account.name}
                            </Link>
                            {account.ownerEmail && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {account.ownerEmail}
                              </div>
                            )}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(account.createdAt), "dd/MM/yyyy")}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={account.status} />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">
                              {formatMoney(
                                account.currency === "USD"
                                  ? account.priceUsdCents
                                  : account.priceDopCents,
                                account.currency
                              )}
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {account.provider === "MANUAL" ? "Transferencia" : "Tarjeta"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span
                              className="flex items-center gap-1"
                              title="Usuarios"
                              aria-label="Usuarios"
                            >
                              <Users className="h-3 w-3" />
                              {account.usersCount}
                            </span>
                            <span
                              className="flex items-center gap-1"
                              title="Productos"
                              aria-label="Productos"
                            >
                              <Package className="h-3 w-3" />
                              {account.productsCount}
                            </span>
                            <span
                              className="flex items-center gap-1"
                              title="Ventas"
                              aria-label="Ventas"
                            >
                              <ShoppingCart className="h-3 w-3" />
                              {account.salesCount}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {expInfo ? (
                            <div className="text-sm">
                              <div className="text-xs text-muted-foreground">{expInfo.label}</div>
                              <div>
                                {formatDistanceToNow(new Date(expInfo.date), {
                                  addSuffix: true,
                                  locale: es,
                                })}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/super-admin/accounts/${account.id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Ver detalles
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
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
