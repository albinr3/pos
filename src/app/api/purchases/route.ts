import { NextRequest, NextResponse } from "next/server"
import { purchaseAPI, purchaseBody, purchaseFilters } from "@/lib/purchase-http"
import { createPurchase } from "@/lib/purchases"
import { listPurchaseRecords } from "@/lib/purchase-queries"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) { return purchaseAPI(request, actor => listPurchaseRecords(actor, purchaseFilters(request))) }
export async function POST(request: NextRequest) { return purchaseAPI(request, async actor => {
  const input = await purchaseBody<Parameters<typeof createPurchase>[1]>(request)
  const result = await createPurchase(actor, input)
  return NextResponse.json(result, { status: 201 })
}) }
