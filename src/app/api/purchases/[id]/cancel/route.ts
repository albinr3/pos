import { NextRequest } from "next/server"
import { purchaseAPI } from "@/lib/purchase-http"
import { cancelPurchase } from "@/lib/purchases"
export const runtime = "nodejs"
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) { return purchaseAPI(request, async actor => { await cancelPurchase(actor, (await ctx.params).id); return { success: true } }) }
