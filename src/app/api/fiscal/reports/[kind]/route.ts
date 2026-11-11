import { NextRequest } from "next/server"
import { actor, errorResponse, ok } from "../../documents/_shared"
import { fiscalReport, reportColumns, reportCsvRow } from "@/lib/fiscal/core/reports"
import { FiscalDocumentError } from "@/lib/fiscal/core/document"
export const dynamic="force-dynamic"
export const runtime="nodejs"
export async function GET(request:NextRequest,context:{params:Promise<{kind:string}>}) {
  try {
    const user=await actor(request), {kind}=await context.params
    if(kind!=="documents"&&kind!=="reconciliation")throw new FiscalDocumentError("NOT_FOUND","Informe no encontrado",404)
    const params=new URLSearchParams(request.nextUrl.searchParams), format=params.get("format")??"json"
    if(!["json","csv"].includes(format))throw new FiscalDocumentError("INVALID_INPUT","Formato inválido",400)
    if(format==="json")return ok(await fiscalReport(user,kind,params))
    params.delete("format");params.delete("cursor");params.set("take","200")
    let page=await fiscalReport(user,kind,params), first=true, finished=false
    const encoder=new TextEncoder()
    const stream=new ReadableStream<Uint8Array>({async pull(controller) {
      if(finished){controller.close();return}
      try {
        let out=first?"\ufeff"+reportCsvRow([page.notice])+reportCsvRow([...reportColumns]):"";first=false
        out+=page.data.map(row=>reportCsvRow(reportColumns.map(column=>row[column]))).join("")
        controller.enqueue(encoder.encode(out))
        if(!page.nextCursor){finished=true;return}
        params.set("cursor",page.nextCursor);page=await fiscalReport(user,kind,params)
      } catch(error) {controller.error(error)}
    }})
    return new Response(stream,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="informe-fiscal-${kind}.csv"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
  } catch(error){return errorResponse(error)}
}
