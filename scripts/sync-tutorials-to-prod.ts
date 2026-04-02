import { PrismaClient } from "@prisma/client"
import { config as loadEnv } from "dotenv"

loadEnv()

const sourceUrl = process.env.DATABASE_URL?.trim()
const targetUrl = process.env.DATABASE_URL_PROD?.trim()

if (!sourceUrl) {
  throw new Error("Falta DATABASE_URL (origen/local) en variables de entorno.")
}

if (!targetUrl) {
  throw new Error("Falta DATABASE_URL_PROD (destino/produccion) en variables de entorno.")
}

if (sourceUrl === targetUrl) {
  throw new Error("DATABASE_URL y DATABASE_URL_PROD son iguales. Abortando para evitar sobrescribir.")
}

const sourcePrisma = new PrismaClient({
  datasources: {
    db: {
      url: sourceUrl,
    },
  },
})

const targetPrisma = new PrismaClient({
  datasources: {
    db: {
      url: targetUrl,
    },
  },
})

type CategorySnapshot = {
  slug: string
  label: string
  description: string
  displayOrder: number
  isActive: boolean
}

type VideoSnapshot = {
  slug: string
  title: string
  description: string
  categorySlug: string
  duration: string
  level: string
  outcomes: string[]
  videoUrl: string
  videoFileKey: string
  isPublished: boolean
  isFeatured: boolean
  displayOrder: number
}

async function loadSourceData() {
  const [categories, videos] = await Promise.all([
    sourcePrisma.tutorialCategory.findMany({
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: {
        slug: true,
        label: true,
        description: true,
        displayOrder: true,
        isActive: true,
      },
    }),
    sourcePrisma.tutorialVideo.findMany({
      include: {
        category: {
          select: {
            slug: true,
          },
        },
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
  ])

  const categorySnapshots: CategorySnapshot[] = categories.map((item) => ({
    slug: item.slug,
    label: item.label,
    description: item.description,
    displayOrder: item.displayOrder,
    isActive: item.isActive,
  }))

  const videoSnapshots: VideoSnapshot[] = videos.map((item) => ({
    slug: item.slug,
    title: item.title,
    description: item.description,
    categorySlug: item.category.slug,
    duration: item.duration,
    level: item.level,
    outcomes: item.outcomes,
    videoUrl: item.videoUrl,
    videoFileKey: item.videoFileKey,
    isPublished: item.isPublished,
    isFeatured: item.isFeatured,
    displayOrder: item.displayOrder,
  }))

  return {
    categories: categorySnapshots,
    videos: videoSnapshots,
  }
}

async function syncCategories(categories: CategorySnapshot[]) {
  let created = 0
  let updated = 0

  for (const category of categories) {
    const existing = await targetPrisma.tutorialCategory.findUnique({
      where: { slug: category.slug },
      select: { id: true },
    })

    await targetPrisma.tutorialCategory.upsert({
      where: { slug: category.slug },
      create: {
        slug: category.slug,
        label: category.label,
        description: category.description,
        displayOrder: category.displayOrder,
        isActive: category.isActive,
      },
      update: {
        label: category.label,
        description: category.description,
        displayOrder: category.displayOrder,
        isActive: category.isActive,
      },
    })

    if (existing) {
      updated++
    } else {
      created++
    }
  }

  return { created, updated }
}

async function syncVideos(videos: VideoSnapshot[]) {
  let created = 0
  let updated = 0
  let skipped = 0

  const targetCategories = await targetPrisma.tutorialCategory.findMany({
    select: { id: true, slug: true },
  })

  const categoryIdBySlug = new Map(targetCategories.map((item) => [item.slug, item.id]))

  for (const video of videos) {
    const targetCategoryId = categoryIdBySlug.get(video.categorySlug)
    if (!targetCategoryId) {
      skipped++
      console.warn(
        `⚠️  Video omitido por categoria faltante en destino: ${video.slug} (categoria: ${video.categorySlug})`
      )
      continue
    }

    const existing = await targetPrisma.tutorialVideo.findUnique({
      where: { slug: video.slug },
      select: { id: true },
    })

    await targetPrisma.tutorialVideo.upsert({
      where: { slug: video.slug },
      create: {
        slug: video.slug,
        title: video.title,
        description: video.description,
        categoryId: targetCategoryId,
        duration: video.duration,
        level: video.level,
        outcomes: video.outcomes,
        videoUrl: video.videoUrl,
        videoFileKey: video.videoFileKey,
        isPublished: video.isPublished,
        isFeatured: video.isFeatured,
        displayOrder: video.displayOrder,
      },
      update: {
        title: video.title,
        description: video.description,
        categoryId: targetCategoryId,
        duration: video.duration,
        level: video.level,
        outcomes: video.outcomes,
        videoUrl: video.videoUrl,
        videoFileKey: video.videoFileKey,
        isPublished: video.isPublished,
        isFeatured: video.isFeatured,
        displayOrder: video.displayOrder,
      },
    })

    if (existing) {
      updated++
    } else {
      created++
    }
  }

  return { created, updated, skipped }
}

async function main() {
  console.log("Sincronizando tutoriales a produccion...")
  console.log("Origen: DATABASE_URL")
  console.log("Destino: DATABASE_URL_PROD")

  const { categories, videos } = await loadSourceData()
  console.log(`Categorias encontradas en origen: ${categories.length}`)
  console.log(`Videos encontrados en origen: ${videos.length}`)

  const categoryResult = await syncCategories(categories)
  const videoResult = await syncVideos(videos)

  console.log("")
  console.log("✅ Sincronizacion completada")
  console.log(
    `Categorias -> creadas: ${categoryResult.created}, actualizadas: ${categoryResult.updated}`
  )
  console.log(
    `Videos -> creados: ${videoResult.created}, actualizados: ${videoResult.updated}, omitidos: ${videoResult.skipped}`
  )
  console.log("")
  console.log("Nota: este script no elimina registros existentes en produccion que no esten en local.")
}

main()
  .catch((error) => {
    console.error("Error en sincronizacion de tutoriales:", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await Promise.all([sourcePrisma.$disconnect(), targetPrisma.$disconnect()])
  })

