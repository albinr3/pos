import { NextRequest } from "next/server"
import { actor, errorResponse, ok } from "../../documents/_shared"
import { getE43Template } from "@/lib/fiscal/core/expense-document"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) { try { return ok(await getE43Template(await actor(request), request.nextUrl.searchParams.get("id") ?? "")) } catch (error) { return errorResponse(error) } }
