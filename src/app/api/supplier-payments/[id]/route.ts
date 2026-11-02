import { NextRequest } from "next/server"
import { purchaseAPI } from "@/lib/purchase-http"
import { getSupplierPayment } from "@/lib/accounts-payable"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) { return purchaseAPI(request, async actor => getSupplierPayment(actor, (await ctx.params).id)) }
