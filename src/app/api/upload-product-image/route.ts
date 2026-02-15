import { NextRequest, NextResponse } from "next/server"
import { UTApi } from "uploadthing/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const utapi = new UTApi()

// POST /api/upload-product-image - Subir una imagen de producto y retornar URL pública
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 })
    }

    if (!file.type?.startsWith("image/")) {
      return NextResponse.json({ error: "Solo se permiten imágenes" }, { status: 400 })
    }

    const uploaded = await utapi.uploadFiles(file)
    const data = Array.isArray(uploaded) ? uploaded[0]?.data : uploaded?.data
    const error = Array.isArray(uploaded) ? uploaded[0]?.error : uploaded?.error

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "No se pudo subir la imagen" }, { status: 500 })
    }

    const url = data.ufsUrl || data.url
    if (!url) {
      return NextResponse.json({ error: "La subida no devolvió URL" }, { status: 500 })
    }

    return NextResponse.json({ url })
  } catch (error: any) {
    console.error("Error en POST /api/upload-product-image:", error)
    return NextResponse.json(
      { error: error?.message || "Error subiendo imagen" },
      { status: 500 }
    )
  }
}
