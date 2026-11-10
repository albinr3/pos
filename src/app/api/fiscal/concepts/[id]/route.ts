import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"
import { FiscalConceptError, getConcept, writeConcept, removeConcept } from "@/lib/fiscal/core/concepts"
import { conceptError, readConceptBody } from "../_shared"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
async function handle(request: NextRequest, context: Context, method: "GET" | "PUT" | "DELETE") {
  const correlationId = crypto.randomUUID()
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) throw new FiscalConceptError("UNAUTHENTICATED", "No autenticado", 401)
    const { id } = await context.params
    if (method === "DELETE") { await removeConcept(user, id); return new NextResponse(null, { status: 204 }) }
    const result = method === "GET" ? await getConcept(user, id) : await writeConcept(user, await readConceptBody(request), id)
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return conceptError(error, correlationId) }
}
export async function GET(request: NextRequest, context: Context) { return handle(request, context, "GET") }
export async function PUT(request: NextRequest, context: Context) { return handle(request, context, "PUT") }
export async function DELETE(request: NextRequest, context: Context) { return handle(request, context, "DELETE") }
