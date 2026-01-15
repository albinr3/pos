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

import { deactivateCustomer, listCustomers, upsertCustomer } from "./actions"

type Customer = Awaited<ReturnType<typeof listCustomers>>[number]

export function CustomersClient() {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Customer[]>([])
  const [isLoading, startLoading] = useTransition()

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
        const r = await listCustomers(q)
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

  function resetForm(c?: Customer | null) {
    setEditing(c ?? null)
    setName(c?.name ?? "")
    setPhone(c?.phone ?? "")
    setAddress(c?.address ?? "")
    setCedula(c?.cedula ?? "")
    setProvince(c?.province ?? "")
  }

  async function onSave() {
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

  return (
    <div className="grid gap-6">
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
                <div className="grid grid-cols-2 gap-3">
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

          <div className="rounded-md border">
            <Table>
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
                      {c.isGeneric ? "(Genérico) " : ""}{c.name}
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
                            variant="secondary"
                            size="icon"
                            onClick={() => {
                              resetForm(c)
                              setOpen(true)
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => onDelete(c.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {isLoading ? "Cargando…" : "No hay clientes"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
