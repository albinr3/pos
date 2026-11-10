"use server"

import { getCurrentUser } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { listConcepts, writeConcept, removeConcept } from "@/lib/fiscal/core/concepts"

async function actor() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  return user
}
export async function listFiscalConcepts() {
  return (await listConcepts(await actor())).items
}
export async function saveFiscalConcept(input: { id?: string; name: string; kind: string; fiscalUnit?: string | null; fiscalTaxTreatment?: string | null }) {
  const { id, ...data } = input
  await writeConcept(await actor(), data, id)
  revalidatePath("/products")
}
export async function deactivateFiscalConcept(id: string) {
  await removeConcept(await actor(), id)
  revalidatePath("/products")
}
