import { NextRequest } from "next/server"
import { actor, errorResponse } from "../../_shared"
import { getFiscalPrintable, printableText } from "@/lib/fiscal/core/printable"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest, context: { params: Promise<{id:string}> }) {
  try {
    const doc = await getFiscalPrintable(await actor(request), (await context.params).id)
    const { default: jsPDF } = await import("jspdf")
    const pdf = new jsPDF(), pageHeight = pdf.internal.pageSize.getHeight()
    pdf.setFontSize(10)
    let y = 14
    for (const line of printableText(doc)) {
      for (const part of pdf.splitTextToSize(line, 180) as string[]) {
        if (y > pageHeight - 15) { pdf.addPage(); y = 14 }
        pdf.text(part, 14, y); y += 5
      }
    }
    return new Response(new Uint8Array(pdf.output("arraybuffer")), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="documento-prueba-${doc.number.replace(/[^a-zA-Z0-9_-]/g, "")}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch (error) { return errorResponse(error) }
}
