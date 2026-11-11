import { NextRequest } from "next/server"
import { purchaseAPI } from "@/lib/purchase-http"
import { getFiscalCommercialOperation } from "@/lib/fiscal/core/commercial-operations"
export const runtime="nodejs"
export const dynamic="force-dynamic"
export async function GET(request:NextRequest,{params}:{params:Promise<{operationId:string}>}) { return purchaseAPI(request,async actor=>getFiscalCommercialOperation(actor,(await params).operationId)) }
