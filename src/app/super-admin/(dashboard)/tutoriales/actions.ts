"use server"

import { revalidatePath } from "next/cache"
import { UTApi } from "uploadthing/server"

import { prisma } from "@/lib/db"
import { getCurrentSuperAdmin, logSuperAdminAction } from "@/lib/super-admin-auth"
import { isTutorialLevel, slugifyTutorial } from "@/lib/tutorial-types"

const utapi = new UTApi()

export type TutorialCategoryAdminItem = {
  id: string
  slug: string
  label: string
  description: string
  displayOrder: number
  isActive: boolean
  createdAt: Date
  videosCount: number
}

export type TutorialVideoAdminItem = {
  id: string
  slug: string
  title: string
  description: string
  categoryId: string
  categoryLabel: string
  categorySlug: string
  duration: string
  level: string
  outcomes: string[]
  videoUrl: string
  videoFileKey: string
  isPublished: boolean
  isFeatured: boolean
  displayOrder: number
  createdAt: Date
  updatedAt: Date
}

export type TutorialsDashboardData = {
  categories: TutorialCategoryAdminItem[]
  videos: TutorialVideoAdminItem[]
}

type ActionResult = {
  success: boolean
  error?: string
}

type CreateCategoryInput = {
  label: string
  slug?: string
  description: string
  displayOrder?: number
  isActive?: boolean
}

type UpdateCategoryInput = {
  id: string
  label: string
  slug?: string
  description: string
  displayOrder: number
  isActive: boolean
}

type CreateVideoInput = {
  title: string
  slug?: string
  description: string
  categoryId: string
  duration: string
  level: string
  outcomes: string[]
  videoUrl: string
  videoFileKey: string
  videoMimeType?: string
  isPublished?: boolean
  isFeatured?: boolean
  displayOrder?: number
}

type UpdateVideoInput = {
  id: string
  title: string
  slug?: string
  description: string
  categoryId: string
  duration: string
  level: string
  outcomes: string[]
  videoUrl: string
  videoFileKey: string
  videoMimeType?: string
  isPublished: boolean
  isFeatured: boolean
  displayOrder: number
}

async function requireSuperAdmin() {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    throw new Error("No autorizado")
  }
  return admin
}

function normalizeSlug(input: string | undefined, fallback: string) {
  const source = (input || "").trim() || fallback.trim()
  return slugifyTutorial(source)
}

function normalizeOutcomes(outcomes: string[]): string[] {
  return outcomes.map((item) => item.trim()).filter(Boolean)
}

function looksLikeMp4(videoUrl: string, mimeType?: string) {
  const normalizedMime = (mimeType || "").trim().toLowerCase()
  if (normalizedMime && normalizedMime !== "video/mp4") {
    return false
  }

  try {
    const pathname = new URL(videoUrl).pathname.toLowerCase()
    if (pathname.endsWith(".mp4")) {
      return true
    }
  } catch {
    // ignore parsing errors and fallback to mimeType
  }

  return normalizedMime === "video/mp4"
}

function parseOrder(value: number | undefined, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.trunc(n))
}

async function deleteUploadThingFileIfNeeded(fileKey?: string | null) {
  const key = (fileKey || "").trim()
  if (!key) return

  try {
    await utapi.deleteFiles(key)
  } catch (error) {
    console.error("No se pudo eliminar archivo en UploadThing:", error)
  }
}

function revalidateTutorialPaths() {
  revalidatePath("/super-admin/tutoriales")
  revalidatePath("/como-usar-la-plataforma")
}

export async function getTutorialsDashboardData(): Promise<TutorialsDashboardData> {
  await requireSuperAdmin()

  const [categories, videos] = await Promise.all([
    prisma.tutorialCategory.findMany({
      include: {
        _count: {
          select: { videos: true },
        },
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.tutorialVideo.findMany({
      include: { category: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
  ])

  return {
    categories: categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      label: category.label,
      description: category.description,
      displayOrder: category.displayOrder,
      isActive: category.isActive,
      createdAt: category.createdAt,
      videosCount: category._count.videos,
    })),
    videos: videos.map((video) => ({
      id: video.id,
      slug: video.slug,
      title: video.title,
      description: video.description,
      categoryId: video.categoryId,
      categoryLabel: video.category.label,
      categorySlug: video.category.slug,
      duration: video.duration,
      level: video.level,
      outcomes: video.outcomes,
      videoUrl: video.videoUrl,
      videoFileKey: video.videoFileKey,
      isPublished: video.isPublished,
      isFeatured: video.isFeatured,
      displayOrder: video.displayOrder,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    })),
  }
}

export async function createTutorialCategory(input: CreateCategoryInput): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin()

    const label = input.label.trim()
    const description = input.description.trim()
    const slug = normalizeSlug(input.slug, label)

    if (!label) return { success: false, error: "El nombre de la categoria es obligatorio" }
    if (!description) return { success: false, error: "La descripcion es obligatoria" }
    if (!slug) return { success: false, error: "El slug de la categoria es obligatorio" }

    const existing = await prisma.tutorialCategory.findUnique({ where: { slug } })
    if (existing) {
      return { success: false, error: "Ya existe una categoria con ese slug" }
    }

    let displayOrder = parseOrder(input.displayOrder)
    if (typeof input.displayOrder !== "number") {
      const last = await prisma.tutorialCategory.findFirst({
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
      })
      displayOrder = (last?.displayOrder || 0) + 1
    }

    const category = await prisma.tutorialCategory.create({
      data: {
        slug,
        label,
        description,
        displayOrder,
        isActive: input.isActive ?? true,
      },
    })

    await logSuperAdminAction(admin.id, "created_tutorial_category", {
      metadata: { categoryId: category.id, slug: category.slug, label: category.label },
    })

    revalidateTutorialPaths()
    return { success: true }
  } catch (error) {
    console.error("Error al crear categoria de tutorial:", error)
    return { success: false, error: "No se pudo crear la categoria" }
  }
}

export async function updateTutorialCategory(input: UpdateCategoryInput): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin()

    const label = input.label.trim()
    const description = input.description.trim()
    const slug = normalizeSlug(input.slug, label)

    if (!label) return { success: false, error: "El nombre de la categoria es obligatorio" }
    if (!description) return { success: false, error: "La descripcion es obligatoria" }
    if (!slug) return { success: false, error: "El slug de la categoria es obligatorio" }

    const existing = await prisma.tutorialCategory.findUnique({ where: { id: input.id } })
    if (!existing) return { success: false, error: "Categoria no encontrada" }

    const duplicate = await prisma.tutorialCategory.findFirst({
      where: { slug, id: { not: input.id } },
      select: { id: true },
    })
    if (duplicate) {
      return { success: false, error: "Ya existe una categoria con ese slug" }
    }

    await prisma.tutorialCategory.update({
      where: { id: input.id },
      data: {
        slug,
        label,
        description,
        displayOrder: parseOrder(input.displayOrder),
        isActive: input.isActive,
      },
    })

    await logSuperAdminAction(admin.id, "updated_tutorial_category", {
      metadata: { categoryId: input.id, slug, label },
    })

    revalidateTutorialPaths()
    return { success: true }
  } catch (error) {
    console.error("Error al actualizar categoria de tutorial:", error)
    return { success: false, error: "No se pudo actualizar la categoria" }
  }
}

export async function deleteTutorialCategory(id: string): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin()

    const category = await prisma.tutorialCategory.findUnique({
      where: { id },
      include: { _count: { select: { videos: true } } },
    })

    if (!category) return { success: false, error: "Categoria no encontrada" }

    if (category._count.videos > 0) {
      return {
        success: false,
        error: "No se puede eliminar la categoria porque tiene videos asociados",
      }
    }

    await prisma.tutorialCategory.delete({ where: { id } })

    await logSuperAdminAction(admin.id, "deleted_tutorial_category", {
      metadata: { categoryId: id, slug: category.slug, label: category.label },
    })

    revalidateTutorialPaths()
    return { success: true }
  } catch (error) {
    console.error("Error al eliminar categoria de tutorial:", error)
    return { success: false, error: "No se pudo eliminar la categoria" }
  }
}

export async function updateTutorialCategoryOrder(id: string, displayOrder: number): Promise<ActionResult> {
  try {
    await requireSuperAdmin()

    await prisma.tutorialCategory.update({
      where: { id },
      data: { displayOrder: parseOrder(displayOrder) },
    })

    revalidateTutorialPaths()
    return { success: true }
  } catch (error) {
    console.error("Error al actualizar orden de categoria:", error)
    return { success: false, error: "No se pudo actualizar el orden" }
  }
}

export async function createTutorialVideo(input: CreateVideoInput): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin()

    const title = input.title.trim()
    const description = input.description.trim()
    const duration = input.duration.trim()
    const slug = slugifyTutorial(title)
    const outcomes = normalizeOutcomes(input.outcomes)
    const videoUrl = input.videoUrl.trim()
    const videoFileKey = input.videoFileKey.trim()

    if (!title) return { success: false, error: "El titulo es obligatorio" }
    if (!slug) return { success: false, error: "No se pudo generar un slug valido desde el titulo" }
    if (!description) return { success: false, error: "La descripcion es obligatoria" }
    if (!duration) return { success: false, error: "La duracion es obligatoria" }
    if (!isTutorialLevel(input.level)) return { success: false, error: "El nivel no es valido" }
    if (outcomes.length === 0) return { success: false, error: "Agrega al menos un outcome" }
    if (!videoUrl) return { success: false, error: "Debes subir un video o colocar una URL" }
    if (!videoFileKey) return { success: false, error: "Debes indicar la key del video" }

    if (!looksLikeMp4(videoUrl, input.videoMimeType)) {
      return { success: false, error: "Solo se permiten videos MP4" }
    }

    const [category, duplicateSlug] = await Promise.all([
      prisma.tutorialCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } }),
      prisma.tutorialVideo.findUnique({ where: { slug }, select: { id: true } }),
    ])

    if (!category) return { success: false, error: "La categoria seleccionada no existe" }
    if (duplicateSlug) return { success: false, error: "Ya existe un video con ese slug" }

    let displayOrder = parseOrder(input.displayOrder)
    if (typeof input.displayOrder !== "number") {
      const last = await prisma.tutorialVideo.findFirst({
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
      })
      displayOrder = (last?.displayOrder || 0) + 1
    }

    await prisma.$transaction(async (tx) => {
      if (input.isFeatured) {
        await tx.tutorialVideo.updateMany({ data: { isFeatured: false } })
      }

      await tx.tutorialVideo.create({
        data: {
          slug,
          title,
          description,
          categoryId: input.categoryId,
          duration,
          level: input.level,
          outcomes,
          videoUrl,
          videoFileKey,
          isPublished: input.isPublished ?? false,
          isFeatured: input.isFeatured ?? false,
          displayOrder,
        },
      })
    })

    await logSuperAdminAction(admin.id, "created_tutorial_video", {
      metadata: { slug, title, categoryId: input.categoryId },
    })

    revalidateTutorialPaths()
    return { success: true }
  } catch (error) {
    console.error("Error al crear video de tutorial:", error)
    return { success: false, error: "No se pudo crear el video" }
  }
}

export async function updateTutorialVideo(input: UpdateVideoInput): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin()

    const existing = await prisma.tutorialVideo.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        slug: true,
        videoFileKey: true,
        videoUrl: true,
      },
    })

    if (!existing) return { success: false, error: "Video no encontrado" }

    const title = input.title.trim()
    const description = input.description.trim()
    const duration = input.duration.trim()
    const slug = slugifyTutorial(title)
    const outcomes = normalizeOutcomes(input.outcomes)
    const videoUrl = input.videoUrl.trim()
    const videoFileKey = input.videoFileKey.trim()

    if (!title) return { success: false, error: "El titulo es obligatorio" }
    if (!slug) return { success: false, error: "No se pudo generar un slug valido desde el titulo" }
    if (!description) return { success: false, error: "La descripcion es obligatoria" }
    if (!duration) return { success: false, error: "La duracion es obligatoria" }
    if (!isTutorialLevel(input.level)) return { success: false, error: "El nivel no es valido" }
    if (outcomes.length === 0) return { success: false, error: "Agrega al menos un outcome" }
    if (!videoUrl) return { success: false, error: "Debes subir un video o colocar una URL" }
    if (!videoFileKey) return { success: false, error: "Debes indicar la key del video" }

    if (!looksLikeMp4(videoUrl, input.videoMimeType)) {
      return { success: false, error: "Solo se permiten videos MP4" }
    }

    const [category, duplicateSlug] = await Promise.all([
      prisma.tutorialCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } }),
      prisma.tutorialVideo.findFirst({
        where: { slug, id: { not: input.id } },
        select: { id: true },
      }),
    ])

    if (!category) return { success: false, error: "La categoria seleccionada no existe" }
    if (duplicateSlug) return { success: false, error: "Ya existe un video con ese slug" }

    const previousFileKey = existing.videoFileKey
    const fileWasReplaced = previousFileKey !== videoFileKey

    await prisma.$transaction(async (tx) => {
      if (input.isFeatured) {
        await tx.tutorialVideo.updateMany({
          where: { id: { not: input.id } },
          data: { isFeatured: false },
        })
      }

      await tx.tutorialVideo.update({
        where: { id: input.id },
        data: {
          slug,
          title,
          description,
          categoryId: input.categoryId,
          duration,
          level: input.level,
          outcomes,
          videoUrl,
          videoFileKey,
          isPublished: input.isPublished,
          isFeatured: input.isFeatured,
          displayOrder: parseOrder(input.displayOrder),
        },
      })
    })

    if (fileWasReplaced) {
      await deleteUploadThingFileIfNeeded(previousFileKey)
    }

    await logSuperAdminAction(admin.id, "updated_tutorial_video", {
      metadata: { videoId: input.id, slug, title, isPublished: input.isPublished },
    })

    revalidateTutorialPaths()
    return { success: true }
  } catch (error) {
    console.error("Error al actualizar video de tutorial:", error)
    return { success: false, error: "No se pudo actualizar el video" }
  }
}

export async function deleteTutorialVideo(id: string): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin()

    const existing = await prisma.tutorialVideo.findUnique({
      where: { id },
      select: { id: true, title: true, slug: true, videoFileKey: true },
    })

    if (!existing) return { success: false, error: "Video no encontrado" }

    await prisma.tutorialVideo.delete({ where: { id } })

    await deleteUploadThingFileIfNeeded(existing.videoFileKey)

    await logSuperAdminAction(admin.id, "deleted_tutorial_video", {
      metadata: { videoId: id, slug: existing.slug, title: existing.title },
    })

    revalidateTutorialPaths()
    return { success: true }
  } catch (error) {
    console.error("Error al eliminar video de tutorial:", error)
    return { success: false, error: "No se pudo eliminar el video" }
  }
}

export async function updateTutorialVideoOrder(id: string, displayOrder: number): Promise<ActionResult> {
  try {
    await requireSuperAdmin()

    await prisma.tutorialVideo.update({
      where: { id },
      data: { displayOrder: parseOrder(displayOrder) },
    })

    revalidateTutorialPaths()
    return { success: true }
  } catch (error) {
    console.error("Error al actualizar orden de video:", error)
    return { success: false, error: "No se pudo actualizar el orden" }
  }
}

export async function setTutorialVideoPublished(id: string, isPublished: boolean): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin()

    const existing = await prisma.tutorialVideo.findUnique({
      where: { id },
      select: { id: true, videoUrl: true },
    })

    if (!existing) return { success: false, error: "Video no encontrado" }

    if (isPublished && !existing.videoUrl) {
      return { success: false, error: "No puedes publicar un video sin archivo" }
    }

    if (isPublished && !looksLikeMp4(existing.videoUrl)) {
      return { success: false, error: "Solo puedes publicar videos MP4" }
    }

    await prisma.tutorialVideo.update({
      where: { id },
      data: { isPublished },
    })

    await logSuperAdminAction(admin.id, isPublished ? "published_tutorial_video" : "unpublished_tutorial_video", {
      metadata: { videoId: id, isPublished },
    })

    revalidateTutorialPaths()
    return { success: true }
  } catch (error) {
    console.error("Error al cambiar estado de publicacion del video:", error)
    return { success: false, error: "No se pudo cambiar el estado de publicacion" }
  }
}

export async function setTutorialVideoFeatured(id: string, isFeatured: boolean): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin()

    const existing = await prisma.tutorialVideo.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!existing) return { success: false, error: "Video no encontrado" }

    await prisma.$transaction(async (tx) => {
      if (isFeatured) {
        await tx.tutorialVideo.updateMany({ data: { isFeatured: false } })
      }

      await tx.tutorialVideo.update({
        where: { id },
        data: { isFeatured },
      })
    })

    await logSuperAdminAction(admin.id, isFeatured ? "featured_tutorial_video" : "unfeatured_tutorial_video", {
      metadata: { videoId: id, isFeatured },
    })

    revalidateTutorialPaths()
    return { success: true }
  } catch (error) {
    console.error("Error al cambiar video destacado:", error)
    return { success: false, error: "No se pudo cambiar el estado destacado" }
  }
}
