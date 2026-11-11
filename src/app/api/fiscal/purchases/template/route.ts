import { NextRequest } from "next/server"
import { actor, errorResponse, ok } from "../../documents/_shared"
import { getE41Template } from "@/lib/fiscal/core/purchase-document"
export const runtime="nodejs"
export const dynamic="force-dynamic"
export async function GET(request:NextRequest) { try { return ok(await getE41Template(await actor(request),request.nextUrl.searchParams.get("source") ?? "",request.nextUrl.searchParams.get("id") ?? "")) } catch(error) { return errorResponse(error) } }
