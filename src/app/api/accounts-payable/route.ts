import { NextRequest } from "next/server"
import { purchaseAPI, purchaseBody, purchaseFilters } from "@/lib/purchase-http"
import { createStandalonePayable, listPayables } from "@/lib/accounts-payable"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) { return purchaseAPI(request, actor => listPayables(actor, purchaseFilters(request))) }
export async function POST(request: NextRequest) { return purchaseAPI(request, async actor => createStandalonePayable(actor, await purchaseBody<Parameters<typeof createStandalonePayable>[1]>(request))) }

