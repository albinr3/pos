"use client"

import { useEffect, useState, useTransition, useMemo } from "react"
import { Download, Trash2, RefreshCw, Database, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD } from "@/lib/money"
import { getCurrentUserStub } from "@/lib/auth-stub"
import {
  listBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
  getBackupPath,
} from "./actions"

type Backup = Awaited<ReturnType<typeof listBackups>>[number]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-DO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function BackupsClient() {
  const user = useMemo(() => getCurrentUserStub(), [])
  const [backups, setBackups] = useState<Backup[]>([])
  const [isLoading, startLoading] = useTransition()
  const [isCreating, startCreating] = useTransition()
  const [isRestoring, startRestoring] = useTransition()
  
  // Verificar permiso
  if (!user.canManageBackups && user.username !== "admin") {
    return (
      <div className="flex items-center justify-center p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No tienes permiso para acceder a esta sección.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  function refresh() {
    startLoading(async () => {
      try {
        const list = await listBackups()
        setBackups(list)
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudieron cargar los backups",
          variant: "destructive",
        })
      }
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCreateBackup() {
    startCreating(async () => {
      try {
        const { filename } = await createBackup()
        toast({ title: "Backup creado", description: filename })
        refresh()
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo crear el backup",
          variant: "destructive",
        })
      }
    })
  }

  async function handleDelete(filename: string) {
    if (!confirm(`¿Eliminar el backup ${filename}?`)) return

    try {
      await deleteBackup(filename)
      toast({ title: "Backup eliminado" })
      refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo eliminar el backup",
        variant: "destructive",
      })
    }
  }

  async function handleDownload(filename: string) {
    try {
      const filepath = await getBackupPath(filename)
      // Crear un link temporal para descargar
      const response = await fetch(`/api/backups/download?file=${encodeURIComponent(filename)}`)
      if (!response.ok) throw new Error("No se pudo descargar el backup")
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo descargar el backup",
        variant: "destructive",
      })
    }
  }

  async function handleRestore(filename: string) {
    if (
      !confirm(
        `⚠️ ADVERTENCIA: Restaurar este backup reemplazará TODOS los datos actuales de la base de datos.\n\n¿Estás seguro de que quieres restaurar ${filename}?`
      )
    )
      return

    startRestoring(async () => {
      try {
        await restoreBackup(filename)
        
        // Limpiar cache de IndexedDB para forzar re-sincronización con los nuevos datos
        const { clearAllCache } = await import("@/lib/indexed-db")
        await clearAllCache()
        
        toast({
          title: "Backup restaurado",
          description: "La base de datos ha sido restaurada exitosamente. El cache offline se actualizará automáticamente.",
        })
        // Recargar la página para reflejar los cambios
        window.location.reload()
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo restaurar el backup",
          variant: "destructive",
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Backups de Base de Datos</h1>
          <p className="text-muted-foreground">Gestiona las copias de seguridad de tu base de datos</p>
        </div>
        <Button onClick={handleCreateBackup} disabled={isCreating}>
          <Database className="mr-2 h-4 w-4" />
          {isCreating ? "Creando..." : "Crear Backup"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Backups disponibles</CardTitle>
            <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No hay backups disponibles. Crea uno para empezar.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Archivo</TableHead>
                    <TableHead>Tamaño</TableHead>
                    <TableHead>Fecha de creación</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.filename}>
                      <TableCell className="font-mono text-sm">{backup.filename}</TableCell>
                      <TableCell>{formatFileSize(backup.size)}</TableCell>
                      <TableCell>{formatDate(backup.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(backup.filename)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Descargar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestore(backup.filename)}
                            disabled={isRestoring}
                            className="text-orange-600 hover:text-orange-700"
                          >
                            <AlertTriangle className="mr-2 h-4 w-4" />
                            Restaurar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(backup.filename)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
