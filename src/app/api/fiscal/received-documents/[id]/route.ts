import { NextRequest } from "next/server"
import { actor, body, errorResponse, ok } from "../../documents/_shared"
import { getReceivedDocument, saveReceivedDocument } from "@/lib/fiscal/core/received-documents"
import { FiscalDocumentError } from "@/lib/fiscal/core/document"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
type Context={params:Promise<{id:string}>}
export async function GET(request:NextRequest,context:Context) { try { return ok(await getReceivedDocument(await actor(request),(await context.params).id)) } catch(error) { return errorResponse(error) } }
export async function PUT(request:NextRequest,context:Context) { try { const user=await actor(request), existing=await getReceivedDocument(user,(await context.params).id), input=await body(request); if(input?.sourceKind!==existing.sourceKind || input?.sourceId!==existing.sourceId) throw new FiscalDocumentError("DOCUMENT_CONFLICT","El origen no se puede cambiar",409); return ok(await saveReceivedDocument(user,input)) } catch(error) { return errorResponse(error) } }
