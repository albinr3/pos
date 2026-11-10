import { NextRequest } from "next/server"
import { actor,body,errorResponse,ok } from "./_shared"
import { createFiscalDraft,listFiscalDocuments } from "@/lib/fiscal/core/preparation"
export const dynamic="force-dynamic"
export const runtime="nodejs"
export async function GET(request:NextRequest){try{return ok(await listFiscalDocuments(await actor(request),request.nextUrl.searchParams))}catch(error){return errorResponse(error)}}
export async function POST(request:NextRequest){try{return ok(await createFiscalDraft(await actor(request),await body(request)),201)}catch(error){return errorResponse(error)}}
