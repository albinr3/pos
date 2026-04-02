import { createUploadthing, type FileRouter } from "uploadthing/next"
import { UploadThingError } from "uploadthing/server"
import { logError, ErrorCodes } from "@/lib/error-logger"

const f = createUploadthing()

export const ourFileRouter = {
  // Logo de empresa (máx 5MB)
  logoUploader: f({ image: { maxFileSize: "4MB" } })
    .onUploadError(async ({ error }) => {
      await logError(new Error(error.message), {
        code: ErrorCodes.EXTERNAL_UPLOAD_ERROR,
        severity: "LOW",
        endpoint: "/api/uploadthing/logoUploader",
        metadata: { uploaderType: "logo" },
      })
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl ?? file.url }
    }),

  // Imágenes de productos (máx 2MB, hasta 3 archivos)
  productImageUploader: f({ image: { maxFileSize: "2MB", maxFileCount: 3 } })
    .onUploadError(async ({ error }) => {
      await logError(new Error(error.message), {
        code: ErrorCodes.EXTERNAL_UPLOAD_ERROR,
        severity: "LOW",
        endpoint: "/api/uploadthing/productImageUploader",
        metadata: { uploaderType: "productImage" },
      })
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl ?? file.url }
    }),

  // Comprobantes de pago para billing (máx 4MB, imagen o PDF)
  paymentProofUploader: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
    pdf: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .onUploadError(async ({ error }) => {
      await logError(new Error(error.message), {
        code: ErrorCodes.EXTERNAL_UPLOAD_ERROR,
        severity: "MEDIUM",
        endpoint: "/api/uploadthing/paymentProofUploader",
        metadata: { uploaderType: "paymentProof" },
      })
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl ?? file.url }
    }),

  // Videos de tutoriales para marketing/super-admin (solo MP4, max 256MB)
  tutorialVideoUploader: f({ video: { maxFileSize: "256MB", maxFileCount: 1 } })
    .middleware(({ files }) => {
      const file = files[0]
      if (!file || file.type !== "video/mp4") {
        throw new UploadThingError("Solo se permiten videos MP4")
      }
      return {}
    })
    .onUploadError(async ({ error }) => {
      await logError(new Error(error.message), {
        code: ErrorCodes.EXTERNAL_UPLOAD_ERROR,
        severity: "MEDIUM",
        endpoint: "/api/uploadthing/tutorialVideoUploader",
        metadata: { uploaderType: "tutorialVideo" },
      })
    })
    .onUploadComplete(async ({ file }) => {
      return {
        url: file.ufsUrl ?? file.url,
        key: file.key,
        mimeType: file.type,
        name: file.name,
      }
    }),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter
