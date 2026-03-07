import { NextRequest, NextResponse } from "next/server"

import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { DOMINICAN_BANKS } from "@/lib/dominican-banks"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  return NextResponse.json({
    data: DOMINICAN_BANKS,
  })
}
