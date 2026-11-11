import { NextRequest } from "next/server"
import { actor, body, errorResponse, ok } from "@/app/api/fiscal/documents/_shared"
import { previewCreditAdjustmentEdit } from "@/lib/fiscal/core/credit-drafts"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { return ok(await previewCreditAdjustmentEdit(await actor(request), (await context.params).id, await body(request))) }
  catch (error) { return errorResponse(error) }
}
