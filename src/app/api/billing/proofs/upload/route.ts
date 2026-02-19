import { NextRequest, NextResponse } from "next/server"
import { UTApi } from "uploadthing/server"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const utapi = new UTApi()

function isAllowedProofMimeType(value: string): boolean {
  if (!value) return false
  if (value === "application/pdf") return true
  return value.startsWith("image/")
}

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
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const contentType = request.headers.get("content-type") || ""
    let file: File | null = null

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

    if (!isAllowedProofMimeType(String(file.type || ""))) {
      return NextResponse.json({ error: "Solo se permiten imágenes o PDF" }, { status: 400 })
    }

    const url = await uploadAndGetUrl(file)
    return NextResponse.json({ url })
  } catch (error: any) {
    console.error("Error en POST /api/billing/proofs/upload:", error)
    return NextResponse.json(
      { error: error?.message || "Error subiendo comprobante" },
      { status: 500 }
    )
  }
}
