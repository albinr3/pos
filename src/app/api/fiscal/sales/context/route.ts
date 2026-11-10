import { NextRequest } from "next/server"
import { listFiscalSaleCustomers } from "@/lib/fiscal/core/sale-customer"
import { availability } from "@/lib/fiscal/core/sequences"
import { actor, errorResponse, ok } from "../../documents/_shared"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const user = await actor(request)
    const customers = await listFiscalSaleCustomers(user)
    const sequences = await availability(user)
    return ok({ ...customers, sequences: sequences.data.filter(sequence => ["E31", "E32", "E44", "E45", "E46"].includes(sequence.type)) })
  } catch (error) { return errorResponse(error) }
}
