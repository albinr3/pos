import { NextRequest } from "next/server"
import { actor, body, errorResponse, ok } from "@/app/api/fiscal/documents/_shared"
import { validateCreditAdjustment } from "@/lib/fiscal/core/credit-drafts"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const user = await actor(request), data = await body(request); return ok(await validateCreditAdjustment(user, (await context.params).id, data.operationId, data.expectedRevision)) } catch (error) { return errorResponse(error) }
}
