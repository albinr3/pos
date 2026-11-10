import { NextRequest } from "next/server"
import { previewExistingFiscalSale } from "@/lib/fiscal/core/preparation"
import { actor, body, errorResponse, ok } from "../../../documents/_shared"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { return ok(await previewExistingFiscalSale(await actor(request), (await context.params).id, await body(request))) }
  catch (error) { return errorResponse(error) }
}
