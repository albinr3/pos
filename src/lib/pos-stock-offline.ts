"use client"

import { cashPending } from "./cash-offline"
import { getPendingSales, getProductsCache } from "./indexed-db"
import { getStockConsumptions, type StockConsumption, type StockProduct } from "./pos-stock"
import { stockCacheToken } from "./stock-cache-state"

export async function readPosStockState(accountId: string, userId?: string) {
  const token = stockCacheToken(accountId)
  const [cached, cash, legacy] = await Promise.all([getProductsCache(userId ? { accountId, id: userId } : null), cashPending(), getPendingSales()])
  const products: StockProduct[] = cached.filter(product => product.accountId === accountId)
  const byId = new Map(products.map(product => [product.id, product]))
  const reserved: StockConsumption[] = []
  let incomplete = false
  const records = [
    ...cash.filter(record => record.kind === "sale" && record.cashOperation.accountId === accountId).map(record => ({ ...record.payload, stockConsumptions: record.stockConsumptions })),
    ...legacy.filter(record => !record.accountId || record.accountId === accountId),
  ]
  for (const record of records) {
    // El consumo se guarda con el pendiente: cambiar una receta después no debe
    // alterar las existencias que esa venta ya comprometió en este dispositivo.
    if (Array.isArray(record.stockConsumptions) && record.stockConsumptions.length && record.stockConsumptions.every((item: StockConsumption) => item.ingredientId && Number.isFinite(item.qty) && item.qty >= 0)) {
      reserved.push(...record.stockConsumptions)
      continue
    }
    if (!Array.isArray(record.items) || !record.items.length) { incomplete = true; continue }
    const lines = []
    for (const item of record.items) {
      const product = byId.get(item.productId)
      if (!product) { incomplete = true; continue }
      lines.push({ ...item, name: product.name, productKind: product.productKind ?? "BASIC", recipeItems: product.recipeItems ?? [], recipeAdjustments: item.recipeAdjustments ?? [] })
    }
    const result = getStockConsumptions(lines)
    if (result.issue) incomplete = true
    else reserved.push(...result.consumptions)
  }
  return { products, reserved, incomplete, stale: token !== null || stockCacheToken(accountId) !== token }
}
