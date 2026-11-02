"use server"
import * as service from "@/lib/purchases"
import { resolveCashIdentity, cashRequest } from "@/lib/cash-context"
async function run<T>(fn: (actor: Awaited<ReturnType<typeof resolveCashIdentity>>["actor"]) => Promise<T>) {
 const identity = await resolveCashIdentity()
 return cashRequest.run({ ...cashRequest.getStore(), trustedActor: identity.actor, deviceHash: identity.deviceHash }, () => fn(identity.actor))
}
export async function listPurchases() { return run(service.listPurchases) }
export async function listAllPurchases() { return run(service.listAllPurchases) }
export async function getPurchaseById(id: string) { return run(actor => service.getPurchaseById(actor, id)) }
export async function searchProductsForPurchase(query: string) { return run(actor => service.searchProductsForPurchase(actor, query)) }
export async function createPurchase(input: Parameters<typeof service.createPurchase>[1]) { return run(actor => service.createPurchase(actor, input)) }
export async function updatePurchase(input: Parameters<typeof service.updatePurchase>[1]) { return run(actor => service.updatePurchase(actor, input)) }
export async function cancelPurchase(id: string) { return run(actor => service.cancelPurchase(actor, id)) }

export async function getPurchasePaymentAccounts() { return run(async actor => (await (await import("@/lib/accounts-payable")).supplierPaymentOptions(actor)).accounts) }
