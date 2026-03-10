import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { upsertProduct } from "@/app/(app)/products/actions"
import { Decimal } from "@prisma/client/runtime/library"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  return true
}

// PUT /api/products/:id - Actualizar producto
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    if (hasValue(body.purchaseUnit) || hasValue(body.saleUnit)) {
      return NextResponse.json({ error: "Usa unit. purchaseUnit y saleUnit ya no son válidos." }, { status: 400 })
    }
    if (Array.isArray(body.modifiers) && body.modifiers.length > 0) {
      return NextResponse.json({ error: "modifiers ya no es soportado. Usa recipeAdjustments al momento de la venta." }, { status: 400 })
    }
    
    // Convertir precio de pesos a centavos si viene como número decimal
    const priceCents = body.priceCents ?? (body.price ? Math.round(body.price * 100) : undefined)
    const costCents = body.costCents ?? (body.cost ? Math.round(body.cost * 100) : undefined)
    let resolvedCategoryInternalId: string | null = null

    if (hasValue(body.categoryId)) {
      const parsedCategoryId = Number(body.categoryId)
      if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
        return NextResponse.json({ error: "categoryId inválido" }, { status: 400 })
      }
      const category = await prisma.category.findFirst({
        where: {
          accountId: user.accountId,
          categoryId: parsedCategoryId,
          isActive: true,
        },
        select: { id: true },
      })
      if (!category) {
        return NextResponse.json({ error: "Categoría no encontrada" }, { status: 400 })
      }
      resolvedCategoryInternalId = category.id
    }

    await upsertProduct({
      id,
      name: body.name,
      sku: body.sku || null,
      reference: body.reference || null,
      supplierId: body.supplierId || null,
      categoryId: resolvedCategoryInternalId,
      priceCents: priceCents!,
      costCents: costCents ?? 0,
      itbisRateBp: body.itbisRateBp ?? 1800,
      stock: body.stock ?? 0,
      minStock: body.minStock ?? 0,
      imageUrls: body.imageUrls || [],
      productKind: body.productKind || "BASIC",
      recipeItems: body.recipeItems || [],
      unit: body.unit || "UNIDAD",
      user,
    })

    // Obtener el producto actualizado para retornarlo
    const product = await prisma.product.findFirst({
      where: {
        id,
        accountId: user.accountId,
      },
      include: {
        category: {
          select: { id: true, categoryId: true },
        },
      },
    })

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
    }

    return NextResponse.json({
      id: product.id,
      productId: product.productId,
      name: product.name,
      sku: product.sku,
      reference: product.reference,
      price: Number(product.priceCents) / 100,
      priceCents: Number(product.priceCents),
      cost: Number(product.costCents) / 100,
      costCents: Number(product.costCents),
      stock: product.stock instanceof Decimal ? product.stock.toNumber() : Number(product.stock),
      minStock: product.minStock instanceof Decimal ? product.minStock.toNumber() : Number(product.minStock),
      itbisRateBp: product.itbisRateBp,
      imageUrls: product.imageUrls,
      productKind: product.productKind,
      unit: product.unit,
      categoryId: product.category?.categoryId ?? null,
      categoryInternalId: product.categoryId ?? null,
    })
  } catch (error: any) {
    console.error("Error en PUT /api/products/:id:", error)
    return NextResponse.json(
      { error: error.message || "Error al actualizar producto" },
      { status: 500 }
    )
  }
}
