import { NextRequest } from "next/server"
import { purchaseAPI, purchaseFilters } from "@/lib/purchase-http"
import { getProfitReport } from "@/lib/profit-report"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) { return purchaseAPI(request, actor => getProfitReport(actor, purchaseFilters(request))) }
