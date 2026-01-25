"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  AlertTriangle,
  Bug,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
  AlertOctagon,
  Info,
  Activity,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

import type { ErrorLogItem, ErrorStats, GetErrorsParams } from "./actions"
import {
  getErrorLogs,
  resolveError,
  resolveMultipleErrors,
  deleteOldErrors,
} from "./actions"

type Props = {
  initialErrors: ErrorLogItem[]
  initialTotal: number
  initialStats: ErrorStats
}

const severityConfig = {
  CRITICAL: {
    label: "Crítico",
    color: "bg-red-100 text-red-800 border-red-300",
    icon: AlertOctagon,
  },
  HIGH: {
    label: "Alto",
    color: "bg-orange-100 text-orange-800 border-orange-300",
    icon: AlertTriangle,
  },
  MEDIUM: {
    label: "Medio",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    icon: Info,
  },
  LOW: {
    label: "Bajo",
    color: "bg-blue-100 text-blue-800 border-blue-300",
    icon: Bug,
  },
}

export function ErrorsClient({ initialErrors, initialTotal, initialStats }: Props) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  // State
  const [errors, setErrors] = useState(initialErrors)
  const [total, setTotal] = useState(initialTotal)
  const [stats, setStats] = useState(initialStats)
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Filters
  const [severity, setSeverity] = useState<string>("ALL")
  const [resolved, setResolved] = useState<string>("UNRESOLVED")
  const [search, setSearch] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Selected errors for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Expanded error details
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Dialogs
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [resolveErrorId, setResolveErrorId] = useState<string | null>(null)
  const [resolution, setResolution] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const totalPages = Math.ceil(total / pageSize)

  const fetchErrors = (params: GetErrorsParams = {}) => {
    startTransition(async () => {
      const result = await getErrorLogs({
        page: params.page ?? page,
        pageSize,
        severity: (params.severity ?? severity) as GetErrorsParams["severity"],
        resolved: (params.resolved ?? resolved) as GetErrorsParams["resolved"],
        search: params.search ?? search,
        startDate: params.startDate ?? startDate,
        endDate: params.endDate ?? endDate,
      })
      setErrors(result.errors)
      setTotal(result.total)
      setStats(result.stats)
      setSelectedIds(new Set())
    })
  }

  const handleSearch = () => {
    setPage(1)
    fetchErrors({ page: 1 })
  }

  const handleFilterChange = (
    type: "severity" | "resolved",
    value: string
  ) => {
    if (type === "severity") {
      setSeverity(value)
      setPage(1)
      fetchErrors({ page: 1, severity: value as GetErrorsParams["severity"] })
    } else {
      setResolved(value)
      setPage(1)
      fetchErrors({ page: 1, resolved: value as GetErrorsParams["resolved"] })
    }
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchErrors({ page: newPage })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === errors.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(errors.map((e) => e.id)))
    }
  }

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const openResolveDialog = (errorId: string | null) => {
    setResolveErrorId(errorId)
    setResolution("")
    setResolveDialogOpen(true)
  }

  const handleResolve = async () => {
    if (!resolution.trim()) {
      toast({
        title: "Error",
        description: "Debes agregar una nota de resolución",
        variant: "destructive",
      })
      return
    }

    startTransition(async () => {
      if (resolveErrorId) {
        // Resolver uno
        const result = await resolveError(resolveErrorId, resolution)
        if (result.success) {
          toast({ title: "Error resuelto", description: "El error ha sido marcado como resuelto" })
        } else {
          toast({ title: "Error", description: result.error, variant: "destructive" })
        }
      } else if (selectedIds.size > 0) {
        // Resolver múltiples
        const result = await resolveMultipleErrors(Array.from(selectedIds), resolution)
        if (result.success) {
          toast({
            title: "Errores resueltos",
            description: `${result.count} errores han sido marcados como resueltos`,
          })
        } else {
          toast({ title: "Error", description: result.error, variant: "destructive" })
        }
      }
      setResolveDialogOpen(false)
      fetchErrors()
    })
  }

  const handleDeleteOld = async () => {
    startTransition(async () => {
      const result = await deleteOldErrors(30)
      if (result.success) {
        toast({
          title: "Errores eliminados",
          description: `${result.count} errores antiguos han sido eliminados`,
        })
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
      setDeleteDialogOpen(false)
      fetchErrors()
    })
  }

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="h-6 w-6 text-red-500" />
            Monitor de Errores
          </h1>
          <p className="text-muted-foreground">
            Visualiza y gestiona los errores del sistema en producción
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchErrors()}
            disabled={isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Limpiar antiguos
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Sin resolver</div>
          <div className="text-2xl font-bold text-orange-600">{stats.unresolved}</div>
        </Card>
        <Card className="p-3 border-red-200 bg-red-50/50">
          <div className="text-xs text-red-600">Críticos</div>
          <div className="text-2xl font-bold text-red-700">{stats.critical}</div>
        </Card>
        <Card className="p-3 border-orange-200 bg-orange-50/50">
          <div className="text-xs text-orange-600">Altos</div>
          <div className="text-2xl font-bold text-orange-700">{stats.high}</div>
        </Card>
        <Card className="p-3 border-yellow-200 bg-yellow-50/50">
          <div className="text-xs text-yellow-600">Medios</div>
          <div className="text-2xl font-bold text-yellow-700">{stats.medium}</div>
        </Card>
        <Card className="p-3 border-blue-200 bg-blue-50/50">
          <div className="text-xs text-blue-600">Bajos</div>
          <div className="text-2xl font-bold text-blue-700">{stats.low}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> 24h
          </div>
          <div className="text-2xl font-bold">{stats.last24h}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Activity className="h-3 w-3" /> 7 días
          </div>
          <div className="text-2xl font-bold">{stats.last7d}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Mensaje, código, endpoint..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full md:w-40">
            <label className="text-sm font-medium mb-1 block">Severidad</label>
            <Select value={severity} onValueChange={(v) => handleFilterChange("severity", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                <SelectItem value="CRITICAL">Crítico</SelectItem>
                <SelectItem value="HIGH">Alto</SelectItem>
                <SelectItem value="MEDIUM">Medio</SelectItem>
                <SelectItem value="LOW">Bajo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-40">
            <label className="text-sm font-medium mb-1 block">Estado</label>
            <Select value={resolved} onValueChange={(v) => handleFilterChange("resolved", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="UNRESOLVED">Sin resolver</SelectItem>
                <SelectItem value="RESOLVED">Resueltos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-36">
            <label className="text-sm font-medium mb-1 block">Desde</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="w-full md:w-36">
            <label className="text-sm font-medium mb-1 block">Hasta</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <Button onClick={handleSearch} disabled={isPending}>
            <Filter className="h-4 w-4 mr-2" />
            Filtrar
          </Button>
        </div>
      </Card>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            {selectedIds.size} seleccionado(s)
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openResolveDialog(null)}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Resolver seleccionados
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Cancelar
          </Button>
        </div>
      )}

      {/* Error List */}
      <div className="space-y-2">
        {errors.length === 0 ? (
          <Card className="p-8 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-3" />
            <h3 className="font-medium text-lg">¡Sin errores!</h3>
            <p className="text-muted-foreground">
              No hay errores que coincidan con los filtros seleccionados
            </p>
          </Card>
        ) : (
          <>
            {/* Select All Header */}
            <div className="flex items-center gap-3 px-2">
              <input
                type="checkbox"
                checked={selectedIds.size === errors.length && errors.length > 0}
                onChange={handleSelectAll}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-muted-foreground">Seleccionar todos</span>
            </div>

            {errors.map((error) => {
              const config = severityConfig[error.severity]
              const SeverityIcon = config.icon
              const isExpanded = expandedId === error.id
              const metadataString =
                error.metadata != null ? JSON.stringify(error.metadata, null, 2) : null

              return (
                <Card
                  key={error.id}
                  className={`p-4 ${error.resolved ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(error.id)}
                      onChange={() => handleSelectOne(error.id)}
                      className="h-4 w-4 mt-1 rounded border-gray-300"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge className={config.color}>
                          <SeverityIcon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                        {error.code && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {error.code}
                          </Badge>
                        )}
                        {error.resolved && (
                          <Badge className="bg-green-100 text-green-800 border-green-300">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Resuelto
                          </Badge>
                        )}
                        {error.endpoint && (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {error.method} {error.endpoint}
                          </Badge>
                        )}
                      </div>

                      <p className="font-medium text-sm mb-1 break-words">
                        {error.message}
                      </p>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {format(new Date(error.createdAt), "dd MMM yyyy HH:mm:ss", {
                            locale: es,
                          })}
                        </span>
                        {error.accountName && (
                          <span>Cuenta: {error.accountName}</span>
                        )}
                        {error.ipAddress && <span>IP: {error.ipAddress}</span>}
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-4 space-y-3 text-sm">
                          {error.stack && (
                            <div>
                              <label className="font-medium text-xs uppercase text-muted-foreground">
                                Stack Trace
                              </label>
                              <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap">
                                {error.stack}
                              </pre>
                            </div>
                          )}
                          {metadataString && (
                            <div>
                              <label className="font-medium text-xs uppercase text-muted-foreground">
                                Metadata
                              </label>
                              <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto">
                                {metadataString}
                              </pre>
                            </div>
                          )}
                          {error.userAgent && (
                            <div>
                              <label className="font-medium text-xs uppercase text-muted-foreground">
                                User Agent
                              </label>
                              <p className="mt-1 text-xs text-muted-foreground break-all">
                                {error.userAgent}
                              </p>
                            </div>
                          )}
                          {error.resolved && error.resolution && (
                            <div className="p-3 bg-green-50 rounded border border-green-200">
                              <label className="font-medium text-xs uppercase text-green-700">
                                Resolución
                              </label>
                              <p className="mt-1 text-sm">{error.resolution}</p>
                              {error.resolvedAt && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Resuelto el{" "}
                                  {format(
                                    new Date(error.resolvedAt),
                                    "dd MMM yyyy HH:mm",
                                    { locale: es }
                                  )}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!error.resolved && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openResolveDialog(error.id)}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleExpanded(error.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {(page - 1) * pageSize + 1} -{" "}
            {Math.min(page * pageSize, total)} de {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1 || isPending}
              onClick={() => handlePageChange(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages || isPending}
              onClick={() => handlePageChange(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Error</DialogTitle>
            <DialogDescription>
              Agrega una nota explicando cómo se resolvió este error o por qué ya no es relevante.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ej: Se corrigió el bug en el endpoint de pagos..."
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleResolve} disabled={isPending}>
              {isPending ? "Guardando..." : "Marcar como resuelto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar errores antiguos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará todos los errores <strong>resueltos</strong> con más
              de 30 días de antigüedad. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOld}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
