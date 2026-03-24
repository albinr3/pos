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
      isAvailableForSale: p.isAvailableForSale,
      imageUrls: p.imageUrls,
      productKind: p.productKind,
      unit: p.unit,
      recipeItems: Array.isArray(p.recipeItems)
        ? p.recipeItems.map((item: any) => ({
            ingredientId: item.ingredientId,
            qty: typeof item.qty === "number" ? item.qty : item.qty?.toNumber?.() || 0,
            ingredientName: item.ingredient?.name ?? null,
            ingredientUnit: item.ingredient?.unit ?? null,
          }))
        : [],
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
    if (hasValue(body.purchaseUnit) || hasValue(body.saleUnit)) {
      return NextResponse.json({ error: "Usa unit. purchaseUnit y saleUnit ya no son válidos." }, { status: 400 })
    }
    if (Array.isArray(body.modifiers) && body.modifiers.length > 0) {
      return NextResponse.json({ error: "modifiers ya no es soportado. Usa recipeAdjustments al momento de la venta." }, { status: 400 })
    }

    // Idempotencia: si viene localId, verificar si ya existe un producto idéntico creado recientemente
    if (body.localId) {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
      const existing = await prisma.product.findFirst({
        where: {
          accountId: user.accountId,
          name: body.name?.trim(),
          isActive: true,
          createdAt: { gte: twoMinutesAgo },
        },
        include: {
          category: {
            select: { id: true, categoryId: true },
          },
        },
        orderBy: { createdAt: "desc" },
      })
      if (existing) {
        console.log(`[POST /api/products] Idempotencia: producto duplicado detectado (localId=${body.localId}, existingId=${existing.id})`)
        return NextResponse.json({
          id: existing.id,
          productId: existing.productId,
          name: existing.name,
          sku: existing.sku,
          reference: existing.reference,
          price: Number(existing.priceCents) / 100,
          priceCents: Number(existing.priceCents),
          cost: Number(existing.costCents) / 100,
          costCents: Number(existing.costCents),
          stock: existing.stock instanceof Decimal ? existing.stock.toNumber() : Number(existing.stock),
          minStock: existing.minStock instanceof Decimal ? existing.minStock.toNumber() : Number(existing.minStock),
          itbisRateBp: existing.itbisRateBp,
          isAvailableForSale: existing.isAvailableForSale,
          imageUrls: existing.imageUrls,
          productKind: existing.productKind,
          unit: existing.unit,
          categoryId: existing.category?.categoryId ?? null,
          categoryInternalId: existing.categoryId ?? null,
        }, { status: 200 })
      }
    }
    
    // Convertir precio de pesos a centavos si viene como número decimal
    const priceCents = body.priceCents ?? (body.price ? Math.round(body.price * 100) : undefined)
    const costCents = body.costCents ?? (body.cost ? Math.round(body.cost * 100) : undefined)
    let resolvedCategoryInternalId: string | null = null
    const normalizedSku = typeof body.sku === "string" ? body.sku.trim() : ""

    if (normalizedSku) {
      const existingSkuProduct = await prisma.product.findFirst({
        where: {
          accountId: user.accountId,
          sku: { equals: normalizedSku, mode: "insensitive" },
          isActive: true,
        },
        select: {
          id: true,
          productId: true,
          name: true,
          sku: true,
        },
      })

      if (existingSkuProduct) {
        return NextResponse.json(
          {
            error: `El SKU "${normalizedSku}" ya está en uso por el producto #${existingSkuProduct.productId} (${existingSkuProduct.name}).`,
            code: "SKU_DUPLICATE",
            sku: existingSkuProduct.sku,
            existingProduct: {
              id: existingSkuProduct.id,
              productId: existingSkuProduct.productId,
              name: existingSkuProduct.name,
              sku: existingSkuProduct.sku,
            },
          },
          { status: 409 }
        )
      }
    }

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

    const result = await upsertProduct({
      name: body.name,
      sku: body.sku || null,
      reference: body.reference || null,
      supplierId: body.supplierId || null,
      categoryId: resolvedCategoryInternalId,
      priceCents: priceCents!,
      costCents: costCents ?? 0,
      itbisRateBp: body.itbisRateBp ?? 1800,
      isAvailableForSale:
        typeof body.isAvailableForSale === "boolean" ? body.isAvailableForSale : undefined,
      stock: body.stock ?? 0,
      minStock: body.minStock ?? 0,
      imageUrls: body.imageUrls || [],
      productKind: body.productKind || "BASIC",
      recipeItems: body.recipeItems || [],
      unit: body.unit || "UNIDAD",
      user,
    })
    if (!result.ok) {
      const status = result.code === "SKU_DUPLICATE" ? 409 : 400
      return NextResponse.json({ error: result.error, code: result.code }, { status })
    }

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
      isAvailableForSale: product.isAvailableForSale,
      imageUrls: product.imageUrls,
      productKind: product.productKind,
      unit: product.unit,
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
