"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { toast } from "@/hooks/use-toast"
import {
  listInventoryBulkOperations,
  revertInventoryBulkOperation,
  type InventoryBulkOperationHistoryItem,
  type InventoryBulkRevertConflict,
} from "@/app/(app)/products/actions"
import { formatDateTimeDO } from "@/lib/date-time"

const SOURCE_LABELS: Record<InventoryBulkOperationHistoryItem["source"], string> = {
  BULK_EXCEL: "Inventario masivo",
  BULK_MANUAL: "Ajuste masivo",
}

const STATUS_LABELS: Record<InventoryBulkOperationHistoryItem["status"], string> = {
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completado",
  FAILED: "Fallido",
  REVERTED: "Revertido",
}

const STATUS_VARIANTS: Record<InventoryBulkOperationHistoryItem["status"], "secondary" | "outline" | "destructive"> = {
  IN_PROGRESS: "secondary",
  COMPLETED: "outline",
  FAILED: "destructive",
  REVERTED: "secondary",
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return formatDateTimeDO(date)
}

function formatOperator(name: string | null, username: string | null) {
  if (username) return `@${username}`
  return name || "—"
}

type Props = {
  canManage: boolean
}

export function InventoryRecoveryCard({ canManage }: Props) {
  const [operations, setOperations] = useState<InventoryBulkOperationHistoryItem[]>([])
  const [lastConflicts, setLastConflicts] = useState<InventoryBulkRevertConflict[]>([])
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null)
  const [isLoading, startLoading] = useTransition()
  const [isReverting, startReverting] = useTransition()

  const selectedOperation = useMemo(
    () => operations.find((operation) => operation.id === selectedOperationId) ?? null,
    [operations, selectedOperationId],
  )

  const refresh = useCallback(() => {
    if (!canManage) return
    startLoading(async () => {
      try {
        const result = await listInventoryBulkOperations({ take: 40 })
        setOperations(result)
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo cargar el historial de lotes",
          variant: "destructive",
        })
      }
    })
  }, [canManage, startLoading])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!canManage) return null

  const onConfirmRevert = () => {
    if (!selectedOperation) return
    startReverting(async () => {
      try {
        const result = await revertInventoryBulkOperation({ operationId: selectedOperation.id })
        setSelectedOperationId(null)

        if (result.ok) {
          setLastConflicts([])
          toast({
            title: "Lote revertido",
            description: `Productos restaurados: ${result.revertedProducts}. Productos eliminados: ${result.deletedProducts}.`,
          })
          refresh()
          return
        }

        setLastConflicts(result.conflicts)
        toast({
          title: "No se pudo revertir",
          description: result.message,
          variant: "destructive",
        })
        refresh()
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo revertir el lote",
          variant: "destructive",
        })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Recuperación de inventario masivo</CardTitle>
            <div className="text-sm text-muted-foreground">
              Revertir un lote masivo devuelve productos/stock al estado anterior. Si hay conflictos, el lote completo se bloquea.
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {lastConflicts.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Conflictos detectados en el intento de reversión ({lastConflicts.length})
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lastConflicts.slice(0, 50).map((conflict) => (
                    <TableRow key={`${conflict.productId}-${conflict.reason}`}>
                      <TableCell className="text-xs">
                        {conflict.productNumber ? `#${conflict.productNumber}` : conflict.productId}
                        {conflict.productName ? ` · ${conflict.productName}` : ""}
                      </TableCell>
                      <TableCell className="text-xs">{conflict.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {operations.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay operaciones masivas registradas todavía.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Resumen</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operations.map((operation) => {
                  const canRevert = operation.status === "COMPLETED"
                  return (
                    <TableRow key={operation.id}>
                      <TableCell className="text-xs">{formatDate(operation.completedAt ?? operation.startedAt)}</TableCell>
                      <TableCell className="text-xs">{SOURCE_LABELS[operation.source]}</TableCell>
                      <TableCell className="text-xs">{formatOperator(operation.userName, operation.userUsername)}</TableCell>
                      <TableCell className="text-xs">
                        Total: {operation.totalRows} · Creados: {operation.createdCount} · Actualizados: {operation.updatedCount} · Errores: {operation.failedCount}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[operation.status]}>{STATUS_LABELS[operation.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedOperationId(operation.id)}
                          disabled={!canRevert || isReverting}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Revertir
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={selectedOperationId !== null} onOpenChange={(open) => !open && setSelectedOperationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revertir este lote masivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción intenta restaurar el estado previo del inventario para todo el lote.
              Si hay conflictos, no se aplicará ningún cambio.
              {selectedOperation
                ? `\n\nLote: ${SOURCE_LABELS[selectedOperation.source]} · Total: ${selectedOperation.totalRows} · Creados: ${selectedOperation.createdCount} · Actualizados: ${selectedOperation.updatedCount}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReverting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                onConfirmRevert()
              }}
              disabled={isReverting || !selectedOperation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isReverting ? "Revirtiendo..." : "Sí, revertir lote"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
