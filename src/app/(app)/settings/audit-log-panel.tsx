"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Filter, RefreshCw } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
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
import { toast } from "@/hooks/use-toast"

import { listAuditLogs, type AuditLogItem } from "./audit-actions"
import { listAccountUsers } from "./users-actions"

const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "SALE_CREATED",
  "SALE_CANCELLED",
  "SALE_EDITED",
  "PAYMENT_CREATED",
  "PAYMENT_CANCELLED",
  "PRICE_OVERRIDE",
  "PRODUCT_CREATED",
  "PRODUCT_EDITED",
  "PRODUCT_DELETED",
  "STOCK_ADJUSTED",
  "PERMISSION_CHANGED",
  "SETTINGS_CHANGED",
  "USER_CREATED",
  "USER_DELETED",
  "UNAUTHORIZED_ACCESS",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "CATEGORY_CREATED",
  "CATEGORY_EDITED",
  "CATEGORY_DELETED",
  "CUSTOMER_CREATED",
  "CUSTOMER_EDITED",
  "CUSTOMER_DELETED",
  "SUPPLIER_CREATED",
  "SUPPLIER_EDITED",
  "SUPPLIER_DELETED",
  "PURCHASE_CREATED",
  "PURCHASE_EDITED",
  "PURCHASE_CANCELLED",
  "RETURN_CREATED",
  "RETURN_CANCELLED",
  "QUOTE_CREATED",
  "QUOTE_EDITED",
  "QUOTE_DELETED",
  "OPERATING_EXPENSE_CREATED",
  "OPERATING_EXPENSE_EDITED",
  "OPERATING_EXPENSE_DELETED",
  "BACKUP_CREATED",
  "BACKUP_DELETED",
  "BACKUP_RESTORED",
  "BACKUP_DOWNLOADED",
] as const

const ACTION_LABELS: Record<(typeof AUDIT_ACTIONS)[number], string> = {
  LOGIN_SUCCESS: "Inicio de sesión exitoso",
  LOGIN_FAILED: "Inicio de sesión fallido",
  LOGOUT: "Cierre de sesión",
  SALE_CREATED: "Venta creada",
  SALE_CANCELLED: "Venta cancelada",
  SALE_EDITED: "Venta modificada",
  PAYMENT_CREATED: "Pago creado",
  PAYMENT_CANCELLED: "Pago cancelado",
  PRICE_OVERRIDE: "Cambio de precio",
  PRODUCT_CREATED: "Producto creado",
  PRODUCT_EDITED: "Producto modificado",
  PRODUCT_DELETED: "Producto eliminado",
  STOCK_ADJUSTED: "Ajuste de inventario",
  PERMISSION_CHANGED: "Permisos cambiados",
  SETTINGS_CHANGED: "Ajustes cambiados",
  USER_CREATED: "Usuario creado",
  USER_DELETED: "Usuario eliminado",
  UNAUTHORIZED_ACCESS: "Acceso no autorizado",
  USER_UPDATED: "Usuario actualizado",
  USER_DEACTIVATED: "Usuario desactivado",
  CATEGORY_CREATED: "Categoría creada",
  CATEGORY_EDITED: "Categoría modificada",
  CATEGORY_DELETED: "Categoría eliminada",
  CUSTOMER_CREATED: "Cliente creado",
  CUSTOMER_EDITED: "Cliente modificado",
  CUSTOMER_DELETED: "Cliente eliminado",
  SUPPLIER_CREATED: "Proveedor creado",
  SUPPLIER_EDITED: "Proveedor modificado",
  SUPPLIER_DELETED: "Proveedor eliminado",
  PURCHASE_CREATED: "Compra creada",
  PURCHASE_EDITED: "Compra modificada",
  PURCHASE_CANCELLED: "Compra cancelada",
  RETURN_CREATED: "Devolución creada",
  RETURN_CANCELLED: "Devolución cancelada",
  QUOTE_CREATED: "Cotización creada",
  QUOTE_EDITED: "Cotización modificada",
  QUOTE_DELETED: "Cotización eliminada",
  OPERATING_EXPENSE_CREATED: "Gasto operativo creado",
  OPERATING_EXPENSE_EDITED: "Gasto operativo modificado",
  OPERATING_EXPENSE_DELETED: "Gasto operativo eliminado",
  BACKUP_CREATED: "Backup creado",
  BACKUP_DELETED: "Backup eliminado",
  BACKUP_RESTORED: "Backup restaurado",
  BACKUP_DOWNLOADED: "Backup descargado",
}

type AuditActionOption = (typeof AUDIT_ACTIONS)[number] | "ALL"

type UserOption = {
  id: string
  label: string
}

function formatDate(date: Date) {
  return new Date(date).toLocaleString("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function getActionLabel(action: AuditActionOption) {
  if (action === "ALL") return "Todas"
  return ACTION_LABELS[action]
}

function buildDetails(details: Record<string, any> | null) {
  if (!details) return "-"
  const raw = JSON.stringify(details)
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw
}

function getDefaultFromDate() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

export function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [action, setAction] = useState<AuditActionOption>("ALL")
  const [userId, setUserId] = useState<string>("ALL")
  const [from, setFrom] = useState<string>(getDefaultFromDate())
  const [to, setTo] = useState<string>("")
  const [isLoading, startLoading] = useTransition()

  const canFilterByUser = useMemo(() => users.length > 0, [users])

  function loadAuditLogs() {
    startLoading(async () => {
      try {
        const data = await listAuditLogs({
          action,
          userId,
          from: from || undefined,
          to: to || undefined,
          take: 200,
        })
        setLogs(data)
      } catch (error) {
        setLogs([])
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo cargar el audit log",
          variant: "destructive",
        })
      }
    })
  }

  useEffect(() => {
    startLoading(async () => {
      try {
        const data = await listAccountUsers()
        const mapped = data.map((u) => ({
          id: u.id,
          label: `${u.name} (@${u.username}${u.email ? ` • ${u.email}` : ""})`,
        }))
        setUsers(mapped)
      } catch {
        setUsers([])
      }
    })
  }, [])

  useEffect(() => {
    loadAuditLogs()
  }, [])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Registro de auditoría
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadAuditLogs} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Actualizando..." : "Actualizar"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="text-sm text-muted-foreground">
          Registro de eventos críticos. Usa los filtros para encontrar acciones específicas.
        </div>
        <Separator />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="grid gap-2">
            <Label>Acción</Label>
            <Select value={action} onValueChange={(v) => setAction(v as AuditActionOption)}>
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                {AUDIT_ACTIONS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {getActionLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Usuario</Label>
            <Select value={userId} onValueChange={(v) => setUserId(v)} disabled={!canFilterByUser}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div className="flex items-end gap-2">
            <Button className="w-full" onClick={loadAuditLogs} disabled={isLoading}>
              Aplicar filtros
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Detalles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No hay eventos para los filtros seleccionados.
                  </TableCell>
                </TableRow>
              )}
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{getActionLabel(log.action)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{log.userUsername ? `@${log.userUsername}` : "Sistema"}</div>
                      <div className="text-xs text-muted-foreground">{log.userEmail || "-"}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.resourceType ?? "-"}
                    {log.resourceId ? ` • ${log.resourceId}` : ""}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {buildDetails(log.details)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
