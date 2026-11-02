import { NextRequest } from "next/server"
import { purchaseAPI, purchaseFilters } from "@/lib/purchase-http"
import { listPayables } from "@/lib/accounts-payable"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) { return purchaseAPI(request, actor => listPayables(actor, purchaseFilters(request))) }

