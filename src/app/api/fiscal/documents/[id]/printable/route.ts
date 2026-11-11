import { NextRequest } from "next/server"
import { actor, errorResponse, ok } from "../../_shared"
import { getFiscalPrintable, printableText } from "@/lib/fiscal/core/printable"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest, context: { params: Promise<{id:string}> }) {
  try { const doc = await getFiscalPrintable(await actor(request), (await context.params).id); return ok({ ...doc, text: printableText(doc) }) } catch (error) { return errorResponse(error) }
}
