import { NextRequest } from "next/server"
import { purchaseAPI, purchaseBody, purchaseFilters } from "@/lib/purchase-http"
import { listSupplierPayments, addSupplierPayment } from "@/lib/accounts-payable"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) { return purchaseAPI(request, actor => listSupplierPayments(actor, purchaseFilters(request))) }
export async function POST(request: NextRequest) { return purchaseAPI(request, async actor => addSupplierPayment(actor, await purchaseBody<Parameters<typeof addSupplierPayment>[1]>(request))) }
