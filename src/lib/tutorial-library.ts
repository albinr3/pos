import { prisma } from "@/lib/db"
import type { PublicTutorialCategory, PublicTutorialVideo, TutorialLevel } from "@/lib/tutorial-types"

export async function getPublishedTutorialLibrary(): Promise<{
  categories: PublicTutorialCategory[]
  videos: PublicTutorialVideo[]
}> {
  const videos = await prisma.tutorialVideo.findMany({
      where: {
        isPublished: true,
        category: { isActive: true },
      },
      include: { category: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    })

  const primerosSlug = "primeros-pasos"
  const advancedCategory = {
    value: "avanzados",
    label: "Avanzados",
    description: "Profundiza en ventas, inventario, compras y configuracion.",
  }

  const mappedVideos: PublicTutorialVideo[] = videos.map((video) => {
    const isPrimerosPasos = video.level === "Basico"
    const isAvanzado = video.level === "Avanzado"

    return {
      slug: video.slug,
      title: video.title,
      description: video.description,
      category: isPrimerosPasos
        ? primerosSlug
        : isAvanzado
          ? advancedCategory.value
          : "todos",
      categoryLabel: isPrimerosPasos
        ? "Primeros pasos"
        : isAvanzado
          ? advancedCategory.label
          : "Todos",
      duration: video.duration,
      level: video.level as TutorialLevel,
      videoUrl: video.videoUrl,
      featured: video.isFeatured,
      outcomes: video.outcomes,
    }
  })

  const hasPrimerosPasos = mappedVideos.some((video) => video.category === primerosSlug)
  const hasAvanzados = mappedVideos.some((video) => video.category === advancedCategory.value)

  const mappedCategories: PublicTutorialCategory[] = [
    ...(hasPrimerosPasos
      ? [
          {
            value: primerosSlug,
            label: "Primeros pasos",
            description: "Configura tu cuenta y deja la plataforma lista para operar.",
          },
        ]
      : []),
    ...(hasAvanzados ? [advancedCategory] : []),
  ]

  return {
    categories: mappedCategories,
    videos: mappedVideos,
  }
}
