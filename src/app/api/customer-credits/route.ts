import { NextRequest } from "next/server"
import { actor, errorResponse, ok } from "@/app/api/fiscal/documents/_shared"
import { listCustomerCredits } from "@/lib/fiscal/core/customer-credit"
import { FiscalDocumentError } from "@/lib/fiscal/core/document"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  try {
    const user = await actor(request)
    const params = request.nextUrl.searchParams
    const flag = params.get("availableOnly")
    if (flag !== null && flag !== "true" && flag !== "false") throw new FiscalDocumentError("INVALID_INPUT", "availableOnly debe ser true o false", 400)
    return ok(await listCustomerCredits(user, { customerId: params.get("customerId") ?? undefined, skip: params.has("skip") ? Number(params.get("skip")) : undefined, take: params.has("take") ? Number(params.get("take")) : undefined, availableOnly: flag === "true" }))
  } catch (error) { return errorResponse(error) }
}
