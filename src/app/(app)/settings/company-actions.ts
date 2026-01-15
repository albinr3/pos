"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"

export async function updateCompanyInfo(input: {
  name: string
  phone: string
  address: string
  logoUrl?: string | null
}) {
  const name = input.name.trim()
  const phone = input.phone.trim()
  const address = input.address.trim()

  if (!name) throw new Error("El nombre es requerido")
  if (!phone) throw new Error("El teléfono es requerido")
  if (!address) throw new Error("La dirección es requerida")

  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: { 
      name, 
      phone, 
      address,
      ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
    },
    create: {
      id: "company",
      name,
      phone,
      address,
      logoUrl: input.logoUrl || null,
      allowNegativeStock: false,
      itbisRateBp: 1800,
    },
  })

  revalidatePath("/settings")
  // invoices read company settings
  revalidatePath("/invoices")
  revalidatePath("/quotes")
}
