import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { prisma } from "@/lib/db"
import { aggregateStockConsumptions, buildStockInventory, getStockConsumptions, validateStockConsumptions } from "@/lib/pos-stock"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Preflight móvil de solo lectura: nunca generar factura, secuencia ni pendiente
// cuando el inventario ya es insuficiente. createSale conserva su control final.
export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request)
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!user.isOwner && !user.canAccessSales) return NextResponse.json({ error: "Sin acceso a ventas" }, { status: 403 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 }) }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 })
  const items = body.items as Array<{ productId: string; qty: number; recipeAdjustments?: Array<{ ingredientId: string; adjustmentType: "SIN" | "EXTRA" }> }>
  if (!Array.isArray(items) || !items.length || items.length > 100 || items.some(item => typeof item?.productId !== "string" || !item.productId.trim() || !Number.isFinite(item.qty) || item.qty <= 0 || (item.recipeAdjustments !== undefined && (!Array.isArray(item.recipeAdjustments) || item.recipeAdjustments.some(adjustment => typeof adjustment?.ingredientId !== "string" || !adjustment.ingredientId || !["SIN", "EXTRA"].includes(adjustment.adjustmentType)))))) {
    return NextResponse.json({ error: "Productos o cantidades inválidos" }, { status: 400 })
  }
  if (body.saleId && !user.isOwner && !user.canEditSales) return NextResponse.json({ error: "Sin permiso para editar ventas" }, { status: 403 })
  return prisma.$transaction(async tx => {
    const previous = body.saleId ? await tx.sale.findFirst({ where: { id: String(body.saleId), accountId: user.accountId, cancelledAt: null }, include: { items: { include: { consumptions: true } } } }) : null
    if (body.saleId && !previous) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    const products = await tx.product.findMany({
      where: { id: { in: items.map(item => item.productId) }, accountId: user.accountId },
      include: { recipeItems: { include: { ingredient: { select: { name: true, stock: true, isActive: true } } } } },
    })
    const byId = new Map(products.map(product => [product.id, product]))
    if (items.some(item => {
      const product = byId.get(item.productId)
      return !product?.isActive || (!product.isAvailableForSale && !previous?.items.some(line => line.productId === product.id))
    })) return NextResponse.json({ error: "Hay un producto inválido o no disponible en el carrito" }, { status: 400 })
    const snapshotAt = Date.now()
    const mapped = products.map(product => ({ ...product, stock: Number(product.stock), stockSnapshotAt: snapshotAt, recipeItems: product.recipeItems.map(ingredient => ({ ingredientId: ingredient.ingredientId, ingredientName: ingredient.ingredient.name, qty: Number(ingredient.qty), ingredientStock: Number(ingredient.ingredient.stock), ingredientIsActive: ingredient.ingredient.isActive })) }))
    const inventory = buildStockInventory(mapped, user.accountId)
    const result = getStockConsumptions(items.map(item => ({ ...byId.get(item.productId)!, ...item, name: byId.get(item.productId)!.name, productKind: byId.get(item.productId)!.productKind, recipeItems: mapped.find(product => product.id === item.productId)!.recipeItems, recipeAdjustments: item.recipeAdjustments ?? [] })))
    const credits = aggregateStockConsumptions(previous?.items.flatMap(item => item.consumptions.map(consumption => ({ ingredientId: consumption.ingredientId, qty: Number(consumption.qty) }))) ?? [])
    for (const credit of credits) {
      const entry = inventory.get(credit.ingredientId)
      if (entry) inventory.set(entry.id, { ...entry, stock: entry.stock + credit.qty })
    }
    const allowNegativeStock = Boolean(user.isOwner || user.canSellWithoutStock)
    const issue = result.issue ?? (allowNegativeStock ? null : validateStockConsumptions(result.consumptions, inventory))
    return NextResponse.json({ ok: !issue, issue, consumptions: result.consumptions, inventory: [...inventory.values()], accountId: user.accountId, userId: user.id, isOwner: user.isOwner, canSellWithoutStock: user.canSellWithoutStock })
  })
}
