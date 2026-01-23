"use client"

import { useEffect, useState, useTransition } from "react"
import { Edit, Plus, Search, Trash2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { DOMINICAN_PROVINCES } from "@/lib/provinces"

import { deactivateCustomer, listCustomersPage, upsertCustomer } from "./actions"

type Customer = Awaited<ReturnType<typeof listCustomersPage>>["items"][number]

const PAGE_SIZE = 50

export function CustomersClient() {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Customer[]>([])
  const [isLoading, startLoading] = useTransition()
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [cedula, setCedula] = useState("")
  const [province, setProvince] = useState("")
  const [isSaving, startSaving] = useTransition()

  function refresh(q?: string) {
    startLoading(async () => {
      try {
        const r = await listCustomersPage({ query: q, take: PAGE_SIZE })
        setItems(r.items)
        setNextCursor(r.nextCursor)
      } catch {
        setItems([])
        setNextCursor(null)
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

  function loadMore() {
    if (!nextCursor) return
    const q = query.trim()
    startLoading(async () => {
      try {
        const r = await listCustomersPage({ query: q, cursor: nextCursor, take: PAGE_SIZE })
        setItems((prev) => [...prev, ...r.items])
        setNextCursor(r.nextCursor)
      } catch {
        setNextCursor(null)
      }
    })
  }

  function resetForm(c?: Customer | null) {
    setEditing(c ?? null)
    setName(c?.name ?? "")
    setPhone(c?.phone ?? "")
    setAddress(c?.address ?? "")
    setCedula(c?.cedula ?? "")
    setProvince(c?.province ?? "")
  }

  async function onSave() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({ title: "Campos requeridos", description: "Hay que llenar todos los campos obligatorios.", variant: "destructive" })
      return
    }
    startSaving(async () => {
      try {
        await upsertCustomer({
          id: editing?.id,
          name,
          phone: phone || null,
          address: address || null,
          cedula: cedula || null,
          province: province || null,
        })
        toast({ title: "Guardado" })
        setOpen(false)
        resetForm(null)
        refresh(query)
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
      }
    })
  }

  async function onDelete(id: string) {
    if (!confirm("¿Desactivar este cliente?") ) return
    try {
      await deactivateCustomer(id)
      toast({ title: "Listo", description: "Cliente desactivado" })
      refresh(query)
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo desactivar" })
    }
  }

  const totalCustomers = items.length

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-purple-primary bg-purple-50 dark:bg-purple-950/20">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total de clientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-purple-primary">{totalCustomers}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Clientes
            </CardTitle>
            <div className="text-sm text-muted-foreground">Administra clientes (crédito / historial).</div>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(null); setOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Nombre</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Teléfono (opcional)</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Cédula (opcional)</Label>
                    <Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Ej: 001-1234567-8" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Dirección (opcional)</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ej: Calle Principal #123" />
                </div>
                <div className="grid gap-2">
                  <Label>Provincia (opcional)</Label>
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Seleccionar provincia</option>
                    {DOMINICAN_PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={onSave} disabled={isSaving}>
                  {isSaving ? "Guardando…" : "Guardar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente" />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Cédula</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Provincia</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.isGeneric ? "(General) " : ""}{c.name}
                    </TableCell>
                    <TableCell>{c.phone ?? "—"}</TableCell>
                    <TableCell>{c.cedula ?? "—"}</TableCell>
                    <TableCell>{c.address ?? "—"}</TableCell>
                    <TableCell>{c.province ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {c.isGeneric ? (
                        <span className="text-xs text-muted-foreground">Protegido</span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Button
                            className="bg-blue-500 hover:bg-blue-600 text-white"
                            size="icon"
                            onClick={() => {
                              resetForm(c)
                              setOpen(true)
                            }}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            className="bg-red-500 hover:bg-red-600 text-white"
                            size="icon"
                            onClick={() => onDelete(c.id)}
                            title="Desactivar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {!isLoading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <img
                          src="/lupa.png"
                          alt="No hay resultados"
                          width={192}
                          height={192}
                          className="mb-4 opacity-60"
                        />
                        <p className="text-lg font-medium text-muted-foreground">No se encontraron clientes</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {query ? "Intenta con otros términos de búsqueda" : "Aún no se han registrado clientes"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {nextCursor && (
            <div className="flex justify-center">
              <Button type="button" variant="secondary" onClick={loadMore} disabled={isLoading}>
                {isLoading ? "Cargando…" : "Cargar más"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
