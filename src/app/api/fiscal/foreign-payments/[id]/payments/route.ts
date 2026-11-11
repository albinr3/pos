import { NextRequest } from "next/server"
import { purchaseAPI } from "@/lib/purchase-http"
import { addForeignPayment } from "@/lib/fiscal/core/foreign-payments"
export const runtime="nodejs"
export const dynamic="force-dynamic"
export async function POST(request: NextRequest, {params}:{params:Promise<{id:string}>}) { return purchaseAPI(request, async actor => addForeignPayment(actor, (await params).id, await request.json())) }
