import { NextRequest } from "next/server"
import { actor, body, errorResponse, ok } from "../documents/_shared"
import { listReceivedDocuments, saveReceivedDocument } from "@/lib/fiscal/core/received-documents"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request:NextRequest) { try { return ok(await listReceivedDocuments(await actor(request),request.nextUrl.searchParams)) } catch(error) { return errorResponse(error) } }
export async function POST(request:NextRequest) { try { return ok(await saveReceivedDocument(await actor(request),await body(request))) } catch(error) { return errorResponse(error) } }
