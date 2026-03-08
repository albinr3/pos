import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { listProducts, upsertProduct } from "@/app/(app)/products/actions"
import { Decimal } from "@prisma/client/runtime/library"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  return true
}

// GET /api/products - Listar productos
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("query") || undefined
    const cursor = searchParams.get("cursor") || undefined
    const take = searchParams.get("take") ? parseInt(searchParams.get("take")!) : undefined

    const result = await listProducts({ query, cursor, take, user })

    // Convertir Decimal a número para la respuesta JSON
    const products = result.items.map((p: any) => ({
      id: p.id,
      productId: p.productId,
      name: p.name,
      sku: p.sku,
      reference: p.reference,
      price: p.priceCents / 100, // Convertir centavos a pesos
      priceCents: p.priceCents,
      cost: p.costCents / 100,
      costCents: p.costCents,
      stock: typeof p.stock === "number" ? p.stock : p.stock?.toNumber?.() || 0,
      minStock: typeof p.minStock === "number" ? p.minStock : p.minStock?.toNumber?.() || 0,
      itbisRateBp: p.itbisRateBp,
      imageUrls: p.imageUrls,
      productKind: p.productKind,
      purchaseUnit: p.purchaseUnit,
      saleUnit: p.saleUnit,
      categoryId: p.category?.categoryId ?? null,
      categoryInternalId: p.categoryId ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))

    return NextResponse.json({
      data: products,
      nextCursor: result.nextCursor,
    })
  } catch (error: any) {
    console.error("Error en GET /api/products:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener productos" },
      { status: 500 }
    )
  }
}

// POST /api/products - Crear producto
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()
    
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
      modifiers: body.modifiers || [],
      purchaseUnit: body.purchaseUnit || "UNIDAD",
      saleUnit: body.saleUnit || "UNIDAD",
      user,
    })

    // Obtener el producto creado para retornarlo
    const product = await prisma.product.findFirst({
      where: {
        accountId: user.accountId,
        name: body.name,
      },
      include: {
        category: {
          select: { id: true, categoryId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    if (!product) {
      return NextResponse.json({ error: "Error al crear producto" }, { status: 500 })
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
      purchaseUnit: product.purchaseUnit,
      saleUnit: product.saleUnit,
      categoryId: product.category?.categoryId ?? null,
      categoryInternalId: product.categoryId ?? null,
    }, { status: 201 })
  } catch (error: any) {
    console.error("Error en POST /api/products:", error)
    return NextResponse.json(
      { error: error.message || "Error al crear producto" },
      { status: 500 }
    )
  }
}
