import { NextRequest } from "next/server"
import { PurchaseError } from "@/lib/purchase-credit"
import { purchaseAPI, purchaseFilters } from "@/lib/purchase-http"
import { purchaseReport } from "@/lib/purchase-reports"
import { purchaseReportResponse } from "@/lib/purchase-report-export"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) { return purchaseAPI(request, async actor => {
 const format = request.nextUrl.searchParams.get("format") || "json"
 if (!["json", "xlsx", "pdf"].includes(format)) throw new PurchaseError("INVALID_FORMAT", "Formato inválido")
 const report = await purchaseReport(actor, "purchases", purchaseFilters(request), format !== "json")
 return format === "json" ? report : purchaseReportResponse(report, format)
}) }
