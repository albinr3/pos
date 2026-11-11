import { NextRequest } from "next/server"
import { actor, body, errorResponse, ok } from "@/app/api/fiscal/documents/_shared"
import { discardDebitAdjustment } from "@/lib/fiscal/core/debit-drafts"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const user = await actor(request), data = await body(request); return ok(await discardDebitAdjustment(user, (await context.params).id, data.operationId, data.expectedRevision, data.reason)) } catch (error) { return errorResponse(error) }
}
