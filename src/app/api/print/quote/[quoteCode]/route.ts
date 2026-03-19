import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ quoteCode: string }> }
) {
  const { quoteCode } = await params
  const user = await getCurrentUser()
  
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const settings = await prisma.companySettings.findFirst({
    where: { accountId: user.accountId }
  })
  
  const format = settings?.quotePrintFormat || "80mm"
  const targetPath = format === "CARTA" 
    ? `/quotes/${quoteCode}` 
    : `/receipts/quote/${quoteCode}`
    
  const searchParams = request.nextUrl.searchParams
  const redirectUrl = new URL(targetPath, request.url)
  
  for (const [key, value] of Array.from(searchParams.entries())) {
    redirectUrl.searchParams.set(key, value)
  }
  
  return NextResponse.redirect(redirectUrl)
}
