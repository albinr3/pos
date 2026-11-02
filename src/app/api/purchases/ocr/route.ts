import { NextRequest } from "next/server"
import { purchaseAPI, purchaseBody } from "@/lib/purchase-http"
import { createPurchaseFromOCR } from "@/lib/purchase-ocr"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return purchaseAPI(request, async actor => createPurchaseFromOCR(actor, await purchaseBody<Parameters<typeof createPurchaseFromOCR>[1]>(request))) }
