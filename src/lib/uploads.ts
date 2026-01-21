import { existsSync } from "fs"
import { mkdir, writeFile } from "fs/promises"
import { join } from "path"

const UPLOADS_ROOT = join(process.cwd(), "public", "uploads")

export const LOGOS_SUBDIR = "logos"
export const PRODUCTS_SUBDIR = "products"

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]/g, "_")
}

export function buildFilename(prefix: string, originalName: string, options?: { random?: boolean }) {
  const sanitized = sanitizeFilename(originalName)
  const extension = sanitized.split(".").pop() || "png"
  const timestamp = Date.now()
  const random = options?.random ? `_${Math.random().toString(36).slice(2, 9)}` : ""
  return `${prefix}_${timestamp}${random}.${extension}`
}

export function buildPublicUrl(subdir: string, filename: string) {
  return `/uploads/${subdir}/${filename}`
}

export async function ensureUploadSubdir(subdir: string) {
  const dir = join(UPLOADS_ROOT, subdir)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  return dir
}

export async function saveUploadFile(subdir: string, filename: string, buffer: Buffer) {
  const dir = await ensureUploadSubdir(subdir)
  const filepath = join(dir, filename)
  await writeFile(filepath, buffer)
  return filepath
}
