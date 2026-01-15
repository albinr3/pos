"use server"

import { prisma } from "@/lib/db"

export async function getSalesConfig() {
  const settings = await prisma.companySettings.findUnique({ where: { id: "company" } })
  return {
    allowNegativeStock: settings?.allowNegativeStock ?? false,
  }
}
