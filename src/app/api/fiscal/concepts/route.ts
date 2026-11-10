import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { FiscalConceptError, listConcepts, writeConcept } from "@/lib/fiscal/core/concepts"
import { FiscalMasterDataError } from "@/lib/fiscal/core/master-data"
import { conceptError, readConceptBody } from "./_shared"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) throw new FiscalConceptError("UNAUTHENTICATED", "No autenticado", 401)
    const raw = request.nextUrl.searchParams.get("take") ?? "50"
    const take = Number(raw)
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(take) || take < 1 || take > 200) throw new FiscalMasterDataError("take debe estar entre 1 y 200", "take")
    const cursor = request.nextUrl.searchParams.get("cursor") || undefined
    const { items, nextCursor } = await listConcepts(user, { take, cursor })
    return NextResponse.json({ data: items, nextCursor }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return conceptError(error, correlationId) }
}
export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) throw new FiscalConceptError("UNAUTHENTICATED", "No autenticado", 401)
    const result = await writeConcept(user, await readConceptBody(request))
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return conceptError(error, correlationId) }
}
