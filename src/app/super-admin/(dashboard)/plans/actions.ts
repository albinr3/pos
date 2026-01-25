"use server"

import { prisma } from "@/lib/db"
import { getCurrentSuperAdmin } from "@/lib/super-admin-auth"
import { revalidatePath } from "next/cache"

export type BillingPlanWithCount = {
  id: string
  createdAt: Date
  updatedAt: Date
  name: string
  description: string | null
  priceUsdCents: number
  priceDopCents: number
  lemonVariantId: string | null
  isDefault: boolean
  isActive: boolean
  _count: {
    subscriptions: number
  }
}

export async function getBillingPlans(): Promise<BillingPlanWithCount[]> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    throw new Error("No autorizado")
  }

  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      _count: {
        select: { subscriptions: true },
      },
    },
  })

  return plans
}

export async function getBillingPlanById(id: string): Promise<BillingPlanWithCount | null> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    throw new Error("No autorizado")
  }

  const plan = await prisma.billingPlan.findUnique({
    where: { id },
    include: {
      _count: {
        select: { subscriptions: true },
      },
    },
  })

  return plan
}

export type CreatePlanInput = {
  name: string
  description?: string
  priceUsdCents: number
  priceDopCents: number
  lemonVariantId?: string
  isDefault?: boolean
}

export async function createBillingPlan(
  input: CreatePlanInput
): Promise<{ success: boolean; plan?: BillingPlanWithCount; error?: string }> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    return { success: false, error: "No autorizado" }
  }

  if (!admin.canModifyPricing) {
    return { success: false, error: "No tienes permiso para modificar precios" }
  }

  try {
    // Validaciones
    if (!input.name.trim()) {
      return { success: false, error: "El nombre es requerido" }
    }
    if (input.priceUsdCents < 0 || input.priceDopCents < 0) {
      return { success: false, error: "Los precios no pueden ser negativos" }
    }

    // Si es default, quitar default de otros planes
    if (input.isDefault) {
      await prisma.billingPlan.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const plan = await prisma.billingPlan.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        priceUsdCents: input.priceUsdCents,
        priceDopCents: input.priceDopCents,
        lemonVariantId: input.lemonVariantId?.trim() || null,
        isDefault: input.isDefault ?? false,
      },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    })

    // Log de auditoría
    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: admin.id,
        action: "created_billing_plan",
        metadata: {
          planId: plan.id,
          planName: plan.name,
          priceUsdCents: plan.priceUsdCents,
          priceDopCents: plan.priceDopCents,
        },
      },
    })

    revalidatePath("/super-admin/plans")
    return { success: true, plan }
  } catch (error) {
    console.error("Error creating billing plan:", error)
    return { success: false, error: "Error al crear el plan" }
  }
}

export type UpdatePlanInput = {
  id: string
  name?: string
  description?: string
  priceUsdCents?: number
  priceDopCents?: number
  lemonVariantId?: string
  isDefault?: boolean
  isActive?: boolean
}

export async function updateBillingPlan(
  input: UpdatePlanInput
): Promise<{ success: boolean; plan?: BillingPlanWithCount; error?: string }> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    return { success: false, error: "No autorizado" }
  }

  if (!admin.canModifyPricing) {
    return { success: false, error: "No tienes permiso para modificar precios" }
  }

  try {
    const existingPlan = await prisma.billingPlan.findUnique({
      where: { id: input.id },
    })

    if (!existingPlan) {
      return { success: false, error: "Plan no encontrado" }
    }

    // Si se está marcando como default, quitar default de otros
    if (input.isDefault && !existingPlan.isDefault) {
      await prisma.billingPlan.updateMany({
        where: { isDefault: true, id: { not: input.id } },
        data: { isDefault: false },
      })
    }

    // Si se está desactivando el plan default, no permitir
    if (input.isActive === false && existingPlan.isDefault) {
      return { success: false, error: "No puedes desactivar el plan por defecto" }
    }

    // Si se está quitando el default y es el único default, no permitir
    if (input.isDefault === false && existingPlan.isDefault) {
      const otherDefaultExists = await prisma.billingPlan.findFirst({
        where: { isDefault: true, id: { not: input.id } },
      })
      if (!otherDefaultExists) {
        return { success: false, error: "Debe haber al menos un plan por defecto" }
      }
    }

    const plan = await prisma.billingPlan.update({
      where: { id: input.id },
      data: {
        name: input.name?.trim(),
        description: input.description?.trim(),
        priceUsdCents: input.priceUsdCents,
        priceDopCents: input.priceDopCents,
        lemonVariantId: input.lemonVariantId?.trim() || null,
        isDefault: input.isDefault,
        isActive: input.isActive,
      },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    })

    // Log de auditoría
    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: admin.id,
        action: "updated_billing_plan",
        metadata: {
          planId: plan.id,
          planName: plan.name,
          changes: input,
        },
      },
    })

    revalidatePath("/super-admin/plans")
    return { success: true, plan }
  } catch (error) {
    console.error("Error updating billing plan:", error)
    return { success: false, error: "Error al actualizar el plan" }
  }
}

export async function deleteBillingPlan(
  planId: string
): Promise<{ success: boolean; error?: string }> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    return { success: false, error: "No autorizado" }
  }

  if (!admin.canModifyPricing) {
    return { success: false, error: "No tienes permiso para eliminar planes" }
  }

  try {
    const plan = await prisma.billingPlan.findUnique({
      where: { id: planId },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    })

    if (!plan) {
      return { success: false, error: "Plan no encontrado" }
    }

    if (plan.isDefault) {
      return { success: false, error: "No puedes eliminar el plan por defecto" }
    }

    if (plan._count.subscriptions > 0) {
      return {
        success: false,
        error: `No puedes eliminar este plan porque hay ${plan._count.subscriptions} cuenta(s) asignada(s). Reasigna las cuentas primero.`,
      }
    }

    await prisma.billingPlan.delete({
      where: { id: planId },
    })

    // Log de auditoría
    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: admin.id,
        action: "deleted_billing_plan",
        metadata: {
          planId: plan.id,
          planName: plan.name,
        },
      },
    })

    revalidatePath("/super-admin/plans")
    return { success: true }
  } catch (error) {
    console.error("Error deleting billing plan:", error)
    return { success: false, error: "Error al eliminar el plan" }
  }
}

// Asignar plan a una cuenta
export async function assignPlanToAccount(
  accountId: string,
  planId: string
): Promise<{ success: boolean; error?: string }> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    return { success: false, error: "No autorizado" }
  }

  if (!admin.canModifyPricing && !admin.canManageAccounts) {
    return { success: false, error: "No tienes permiso para asignar planes" }
  }

  try {
    const plan = await prisma.billingPlan.findUnique({
      where: { id: planId },
    })

    if (!plan) {
      return { success: false, error: "Plan no encontrado" }
    }

    if (!plan.isActive) {
      return { success: false, error: "No puedes asignar un plan inactivo" }
    }

    const subscription = await prisma.billingSubscription.findUnique({
      where: { accountId },
      include: { billingPlan: true },
    })

    if (!subscription) {
      return { success: false, error: "Suscripción no encontrada" }
    }

    const oldPlanName = subscription.billingPlan?.name || "Sin plan"

    // Actualizar la suscripción con el nuevo plan y copiar precios
    await prisma.billingSubscription.update({
      where: { accountId },
      data: {
        billingPlanId: planId,
        priceUsdCents: plan.priceUsdCents,
        priceDopCents: plan.priceDopCents,
      },
    })

    // Log de auditoría
    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: admin.id,
        action: "assigned_billing_plan",
        targetAccountId: accountId,
        metadata: {
          oldPlan: oldPlanName,
          newPlan: plan.name,
          newPriceUsdCents: plan.priceUsdCents,
          newPriceDopCents: plan.priceDopCents,
        },
      },
    })

    revalidatePath("/super-admin/plans")
    revalidatePath(`/super-admin/accounts/${accountId}`)
    return { success: true }
  } catch (error) {
    console.error("Error assigning plan:", error)
    return { success: false, error: "Error al asignar el plan" }
  }
}

// Obtener planes activos (para dropdown de selección)
export async function getActiveBillingPlans(): Promise<
  { id: string; name: string; priceUsdCents: number; priceDopCents: number }[]
> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    return []
  }

  const plans = await prisma.billingPlan.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      priceUsdCents: true,
      priceDopCents: true,
    },
  })

  return plans
}
