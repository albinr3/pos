"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"

export async function getSettings() {
  const s = await prisma.companySettings.findUnique({ where: { id: "company" } })
  return {
    name: s?.name ?? "Tejada Auto Adornos",
    phone: s?.phone ?? "829-475-1454",
    address: s?.address ?? "Carretera la Rosa, Moca",
    logoUrl: s?.logoUrl ?? null,
    allowNegativeStock: s?.allowNegativeStock ?? false,
  }
}

export async function updateAllowNegativeStock(allow: boolean) {
  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: { allowNegativeStock: allow },
    create: {
      id: "company",
      name: "Tejada Auto Adornos",
      phone: "829-475-1454",
      address: "Carretera la Rosa, Moca",
      allowNegativeStock: allow,
      itbisRateBp: 1800,
    },
  })

  revalidatePath("/settings")
  revalidatePath("/sales")
}
