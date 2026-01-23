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

import { deactivateSupplier, listSuppliers, upsertSupplier } from "./actions"

type Supplier = Awaited<ReturnType<typeof listSuppliers>>[number]

export function SuppliersClient() {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Supplier[]>([])
  const [isLoading, startLoading] = useTransition()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)

  const [name, setName] = useState("")
  const [contactName, setContactName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [discountPercent, setDiscountPercent] = useState("")
  const [isSaving, startSaving] = useTransition()

  function refresh(q?: string) {
    startLoading(async () => {
      try {
        const r = await listSuppliers(q)
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

  function resetForm(s?: Supplier | null) {
    const x = s ?? null
    setEditing(x)
    setName(x?.name ?? "")
    setContactName(x?.contactName ?? "")
    setPhone(x?.phone ?? "")
    setEmail(x?.email ?? "")
    setAddress(x?.address ?? "")
    setNotes(x?.notes ?? "")
    setDiscountPercent(x?.discountPercentBp ? (x.discountPercentBp / 100).toFixed(2) : "")
  }

  const title = useMemo(() => (editing ? "Editar proveedor" : "Nuevo proveedor"), [editing])

  async function onSave() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({ title: "Campos requeridos", description: "Hay que llenar todos los campos obligatorios.", variant: "destructive" })
      return
    }
    startSaving(async () => {
      try {
        const discountBp = discountPercent ? Math.round(parseFloat(discountPercent) * 100) : 0
        await upsertSupplier({
          id: editing?.id,
          name,
          contactName: contactName || null,
          phone: phone || null,
          email: email || null,
          address: address || null,
          notes: notes || null,
          discountPercentBp: discountBp,
        })
        toast({ title: "Guardado", description: "Proveedor actualizado" })
        setOpen(false)
        resetForm(null)
        refresh(query)
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
      }
    })
  }

  async function onDelete(id: string) {
    if (!confirm("¿Desactivar este proveedor?")) return
    try {
      await deactivateSupplier(id)
      toast({ title: "Listo", description: "Proveedor desactivado" })
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
            <CardTitle>Proveedores</CardTitle>
            <div className="text-sm text-muted-foreground">Gestiona la información de tus proveedores.</div>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(null) }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(null); setOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px]">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Nombre del proveedor *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Distribuidora ABC" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Contacto</Label>
                    <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Nombre del contacto" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Teléfono</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: 809-555-1234" />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="proveedor@ejemplo.com" />
                </div>

                <div className="grid gap-2">
                  <Label>Dirección</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección completa" />
                </div>

                <div className="grid gap-2">
                  <Label>Descuento por defecto (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    placeholder="Ej: 10 para 10%"
                  />
                  <div className="text-xs text-muted-foreground">
                    Este descuento se aplicará automáticamente al registrar compras de este proveedor.
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Notas</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Información adicional..." rows={3} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="secondary" onClick={() => setOpen(false)} type="button">Cancelar</Button>
                <Button onClick={onSave} disabled={isSaving} type="button">{isSaving ? "Guardando…" : "Guardar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, contacto o teléfono" />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Descuento</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.contactName ?? "—"}</TableCell>
                    <TableCell>{s.phone ?? "—"}</TableCell>
                    <TableCell>{s.email ?? "—"}</TableCell>
                    <TableCell>{s.discountPercentBp ? `${(s.discountPercentBp / 100).toFixed(2)}%` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          className="bg-blue-500 hover:bg-blue-600 text-white"
                          size="icon"
                          onClick={() => {
                            resetForm(s)
                            setOpen(true)
                          }}
                          aria-label="Editar"
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          className="bg-red-500 hover:bg-red-600 text-white"
                          size="icon"
                          onClick={() => onDelete(s.id)}
                          aria-label="Desactivar"
                          title="Desactivar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
                        <p className="text-lg font-medium text-muted-foreground">No se encontraron proveedores</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {query ? "Intenta con otros términos de búsqueda" : "Aún no se han registrado proveedores"}
                        </p>
                      </div>
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









