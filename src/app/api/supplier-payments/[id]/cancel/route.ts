import { NextRequest } from "next/server"
import { purchaseAPI, purchaseBody } from "@/lib/purchase-http"
import { cancelSupplierPayment } from "@/lib/accounts-payable"
export const runtime = "nodejs"
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) { return purchaseAPI(request, async actor => cancelSupplierPayment(actor, (await ctx.params).id, (await purchaseBody<{ reason: string }>(request)).reason)) }
