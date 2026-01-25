import { createUploadthing, type FileRouter } from "uploadthing/next"
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
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter
