"use server"
import { getCurrentUser } from "@/lib/auth"
import { previewFiscalDocument } from "@/lib/fiscal/core/preview"
import { FiscalDocumentError } from "@/lib/fiscal/core/document"

export async function previewFiscalDocumentAction(input: unknown) {
  const actor = await getCurrentUser()
  if (!actor) throw new FiscalDocumentError("UNAUTHENTICATED", "No autenticado", 401)
  return previewFiscalDocument(actor, input)
}
