"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function dismissInventoryUploadOffer() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  // Nunca aceptar el accountId del navegador: el cierre solo afecta a la cuenta autenticada.
  await prisma.account.update({
    where: { id: user.accountId },
    data: { inventoryUploadOfferDismissed: true },
  })

  revalidatePath("/products")
  revalidatePath("/onboarding/completado")
  revalidatePath("/como-usar-la-plataforma")
}
