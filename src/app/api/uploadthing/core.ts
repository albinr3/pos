import { createUploadthing, type FileRouter } from "uploadthing/next"

const f = createUploadthing()

export const ourFileRouter = {
  // Logo de empresa (máx 5MB)
        logoUploader: f({ image: { maxFileSize: "4MB" } })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl ?? file.url }
    }),

  // Imágenes de productos (máx 2MB, hasta 3 archivos)
  productImageUploader: f({ image: { maxFileSize: "2MB", maxFileCount: 3 } })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl ?? file.url }
    }),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter
