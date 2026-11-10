import { NextRequest } from "next/server"
import { actor,errorResponse,ok } from "../../_shared"
import { fiscalHistory } from "@/lib/fiscal/core/preparation"
export const dynamic="force-dynamic"
export const runtime="nodejs"
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{return ok(await fiscalHistory(await actor(request),(await params).id,request.nextUrl.searchParams))}catch(error){return errorResponse(error)}}
