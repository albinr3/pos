import { NextRequest } from "next/server"
import { actor, body, errorResponse, ok } from "@/app/api/fiscal/documents/_shared"
import { previewCreditAdjustment } from "@/lib/fiscal/core/credit-drafts"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST(request: NextRequest) {
  try { return ok(await previewCreditAdjustment(await actor(request), await body(request))) } catch (error) { return errorResponse(error) }
}
