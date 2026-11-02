import { NextRequest } from "next/server"
import { purchaseAPI, purchaseBody } from "@/lib/purchase-http"
import { processInvoiceImage } from "@/lib/purchase-ocr"
import { PurchaseError, purchasePermit } from "@/lib/purchase-credit"
export const runtime = "nodejs"
export async function POST(request: NextRequest) { return purchaseAPI(request, async actor => {
 purchasePermit(actor, "canManagePurchases")
 const { image } = await purchaseBody<{ image: string }>(request)
 if (typeof image !== "string" || !image || image.length > 14000000) throw new PurchaseError("INVALID_IMAGE", "Envía una imagen base64 de hasta 10 MB")
 return processInvoiceImage(actor, image)
}) }
