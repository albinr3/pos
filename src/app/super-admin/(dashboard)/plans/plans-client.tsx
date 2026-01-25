"use client"

import { useState, useTransition } from "react"
import {
  Plus,
  Edit,
  Trash2,
  Star,
  StarOff,
  DollarSign,
  Users,
  Check,
  X,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
import { useToast } from "@/hooks/use-toast"

import type { BillingPlanWithCount, CreatePlanInput, UpdatePlanInput } from "./actions"
import {
  getBillingPlans,
  createBillingPlan,
  updateBillingPlan,
  deleteBillingPlan,
} from "./actions"

type Props = {
  initialPlans: BillingPlanWithCount[]
}

function formatMoney(cents: number, currency: "USD" | "DOP"): string {
  const amount = cents / 100
  if (currency === "USD") {
    return `$${amount.toFixed(2)}`
  }
  return `RD$${amount.toLocaleString("es-DO", { minimumFractionDigits: 2 })}`
}

export function PlansClient({ initialPlans }: Props) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [plans, setPlans] = useState(initialPlans)

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanWithCount | null>(null)

  // Form state
  const [formData, setFormData] = useState<{
    name: string
    description: string
    priceUsd: string
    priceDop: string
    lemonVariantId: string
    isDefault: boolean
    isActive: boolean
  }>({
    name: "",
    description: "",
    priceUsd: "20.00",
    priceDop: "1300.00",
    lemonVariantId: "",
    isDefault: false,
    isActive: true,
  })

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      priceUsd: "20.00",
      priceDop: "1300.00",
      lemonVariantId: "",
      isDefault: false,
      isActive: true,
    })
  }

  const refreshPlans = () => {
    startTransition(async () => {
      const newPlans = await getBillingPlans()
      setPlans(newPlans)
    })
  }

  const openCreateDialog = () => {
    resetForm()
    setCreateDialogOpen(true)
  }

  const openEditDialog = (plan: BillingPlanWithCount) => {
    setSelectedPlan(plan)
    setFormData({
      name: plan.name,
      description: plan.description || "",
      priceUsd: (plan.priceUsdCents / 100).toFixed(2),
      priceDop: (plan.priceDopCents / 100).toFixed(2),
      lemonVariantId: plan.lemonVariantId || "",
      isDefault: plan.isDefault,
      isActive: plan.isActive,
    })
    setEditDialogOpen(true)
  }

  const openDeleteDialog = (plan: BillingPlanWithCount) => {
    setSelectedPlan(plan)
    setDeleteDialogOpen(true)
  }

  const handleCreate = async () => {
    const priceUsdCents = Math.round(parseFloat(formData.priceUsd) * 100)
    const priceDopCents = Math.round(parseFloat(formData.priceDop) * 100)

    if (isNaN(priceUsdCents) || isNaN(priceDopCents)) {
      toast({ title: "Error", description: "Precios inválidos", variant: "destructive" })
      return
    }

    const input: CreatePlanInput = {
      name: formData.name,
      description: formData.description || undefined,
      priceUsdCents,
      priceDopCents,
      lemonVariantId: formData.lemonVariantId || undefined,
      isDefault: formData.isDefault,
    }

    startTransition(async () => {
      const result = await createBillingPlan(input)
      if (result.success) {
        toast({ title: "Plan creado", description: `El plan "${formData.name}" ha sido creado` })
        setCreateDialogOpen(false)
        refreshPlans()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    })
  }

  const handleUpdate = async () => {
    if (!selectedPlan) return

    const priceUsdCents = Math.round(parseFloat(formData.priceUsd) * 100)
    const priceDopCents = Math.round(parseFloat(formData.priceDop) * 100)

    if (isNaN(priceUsdCents) || isNaN(priceDopCents)) {
      toast({ title: "Error", description: "Precios inválidos", variant: "destructive" })
      return
    }

    const input: UpdatePlanInput = {
      id: selectedPlan.id,
      name: formData.name,
      description: formData.description || undefined,
      priceUsdCents,
      priceDopCents,
      lemonVariantId: formData.lemonVariantId || undefined,
      isDefault: formData.isDefault,
      isActive: formData.isActive,
    }

    startTransition(async () => {
      const result = await updateBillingPlan(input)
      if (result.success) {
        toast({ title: "Plan actualizado", description: `El plan "${formData.name}" ha sido actualizado` })
        setEditDialogOpen(false)
        refreshPlans()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    })
  }

  const handleDelete = async () => {
    if (!selectedPlan) return

    startTransition(async () => {
      const result = await deleteBillingPlan(selectedPlan.id)
      if (result.success) {
        toast({ title: "Plan eliminado", description: `El plan "${selectedPlan.name}" ha sido eliminado` })
        setDeleteDialogOpen(false)
        refreshPlans()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-green-600" />
            Planes de Precios
          </h1>
          <p className="text-muted-foreground">
            Gestiona los planes de precios disponibles para las cuentas
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Plan
        </Button>
      </div>

      {/* Plans Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={`p-5 relative ${!plan.isActive ? "opacity-60" : ""}`}
          >
            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-3">
              {plan.isDefault && (
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
                  <Star className="h-3 w-3 mr-1 fill-yellow-500" />
                  Por defecto
                </Badge>
              )}
              {!plan.isActive && (
                <Badge variant="secondary">Inactivo</Badge>
              )}
              <Badge variant="outline" className="ml-auto">
                <Users className="h-3 w-3 mr-1" />
                {plan._count.subscriptions} cuenta(s)
              </Badge>
            </div>

            {/* Plan Info */}
            <h3 className="text-lg font-semibold mb-1">{plan.name}</h3>
            {plan.description && (
              <p className="text-sm text-muted-foreground mb-3">{plan.description}</p>
            )}

            {/* Prices */}
            <div className="space-y-1 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">USD:</span>
                <span className="font-bold text-lg">
                  {formatMoney(plan.priceUsdCents, "USD")}
                  <span className="text-sm font-normal text-muted-foreground">/mes</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">DOP:</span>
                <span className="font-bold text-lg">
                  {formatMoney(plan.priceDopCents, "DOP")}
                  <span className="text-sm font-normal text-muted-foreground">/mes</span>
                </span>
              </div>
            </div>

            {/* Lemon Variant */}
            {plan.lemonVariantId && (
              <div className="text-xs text-muted-foreground mb-3 font-mono bg-muted px-2 py-1 rounded">
                Lemon ID: {plan.lemonVariantId}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => openEditDialog(plan)}
              >
                <Edit className="h-4 w-4 mr-1" />
                Editar
              </Button>
              {!plan.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => openDeleteDialog(plan)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        ))}

        {plans.length === 0 && (
          <Card className="p-8 text-center col-span-full">
            <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium text-lg">No hay planes</h3>
            <p className="text-muted-foreground mb-4">
              Crea tu primer plan de precios
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Plan
            </Button>
          </Card>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Plan</DialogTitle>
            <DialogDescription>
              Define un nuevo plan de precios para las cuentas
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nombre del Plan *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Plan Promocional"
              />
            </div>

            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción opcional del plan"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priceUsd">Precio USD *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="priceUsd"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceUsd}
                    onChange={(e) => setFormData({ ...formData, priceUsd: e.target.value })}
                    className="pl-7"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="priceDop">Precio DOP *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    RD$
                  </span>
                  <Input
                    id="priceDop"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceDop}
                    onChange={(e) => setFormData({ ...formData, priceDop: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="lemonVariantId">Lemon Squeezy Variant ID</Label>
              <Input
                id="lemonVariantId"
                value={formData.lemonVariantId}
                onChange={(e) => setFormData({ ...formData, lemonVariantId: e.target.value })}
                placeholder="Ej: 123456 (opcional)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                ID del producto/variant en Lemon Squeezy para pagos USD
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isDefault">Plan por defecto</Label>
                <p className="text-xs text-muted-foreground">
                  Se asignará a nuevas cuentas
                </p>
              </div>
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={isPending || !formData.name.trim()}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Plan</DialogTitle>
            <DialogDescription>
              Modifica los detalles del plan &quot;{selectedPlan?.name}&quot;
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Nombre del Plan *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Descripción</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-priceUsd">Precio USD *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="edit-priceUsd"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceUsd}
                    onChange={(e) => setFormData({ ...formData, priceUsd: e.target.value })}
                    className="pl-7"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-priceDop">Precio DOP *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    RD$
                  </span>
                  <Input
                    id="edit-priceDop"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceDop}
                    onChange={(e) => setFormData({ ...formData, priceDop: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-lemonVariantId">Lemon Squeezy Variant ID</Label>
              <Input
                id="edit-lemonVariantId"
                value={formData.lemonVariantId}
                onChange={(e) => setFormData({ ...formData, lemonVariantId: e.target.value })}
                placeholder="Ej: 123456 (opcional)"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Plan por defecto</Label>
                <p className="text-xs text-muted-foreground">
                  Se asignará a nuevas cuentas
                </p>
              </div>
              <Switch
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Activo</Label>
                <p className="text-xs text-muted-foreground">
                  Los planes inactivos no se pueden asignar
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                disabled={selectedPlan?.isDefault}
              />
            </div>

            {selectedPlan && selectedPlan._count.subscriptions > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                <strong>Nota:</strong> Este plan tiene {selectedPlan._count.subscriptions} cuenta(s) 
                asignada(s). Los cambios de precio se aplicarán a partir del próximo ciclo de 
                facturación de cada cuenta.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={isPending || !formData.name.trim()}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plan?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar el plan &quot;{selectedPlan?.name}&quot;?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
