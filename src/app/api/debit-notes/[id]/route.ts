import { NextRequest } from "next/server"
import { actor, body, errorResponse, ok } from "@/app/api/fiscal/documents/_shared"
import { getDebitAdjustment, updateDebitAdjustment } from "@/lib/fiscal/core/debit-drafts"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export async function GET(request: NextRequest, context: Context) {
  try { return ok(await getDebitAdjustment(await actor(request), (await context.params).id)) } catch (error) { return errorResponse(error) }
}
export async function PUT(request: NextRequest, context: Context) {
  try { const user = await actor(request), data = await body(request); return ok(await updateDebitAdjustment(user, (await context.params).id, data.operationId, data.expectedRevision, data.note)) } catch (error) { return errorResponse(error) }
}
