import { NextRequest } from "next/server"
import { purchaseAPI, purchaseBody } from "@/lib/purchase-http"
import { cancelPurchase, getPurchaseById, patchPurchase, updatePurchase } from "@/lib/purchases"
import { purchaseFinancialFields } from "@/lib/purchase-queries"
import { PurchaseError, type PurchaseActor } from "@/lib/purchase-credit"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
// GET, PUT y PATCH deben devolver el mismo contrato financiero para los clientes móviles.
async function detail(actor: PurchaseActor, id: string) {
  const row = await getPurchaseById(actor, id)
  if (!row) throw new PurchaseError("NOT_FOUND", "Compra no encontrada", 404)
  return { ...row, ...purchaseFinancialFields(row), items: row.items.map(i => ({ ...i, productName: i.product.name })) }
}
export async function GET(request: NextRequest, ctx: Context) { return purchaseAPI(request, async actor => detail(actor, (await ctx.params).id)) }
export async function PUT(request: NextRequest, ctx: Context) { return purchaseAPI(request, async actor => { const id = (await ctx.params).id; const input = await purchaseBody<Parameters<typeof updatePurchase>[1]>(request); await updatePurchase(actor, { ...input, id }); return detail(actor, id) }) }
export async function PATCH(request: NextRequest, ctx: Context) { return purchaseAPI(request, async actor => { const id = (await ctx.params).id; const input = await purchaseBody<Parameters<typeof patchPurchase>[2]>(request); await patchPurchase(actor, id, input); return detail(actor, id) }) }
export async function DELETE(request: NextRequest, ctx: Context) { return purchaseAPI(request, async actor => { await cancelPurchase(actor, (await ctx.params).id); return { success: true } }) }
