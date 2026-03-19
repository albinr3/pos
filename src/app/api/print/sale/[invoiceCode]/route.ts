import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceCode: string }> }
) {
  const { invoiceCode } = await params
  const user = await getCurrentUser()
  
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const settings = await prisma.companySettings.findFirst({
    where: { accountId: user.accountId }
  })
  
  const format = settings?.salePrintFormat || "80mm"
  const targetPath = format === "CARTA" 
    ? `/invoices/${invoiceCode}` 
    : `/receipts/sale/${invoiceCode}`
    
  const searchParams = request.nextUrl.searchParams
  const redirectUrl = new URL(targetPath, request.url)
  
  // Forward all query params (like autoprint=1)
  for (const [key, value] of Array.from(searchParams.entries())) {
    redirectUrl.searchParams.set(key, value)
  }
  
  return NextResponse.redirect(redirectUrl)
}
