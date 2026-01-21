import { NextResponse } from "next/server"
import { clearSubUserSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
  await clearSubUserSession()
  return NextResponse.json({ success: true })
}
