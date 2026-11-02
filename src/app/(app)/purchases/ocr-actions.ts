"use server"
import * as service from "@/lib/purchase-ocr"
import { cashRequest, resolveCashIdentity } from "@/lib/cash-context"
export type { ExtractedProduct, ExtractedInvoiceData } from "@/lib/purchase-ocr"
async function run<T>(fn: (actor: Awaited<ReturnType<typeof resolveCashIdentity>>["actor"]) => Promise<T>) {
 const identity = await resolveCashIdentity()
 return cashRequest.run({ ...cashRequest.getStore(), trustedActor: identity.actor, deviceHash: identity.deviceHash }, () => fn(identity.actor))
}
export async function processInvoiceImage(image: string) { return run(actor => service.processInvoiceImage(actor, image)) }
export async function createPurchaseFromOCR(input: Parameters<typeof service.createPurchaseFromOCR>[1]) { return run(actor => service.createPurchaseFromOCR(actor, input)) }
export async function findProductByCode(code: string) { return run(actor => service.findProductByCode(actor, code)) }
