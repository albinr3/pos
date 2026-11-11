import { NextRequest } from "next/server"
import { purchaseAPI, purchaseBody } from "@/lib/purchase-http"
import { getPayable, patchStandalonePayable } from "@/lib/accounts-payable"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) { return purchaseAPI(request, async actor => getPayable(actor, (await ctx.params).id)) }
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) { return purchaseAPI(request, async actor => patchStandalonePayable(actor, (await ctx.params).id, await purchaseBody<Parameters<typeof patchStandalonePayable>[2]>(request))) }
