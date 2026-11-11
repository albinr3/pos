import { NextRequest } from "next/server"
import { purchaseAPI } from "@/lib/purchase-http"
import { getForeignObligation } from "@/lib/fiscal/core/foreign-payments"
export const runtime="nodejs"
export const dynamic="force-dynamic"
export async function GET(request: NextRequest, {params}:{params:Promise<{id:string}>}) { return purchaseAPI(request, async actor => getForeignObligation(actor, (await params).id)) }
