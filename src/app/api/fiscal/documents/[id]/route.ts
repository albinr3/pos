import { NextRequest } from "next/server"
import { actor,body,errorResponse,ok } from "../_shared"
import { getFiscalDocument,updateFiscalDraft } from "@/lib/fiscal/core/preparation"
export const dynamic="force-dynamic"
export const runtime="nodejs"
type Context={params:Promise<{id:string}>}
export async function GET(request:NextRequest,context:Context){try{return ok(await getFiscalDocument(await actor(request),(await context.params).id))}catch(error){return errorResponse(error)}}
export async function PUT(request:NextRequest,context:Context){try{return ok(await updateFiscalDraft(await actor(request),(await context.params).id,await body(request)))}catch(error){return errorResponse(error)}}
