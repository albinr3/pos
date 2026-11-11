import { NextRequest } from "next/server"
import { actor, body, errorResponse, ok } from "@/app/api/fiscal/documents/_shared"
import { cashRequest, cashDeviceHashFromRequest } from "@/lib/cash-context"
import { cashErrorResponse } from "@/lib/cash-http"
import { confirmDebitAdjustment } from "@/lib/fiscal/core/debit-drafts"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await actor(request), data = await body(request), id = (await context.params).id
    return ok(await cashRequest.run({ trustedActor: user, deviceHash: cashDeviceHashFromRequest(request) }, () => confirmDebitAdjustment(user, id, data)))
  } catch (error) { return cashErrorResponse(error) ?? errorResponse(error) }
}
