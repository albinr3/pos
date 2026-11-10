import { NextRequest } from "next/server"
import { prepareExistingFiscalSale } from "@/lib/fiscal/core/preparation"
import { actor, body, errorResponse, ok } from "../../../documents/_shared"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  // Mantener el resultado envuelto en la respuesta común para conservar el contrato móvil.
  try { return ok(await prepareExistingFiscalSale(await actor(request), (await context.params).id, await body(request))) }
  catch (error) { return errorResponse(error) }
}
