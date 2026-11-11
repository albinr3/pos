import { NextRequest } from "next/server"
import { purchaseAPI } from "@/lib/purchase-http"
import { createExpenseSettlement, listExpenseSettlements, type SettlementInput } from "@/lib/fiscal/core/employee-expenses"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
type Context = { params: Promise<{ id: string }> }
export async function GET(request: NextRequest, context: Context) { return purchaseAPI(request, async actor => listExpenseSettlements(actor, (await context.params).id)) }
export async function POST(request: NextRequest, context: Context) { return purchaseAPI(request, async actor => createExpenseSettlement(actor, (await context.params).id, await request.json() as SettlementInput)) }
