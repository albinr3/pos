import { NextRequest } from "next/server"
import { actor, body, errorResponse, ok } from "@/app/api/fiscal/documents/_shared"
import { createDebitAdjustment, listDebitAdjustments } from "@/lib/fiscal/core/debit-drafts"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  try { const p = request.nextUrl.searchParams; return ok(await listDebitAdjustments(await actor(request), p.get("originalDocumentId") ?? undefined, { skip: p.has("skip") ? Number(p.get("skip")) : undefined, take: p.has("take") ? Number(p.get("take")) : undefined })) } catch (error) { return errorResponse(error) }
}
export async function POST(request: NextRequest) {
  try { const user = await actor(request), data = await body(request); return ok(await createDebitAdjustment(user, data.operationId, data.note), 201) } catch (error) { return errorResponse(error) }
}
