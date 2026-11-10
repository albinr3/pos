import { NextRequest } from "next/server"
import { findSaleCustomerByIdentification } from "@/lib/fiscal/core/sale-customer"
import { actor, errorResponse, ok } from "../../documents/_shared"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const user = await actor(request)
    const values = request.nextUrl.searchParams.getAll("identification")
    return ok(await findSaleCustomerByIdentification(user, values.length === 1 ? values[0] : null))
  } catch (error) {
    return errorResponse(error)
  }
}
