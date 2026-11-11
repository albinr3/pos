import { NextRequest } from "next/server"
import { purchaseAPI } from "@/lib/purchase-http"
import { createForeignObligation, listForeignObligations } from "@/lib/fiscal/core/foreign-payments"
export const runtime="nodejs"
export const dynamic="force-dynamic"
export async function GET(request: NextRequest) { return purchaseAPI(request, actor => listForeignObligations(actor, { skip: request.nextUrl.searchParams.has("skip") ? Number(request.nextUrl.searchParams.get("skip")) : undefined, take: request.nextUrl.searchParams.has("take") ? Number(request.nextUrl.searchParams.get("take")) : undefined })) }
export async function POST(request: NextRequest) { return purchaseAPI(request, async actor => createForeignObligation(actor, await request.json())) }
