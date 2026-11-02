import { NextRequest } from "next/server"
import { purchaseAPI } from "@/lib/purchase-http"
import { supplierPaymentOptions } from "@/lib/accounts-payable"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) { return purchaseAPI(request, supplierPaymentOptions) }
