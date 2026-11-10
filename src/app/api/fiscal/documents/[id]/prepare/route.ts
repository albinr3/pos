import { NextRequest } from "next/server"
import { actor,body,errorResponse,ok } from "../../_shared"
import { prepareFiscalDraft } from "@/lib/fiscal/core/preparation"
export const dynamic="force-dynamic"
export const runtime="nodejs"
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{return ok(await prepareFiscalDraft(await actor(request),(await params).id,await body(request)))}catch(error){return errorResponse(error)}}
