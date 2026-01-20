import { NextResponse } from "next/server"
import { clearSubUserSession } from "@/lib/auth"

export async function POST() {
  await clearSubUserSession()
  return NextResponse.json({ success: true })
}
