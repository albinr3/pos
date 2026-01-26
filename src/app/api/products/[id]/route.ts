import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { upsertProduct } from "@/app/(app)/products/actions"
import { Decimal } from "@prisma/client/runtime/library"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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
    
    // Convertir precio de pesos a centavos si viene como número decimal
    const priceCents = body.priceCents ?? (body.price ? Math.round(body.price * 100) : undefined)
    const costCents = body.costCents ?? (body.cost ? Math.round(body.cost * 100) : undefined)

    await upsertProduct({
      id,
      name: body.name,
      sku: body.sku || null,
      reference: body.reference || null,
      supplierId: body.supplierId || null,
      categoryId: body.categoryId || null,
      priceCents: priceCents!,
      costCents: costCents ?? 0,
      itbisRateBp: body.itbisRateBp ?? 1800,
      stock: body.stock ?? 0,
      minStock: body.minStock ?? 0,
      imageUrls: body.imageUrls || [],
      purchaseUnit: body.purchaseUnit || "UNIDAD",
      saleUnit: body.saleUnit || "UNIDAD",
    })

    // Obtener el producto actualizado para retornarlo
    const { prisma } = await import("@/lib/db")
    const product = await prisma.product.findFirst({
      where: {
        id,
        accountId: user.accountId,
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
      purchaseUnit: product.purchaseUnit,
      saleUnit: product.saleUnit,
    })
  } catch (error: any) {
    console.error("Error en PUT /api/products/:id:", error)
    return NextResponse.json(
      { error: error.message || "Error al actualizar producto" },
      { status: 500 }
    )
  }
}
