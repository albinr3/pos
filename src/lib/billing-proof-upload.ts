export const MAX_PAYMENT_PROOF_SIZE_BYTES = 4 * 1024 * 1024

export type UploadedPaymentProof = { url: string; name: string; type: string }

export function getPaymentProofValidationError(file: Pick<File, "size" | "type">): string | null {
  if (file.size === 0) return "El archivo está vacío. Selecciona otra imagen o PDF."
  if (file.size > MAX_PAYMENT_PROOF_SIZE_BYTES) return "El comprobante supera el máximo permitido de 4 MB."
  if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
    return "Solo se permiten imágenes o PDF."
  }
  return null
}

export async function recoverPaymentProofUpload(
  file: File | null,
  error: { code?: string; message: string },
): Promise<UploadedPaymentProof> {
  // UPLOAD_FAILED ocurre después de iniciar la transferencia. Los errores de
  // validación del router no deben reintentarse por una ruta con otras reglas.
  if (!file || error.code !== "UPLOAD_FAILED") throw new Error(error.message)
  const validationError = getPaymentProofValidationError(file)
  if (validationError) throw new Error(validationError)

  // Si el PUT directo falla (p. ej. "XHR failed 400"), usar otra vía de envío.
  // Reenviar el File original por nuestro servidor evita depender de ese PUT
  // y permite mostrar el error real de la API sin URLs firmadas ni credenciales.
  const body = new FormData()
  body.append("file", file)
  let response: Response
  try {
    response = await fetch("/api/billing/proofs/upload", { method: "POST", body })
  } catch {
    throw new Error("No se pudo conectar para subir el comprobante. Revisa tu conexión e inténtalo de nuevo.")
  }
  const result = await response.json().catch(() => null)
  if (!response.ok || typeof result?.url !== "string" || !result.url) {
    throw new Error(
      typeof result?.error === "string" ? result.error : "No se pudo subir el comprobante. Inténtalo de nuevo.",
    )
  }
  return { url: result.url, name: file.name, type: file.type }
}
