/* eslint-disable @next/next/no-img-element */
import { prisma } from "@/lib/db"

export async function HeaderLogo() {
  const company = await prisma.companySettings.findUnique({ where: { id: "company" } })
  const logoUrl = company?.logoUrl || "/movoLogo.png"

  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 overflow-hidden rounded-md border bg-white">
        <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
      </div>
      <div className="hidden text-sm font-semibold md:block">{company?.name || "Tejada Auto Adornos"}</div>
    </div>
  )
}








