import { NextRequest, NextResponse } from "next/server"
import { buildFilename, buildPublicUrl, LOGOS_SUBDIR, saveUploadFile } from "@/lib/uploads"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 })
    }

    // Validar que sea una imagen
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "El archivo debe ser una imagen" }, { status: 400 })
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo es demasiado grande (máximo 5MB)" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Generar nombre único
    const filename = buildFilename("logo", file.name)
    await saveUploadFile(LOGOS_SUBDIR, filename, buffer)

    // Retornar la URL relativa
    const url = buildPublicUrl(LOGOS_SUBDIR, filename)
    return NextResponse.json({ url })
  } catch (error) {
    console.error("Error al subir logo:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al subir el archivo" },
      { status: 500 }
    )
  }
}










