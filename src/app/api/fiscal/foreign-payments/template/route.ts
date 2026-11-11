import { NextRequest } from "next/server"
import { actor, errorResponse, ok } from "../../documents/_shared"
import { getE47Template } from "@/lib/fiscal/core/foreign-document"
export const runtime="nodejs"
export const dynamic="force-dynamic"
export async function GET(request:NextRequest) { try { return ok(await getE47Template(await actor(request),request.nextUrl.searchParams.get("paymentId") ?? "")) } catch(error) { return errorResponse(error) } }
