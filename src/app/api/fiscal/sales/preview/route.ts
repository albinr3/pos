import { NextRequest } from "next/server"
import { previewFiscalSale } from "@/lib/fiscal/core/sale-preview"
import { actor, body, errorResponse, ok } from "../../documents/_shared"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try { return ok(await previewFiscalSale(await actor(request), await body(request))) }
  catch (error) { return errorResponse(error) }
}
