import { prisma } from "@/lib/db"
import type { PublicTutorialCategory, PublicTutorialVideo, TutorialLevel } from "@/lib/tutorial-types"

export async function getPublishedTutorialLibrary(): Promise<{
  categories: PublicTutorialCategory[]
  videos: PublicTutorialVideo[]
}> {
  const [categories, videos] = await Promise.all([
    prisma.tutorialCategory.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.tutorialVideo.findMany({
      where: {
        isPublished: true,
        category: { isActive: true },
      },
      include: { category: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
  ])

  return {
    categories: categories.map((category) => ({
      value: category.slug,
      label: category.label,
      description: category.description,
    })),
    videos: videos.map((video) => ({
      slug: video.slug,
      title: video.title,
      description: video.description,
      category: video.category.slug,
      categoryLabel: video.category.label,
      duration: video.duration,
      level: video.level as TutorialLevel,
      videoUrl: video.videoUrl,
      featured: video.isFeatured,
      outcomes: video.outcomes,
    })),
  }
}
