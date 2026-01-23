"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Edit, Plus, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"

import { deactivateCategory, listCategories, upsertCategory } from "./actions"

type Category = Awaited<ReturnType<typeof listCategories>>[number]

export function CategoriesClient() {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Category[]>([])
  const [isLoading, startLoading] = useTransition()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isSaving, startSaving] = useTransition()

  function refresh(q?: string) {
    startLoading(async () => {
      try {
        const r = await listCategories(q)
        setItems(r)
      } catch {
        setItems([])
      }
    })
  }

  useEffect(() => {
    refresh("")
  }, [])

  useEffect(() => {
    const q = query.trim()
    const t = setTimeout(() => refresh(q), 200)
    return () => clearTimeout(t)
  }, [query])

  function resetForm(c?: Category | null) {
    const x = c ?? null
    setEditing(x)
    setName(x?.name ?? "")
    setDescription(x?.description ?? "")
  }

  const title = useMemo(() => (editing ? "Editar categoría" : "Nueva categoría"), [editing])

  async function onSave() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({ title: "Campos requeridos", description: "Hay que llenar todos los campos obligatorios.", variant: "destructive" })
      return
    }
    startSaving(async () => {
      try {
        await upsertCategory({
          id: editing?.id,
          name,
          description: description || null,
        })
        toast({ title: "Guardado", description: "Categoría actualizada" })
        setOpen(false)
        resetForm(null)
        refresh(query)
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
      }
    })
  }

  async function onDelete(id: string) {
    if (!confirm("¿Desactivar esta categoría?")) return
    try {
      await deactivateCategory(id)
      toast({ title: "Listo", description: "Categoría desactivada" })
      refresh(query)
    } catch {
      toast({ title: "Error", description: "No se pudo desactivar" })
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Categorías</CardTitle>
            <div className="text-sm text-muted-foreground">Gestiona las categorías de tus productos.</div>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(null) }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(null); setOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Nombre de la categoría *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Alfombras" />
                </div>

                <div className="grid gap-2">
                  <Label>Descripción (opcional)</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descripción de la categoría"
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); resetForm(null) }}>
                  Cancelar
                </Button>
                <Button onClick={onSave} disabled={isSaving}>
                  {isSaving ? "Guardando…" : "Guardar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar categorías…"
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {query ? "Sin resultados" : "No hay categorías. Crea una para comenzar."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.description || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            resetForm(item)
                            setOpen(true)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

