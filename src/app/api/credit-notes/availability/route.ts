import { NextRequest } from "next/server"
import { actor, errorResponse, ok } from "@/app/api/fiscal/documents/_shared"
import { creditAdjustmentAvailability } from "@/lib/fiscal/core/credit-drafts"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  try { return ok(await creditAdjustmentAvailability(await actor(request), request.nextUrl.searchParams.get("originalDocumentId") ?? "")) } catch (error) { return errorResponse(error) }
}
