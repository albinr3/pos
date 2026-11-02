import { NextRequest, NextResponse } from "next/server"
import { UTApi } from "uploadthing/server"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"
import { getPaymentProofValidationError } from "@/lib/billing-proof-upload"
import { logError, ErrorCodes } from "@/lib/error-logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const utapi = new UTApi()

async function uploadAndGetUrl(file: File): Promise<string> {
  const uploaded = await utapi.uploadFiles(file)
  const data = Array.isArray(uploaded) ? uploaded[0]?.data : uploaded?.data
  const error = Array.isArray(uploaded) ? uploaded[0]?.error : uploaded?.error

  if (error || !data) {
    throw new Error(error?.message || "No se pudo subir el comprobante")
  }

  const url = data.ufsUrl || data.url
  if (!url) {
    throw new Error("La subida no devolvió URL")
  }

  return url
}

// POST /api/billing/proofs/upload - Subir comprobante y retornar URL pública
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getCurrentUserFromRequest>> = null
  let file: File | null = null
  try {
    user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const contentType = request.headers.get("content-type") || ""

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const raw = formData.get("file")
      if (raw instanceof File) file = raw
    } else if (contentType.includes("application/json")) {
      const body = await request.json()
      const rawBase64 = String(body?.base64 || body?.fileBase64 || "").trim()
      if (!rawBase64) {
        return NextResponse.json({ error: "Base64 requerido" }, { status: 400 })
      }

      const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, "")
      const fileName = String(body?.fileName || `proof-${Date.now()}.jpg`)
      const mimeType = String(body?.mimeType || "image/jpeg")
      const bytes = Buffer.from(cleanBase64, "base64")
      file = new File([bytes], fileName, { type: mimeType })
    } else {
      try {
        const formData = await request.formData()
        const raw = formData.get("file")
        if (raw instanceof File) file = raw
      } catch {
        // no-op
      }
    }

    if (!file) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 })
    }

    // UTApi no pasa por paymentProofUploader: conservar aquí el mismo límite
    // de 4 MB para que la vía de respaldo no omita las reglas del router.
    const validationError = getPaymentProofValidationError(file)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const url = await uploadAndGetUrl(file)
    return NextResponse.json({ url })
  } catch (error: unknown) {
    const errorId = await logError(error instanceof Error ? error : new Error(String(error)), {
      code: ErrorCodes.EXTERNAL_UPLOAD_ERROR,
      severity: "MEDIUM",
      userId: user?.id,
      accountId: user?.accountId,
      endpoint: "/api/billing/proofs/upload",
      method: "POST",
      // Registrar solo metadatos; nunca guardar la imagen, base64 o URL firmada.
      metadata: { uploaderType: "paymentProof", fileSize: file?.size, fileType: file?.type },
    })
    return NextResponse.json(
      {
        error: `No se pudo subir el comprobante. Inténtalo de nuevo.${errorId ? ` Referencia: ${errorId}` : ""}`,
      },
      { status: 502 }
    )
  }
}
