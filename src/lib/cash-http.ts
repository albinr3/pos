import { NextResponse } from "next/server"
import { CashControlError } from "@/lib/cash-context"
export function cashErrorResponse(error: unknown) {
  return error instanceof CashControlError ? NextResponse.json({ error: error.message, code: error.code }, { status: error.status }) : null
}
