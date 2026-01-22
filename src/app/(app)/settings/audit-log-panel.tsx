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
] as const

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
            Audit Log
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
                    {item.replace(/_/g, " ")}
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
                    <Badge variant="outline">{log.action.replace(/_/g, " ")}</Badge>
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
