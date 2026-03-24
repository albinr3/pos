import "dotenv/config"
import fs from "node:fs/promises"
import path from "node:path"
import { UTApi, UTFile } from "uploadthing/server"

function getMimeType(fileName: string): string {
  const lower = fileName.toLowerCase()
  // UploadThing puede bloquear MIME específicos como APK.
  // Para binarios instalables usamos blob genérico.
  if (lower.endsWith(".apk")) return "application/octet-stream"
  return "application/octet-stream"
}

async function main() {
  const inputPath = process.argv[2]
  const requestedRemoteName = process.argv[3]
  const uploadThingToken = process.env.UPLOADTHING_TOKEN ?? process.env.UPLOADTHING_SECRET

  if (!inputPath) {
    throw new Error(
      "Debes indicar la ruta del archivo. Ejemplo: npm run upload:apk -- C:\\ruta\\app-release.apk [nombre-remoto.bin]"
    )
  }

  if (!uploadThingToken) {
    throw new Error("Falta UPLOADTHING_TOKEN (o UPLOADTHING_SECRET) en variables de entorno.")
  }
  process.env.UPLOADTHING_TOKEN = uploadThingToken

  const absolutePath = path.resolve(inputPath)
  const originalFileName = path.basename(absolutePath)
  const isApk = originalFileName.toLowerCase().endsWith(".apk")
  const fileName =
    requestedRemoteName?.trim() ||
    (isApk ? originalFileName.replace(/\.apk$/i, ".bin") : originalFileName)
  const mimeType = getMimeType(fileName)

  const [buffer, stat] = await Promise.all([
    fs.readFile(absolutePath),
    fs.stat(absolutePath),
  ])

  const file = new UTFile([buffer], fileName, {
    type: mimeType,
    lastModified: Math.floor(stat.mtimeMs),
  })

  const utapi = new UTApi()
  const result = await utapi.uploadFiles(file, {
    contentDisposition: "attachment",
  })

  if (result.error || !result.data) {
    throw new Error(result.error?.message || "UploadThing no devolvió data para el archivo.")
  }

  const url = result.data.ufsUrl || result.data.url
  if (!url) {
    throw new Error("UploadThing no devolvió URL pública.")
  }

  console.log("Archivo subido correctamente.")
  console.log(`Archivo local: ${originalFileName}`)
  console.log(`Nombre: ${result.data.name}`)
  console.log(`Tamaño: ${result.data.size} bytes`)
  console.log(`Clave: ${result.data.key}`)
  console.log(`URL: ${url}`)
  if (isApk && !requestedRemoteName) {
    console.log("Nota: se subió como .bin para evitar bloqueo por tipo de archivo.")
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Error desconocido"
  console.error(`Error al subir APK: ${message}`)
  process.exit(1)
})
