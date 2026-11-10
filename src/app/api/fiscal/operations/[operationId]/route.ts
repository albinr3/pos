import { NextRequest } from "next/server"
import { actor,errorResponse,ok } from "../../documents/_shared"
import { getFiscalOperation } from "@/lib/fiscal/core/preparation"
export const dynamic="force-dynamic"
export const runtime="nodejs"
export async function GET(request:NextRequest,{params}:{params:Promise<{operationId:string}>}){try{return ok(await getFiscalOperation(await actor(request),(await params).operationId))}catch(error){return errorResponse(error)}}
