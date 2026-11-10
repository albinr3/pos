import { NextRequest } from "next/server"
import { discardSaleFiscalDraft } from "@/lib/fiscal/core/preparation"
import { actor, body, errorResponse, ok } from "../../_shared"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { return ok(await discardSaleFiscalDraft(await actor(request), (await context.params).id, await body(request))) }
  catch (error) { return errorResponse(error) }
}
