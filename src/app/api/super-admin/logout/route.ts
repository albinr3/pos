import { NextResponse } from "next/server"
import { clearSuperAdminSession } from "@/lib/super-admin-auth"

export async function POST() {
  await clearSuperAdminSession()
  return NextResponse.json({ success: true })
}
