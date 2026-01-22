import { NextResponse } from "next/server"
import { clearSubUserSession, getCurrentUser } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit-log"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
  const user = await getCurrentUser()
  await clearSubUserSession()
  if (user) {
    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      action: "LOGOUT",
      resourceType: "User",
      resourceId: user.id,
    })
  }
  return NextResponse.json({ success: true })
}
