import { NextRequest } from "next/server"
import { purchaseAPI } from "@/lib/purchase-http"
import { getPayable } from "@/lib/accounts-payable"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) { return purchaseAPI(request, async actor => getPayable(actor, (await ctx.params).id)) }
