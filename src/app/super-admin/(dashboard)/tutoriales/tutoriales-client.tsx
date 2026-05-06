"use client"

import { useMemo, useState, useTransition } from "react"
import { UploadButton } from "@uploadthing/react"
import { Film, FolderTree, Loader2, Pencil, Plus, Save, Star, Trash2, Upload } from "lucide-react"

import type { OurFileRouter } from "@/app/api/uploadthing/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { joinOutcomes, parseOutcomes, slugifyTutorial } from "@/lib/tutorial-types"

import type { TutorialCategoryAdminItem, TutorialVideoAdminItem, TutorialsDashboardData } from "./actions"
import {
  createTutorialCategory,
  createTutorialVideo,
  deleteTutorialCategory,
  deleteTutorialVideo,
  getTutorialsDashboardData,
  setTutorialVideoFeatured,
  setTutorialVideoPublished,
  updateTutorialCategory,
  updateTutorialCategoryOrder,
  updateTutorialVideo,
  updateTutorialVideoOrder,
} from "./actions"

type Props = {
  initialData: TutorialsDashboardData
}

type UploadedVideo = {
  url: string
  key: string
  mimeType?: string
  name?: string
}

type CategoryForm = {
  label: string
  slug: string
  description: string
  displayOrder: number
  isActive: boolean
}

type VideoForm = {
  title: string
  slug: string
  description: string
  categoryId: string
  duration: string
  level: "Basico" | "Intermedio" | "Avanzado"
  outcomesText: string
  isPublished: boolean
  isFeatured: boolean
  displayOrder: number
}

const EMPTY_CATEGORY_FORM: CategoryForm = {
  label: "",
  slug: "",
  description: "",
  displayOrder: 0,
  isActive: true,
}

function emptyVideoForm(categoryId: string): VideoForm {
  return {
    title: "",
    slug: "",
    description: "",
    categoryId,
    duration: "",
    level: "Basico",
    outcomesText: "",
    isPublished: false,
    isFeatured: false,
    displayOrder: 0,
  }
}

function formatVideoDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours} h ${minutes} min`
  }
  if (minutes > 0) {
    return remainingSeconds > 0 ? `${minutes} min ${remainingSeconds} s` : `${minutes} min`
  }
  return `${remainingSeconds} s`
}

function readVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error("timeout"))
    }, 15000)

    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeAttribute("src")
      video.load()
    }

    video.preload = "metadata"
    video.onloadedmetadata = () => {
      const duration = video.duration
      cleanup()
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("invalid-duration"))
        return
      }
      resolve(duration)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error("metadata-error"))
    }

    video.src = url
  })
}

export function TutorialesClient({ initialData }: Props) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const [videoUploadProgress, setVideoUploadProgress] = useState(0)
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null)
  const [categories, setCategories] = useState(initialData.categories)
  const [videos, setVideos] = useState(initialData.videos)
  const [editingCategory, setEditingCategory] = useState<TutorialCategoryAdminItem | null>(null)
  const [editingVideo, setEditingVideo] = useState<TutorialVideoAdminItem | null>(null)
  const [showVideoForm, setShowVideoForm] = useState(false)
  const [uploadedVideo, setUploadedVideo] = useState<UploadedVideo | null>(null)
  const [manualVideoUrl, setManualVideoUrl] = useState("")
  const [manualVideoKey, setManualVideoKey] = useState("")

  const [categoryForm, setCategoryForm] = useState<CategoryForm>({
    ...EMPTY_CATEGORY_FORM,
    displayOrder: (Math.max(0, ...initialData.categories.map((item) => item.displayOrder)) || 0) + 1,
  })
  const [videoForm, setVideoForm] = useState<VideoForm>({
    ...emptyVideoForm(initialData.categories[0]?.id ?? ""),
    displayOrder: (Math.max(0, ...initialData.videos.map((item) => item.displayOrder)) || 0) + 1,
  })

  const orderedCategories = useMemo(
    () => [...categories].sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label)),
    [categories]
  )
  const orderedVideos = useMemo(
    () => [...videos].sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title)),
    [videos]
  )

  const refreshData = () => {
    startTransition(async () => {
      const data = await getTutorialsDashboardData()
      setCategories(data.categories)
      setVideos(data.videos)
    })
  }

  const resetCategoryForm = () => {
    setEditingCategory(null)
    setCategoryForm({
      ...EMPTY_CATEGORY_FORM,
      displayOrder: (Math.max(0, ...categories.map((item) => item.displayOrder)) || 0) + 1,
    })
  }

  const resetVideoForm = () => {
    setEditingVideo(null)
    setUploadedVideo(null)
    setManualVideoUrl("")
    setManualVideoKey("")
    setVideoUploadProgress(0)
    setVideoUploadError(null)
    setShowVideoForm(false)
    setVideoForm({
      ...emptyVideoForm(categories[0]?.id ?? ""),
      displayOrder: (Math.max(0, ...videos.map((item) => item.displayOrder)) || 0) + 1,
    })
  }

  const onCategoryEdit = (category: TutorialCategoryAdminItem) => {
    setEditingCategory(category)
    setCategoryForm({
      label: category.label,
      slug: category.slug,
      description: category.description,
      displayOrder: category.displayOrder,
      isActive: category.isActive,
    })
  }

  const onVideoEdit = (video: TutorialVideoAdminItem) => {
    setEditingVideo(video)
    setShowVideoForm(true)
    if (video.videoFileKey?.trim()) {
      setUploadedVideo({
        url: video.videoUrl,
        key: video.videoFileKey,
        mimeType: "video/mp4",
        name: video.slug,
      })
      setManualVideoUrl("")
      setManualVideoKey("")
    } else {
      setUploadedVideo(null)
      setManualVideoUrl(video.videoUrl)
      setManualVideoKey("")
    }
    setVideoForm({
      title: video.title,
      slug: slugifyTutorial(video.title),
      description: video.description,
      categoryId: video.categoryId,
      duration: video.duration,
      level: video.level as VideoForm["level"],
      outcomesText: joinOutcomes(video.outcomes),
      isPublished: video.isPublished,
      isFeatured: video.isFeatured,
      displayOrder: video.displayOrder,
    })
  }

  const saveCategory = () => {
    const payload = {
      label: categoryForm.label.trim(),
      slug: (categoryForm.slug || slugifyTutorial(categoryForm.label)).trim(),
      description: categoryForm.description.trim(),
      displayOrder: Number(categoryForm.displayOrder || 0),
      isActive: categoryForm.isActive,
    }
    if (!payload.label || !payload.slug || !payload.description) {
      toast({ title: "Completa nombre, slug y descripcion", variant: "destructive" })
      return
    }

    startTransition(async () => {
      const result = editingCategory
        ? await updateTutorialCategory({ id: editingCategory.id, ...payload })
        : await createTutorialCategory(payload)

      if (!result.success) {
        toast({ title: "No se pudo guardar la categoria", description: result.error, variant: "destructive" })
        return
      }
      toast({ title: editingCategory ? "Categoria actualizada" : "Categoria creada" })
      resetCategoryForm()
      refreshData()
    })
  }

  const saveVideo = () => {
    const resolvedVideoUrl = manualVideoUrl.trim() || uploadedVideo?.url || ""
    const resolvedVideoKey = manualVideoKey.trim() || uploadedVideo?.key || ""
    const payload = {
      title: videoForm.title.trim(),
      slug: slugifyTutorial(videoForm.title).trim(),
      description: videoForm.description.trim(),
      categoryId: videoForm.categoryId,
      duration: videoForm.duration.trim(),
      level: videoForm.level,
      outcomes: parseOutcomes(videoForm.outcomesText),
      videoUrl: resolvedVideoUrl,
      videoFileKey: resolvedVideoKey,
      videoMimeType: uploadedVideo?.mimeType,
      isPublished: videoForm.isPublished,
      isFeatured: videoForm.isFeatured,
      displayOrder: Number(videoForm.displayOrder || 0),
    }

    if (!payload.title || !payload.description || !payload.duration) {
      toast({ title: "Completa titulo, descripcion y duracion", variant: "destructive" })
      return
    }
    if (!payload.slug) {
      toast({ title: "El titulo no permite generar un slug valido", variant: "destructive" })
      return
    }
    if (!payload.categoryId) {
      toast({ title: "Selecciona una categoria", variant: "destructive" })
      return
    }
    if (!payload.videoUrl || !payload.videoFileKey) {
      toast({ title: "Debes indicar URL y key del video (o subirlo) antes de guardar", variant: "destructive" })
      return
    }
    if (payload.videoMimeType && payload.videoMimeType !== "video/mp4") {
      toast({ title: "Solo se aceptan videos MP4", variant: "destructive" })
      return
    }
    if (payload.outcomes.length === 0) {
      toast({ title: "Agrega al menos un outcome", variant: "destructive" })
      return
    }

    startTransition(async () => {
      const result = editingVideo
        ? await updateTutorialVideo({ id: editingVideo.id, ...payload })
        : await createTutorialVideo(payload)

      if (!result.success) {
        toast({ title: "No se pudo guardar el video", description: result.error, variant: "destructive" })
        return
      }
      toast({ title: editingVideo ? "Video actualizado" : "Video creado" })
      resetVideoForm()
      refreshData()
    })
  }

  const deleteCategoryItem = (category: TutorialCategoryAdminItem) => {
    if (!confirm(`Eliminar categoria "${category.label}"?`)) return
    startTransition(async () => {
      const result = await deleteTutorialCategory(category.id)
      if (!result.success) {
        toast({ title: "No se pudo eliminar la categoria", description: result.error, variant: "destructive" })
        return
      }
      refreshData()
    })
  }

  const deleteVideoItem = (video: TutorialVideoAdminItem) => {
    if (!confirm(`Eliminar video "${video.title}" y su archivo remoto?`)) return
    startTransition(async () => {
      const result = await deleteTutorialVideo(video.id)
      if (!result.success) {
        toast({ title: "No se pudo eliminar el video", description: result.error, variant: "destructive" })
        return
      }
      refreshData()
    })
  }

  const onUploadComplete = async (res: Array<any>) => {
    const first = res?.[0]
    const url = first?.serverData?.url ?? first?.ufsUrl ?? first?.url
    const key = first?.serverData?.key ?? first?.key
    const mimeType = first?.serverData?.mimeType ?? first?.type
    const name = first?.serverData?.name ?? first?.name

    if (!url || !key) {
      setIsUploadingVideo(false)
      setVideoUploadProgress(0)
      setVideoUploadError("UploadThing no devolvio URL y key.")
      toast({ title: "UploadThing no devolvio URL y key", variant: "destructive" })
      return
    }
    if (mimeType && mimeType !== "video/mp4") {
      setIsUploadingVideo(false)
      setVideoUploadProgress(0)
      setVideoUploadError("Solo se aceptan videos MP4.")
      toast({ title: "Solo se aceptan videos MP4", variant: "destructive" })
      setUploadedVideo(null)
      return
    }

    let detectedDuration: string | null = null
    try {
      const durationInSeconds = await readVideoDuration(url)
      detectedDuration = formatVideoDuration(durationInSeconds)
    } catch {
      detectedDuration = null
    }

    setUploadedVideo({ url, key, mimeType, name })
    setManualVideoUrl("")
    setManualVideoKey("")
    if (detectedDuration) {
      setVideoForm((prev) => ({ ...prev, duration: detectedDuration }))
      toast({
        title: "Video subido correctamente",
        description: `Duracion detectada automaticamente: ${detectedDuration}`,
      })
    } else {
      setUploadedVideo(null)
      setVideoForm((prev) => ({ ...prev, duration: "" }))
      toast({
        title: "No se pudo detectar la duracion",
        description: "Vuelve a subir el video para intentar detectar la duracion automaticamente.",
        variant: "destructive",
      })
    }
    setVideoUploadProgress(100)
    setVideoUploadError(null)
    setIsUploadingVideo(false)
  }

  const clearUploadedVideo = () => {
    setUploadedVideo(null)
    setVideoUploadProgress(0)
    setVideoUploadError(null)
    setVideoForm((prev) => ({ ...prev, duration: "" }))
    toast({ title: "Video removido", description: "Ahora puedes subir el video correcto." })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestion de tutoriales</h1>
        <p className="text-muted-foreground">CRUD de categorias y videos para /como-usar-la-plataforma</p>
      </div>

      <Tabs defaultValue="videos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="videos" className="gap-2"><Film className="h-4 w-4" />Videos</TabsTrigger>
          <TabsTrigger value="categorias" className="gap-2"><FolderTree className="h-4 w-4" />Categorias</TabsTrigger>
        </TabsList>

        <TabsContent value="videos" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {orderedVideos.length} video{orderedVideos.length === 1 ? "" : "s"} subido{orderedVideos.length === 1 ? "" : "s"}
            </p>
            <Button
              onClick={() => {
                setEditingVideo(null)
                setUploadedVideo(null)
                setManualVideoUrl("")
                setManualVideoKey("")
                setVideoForm({
                  ...emptyVideoForm(categories[0]?.id ?? ""),
                  displayOrder: (Math.max(0, ...videos.map((item) => item.displayOrder)) || 0) + 1,
                })
                setShowVideoForm(true)
              }}
              disabled={categories.length === 0}
            >
              <Plus className="h-4 w-4 mr-2" />
              Subir nuevo tutorial
            </Button>
          </div>

          {showVideoForm ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{editingVideo ? "Editar video" : "Nuevo tutorial"}</CardTitle>
                <CardDescription>Subida a UploadThing, solo MP4.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Titulo</Label>
                    <Input
                      value={videoForm.title}
                      onChange={(e) =>
                        setVideoForm((p) => {
                          const nextTitle = e.target.value
                          return { ...p, title: nextTitle, slug: slugifyTutorial(nextTitle) }
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Slug (automatico)</Label>
                    <Input value={videoForm.slug} readOnly disabled />
                  </div>
                </div>
                <div><Label>Descripcion</Label><Textarea rows={3} value={videoForm.description} onChange={(e) => setVideoForm((p) => ({ ...p, description: e.target.value }))} /></div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Categoria</Label>
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={videoForm.categoryId} onChange={(e) => setVideoForm((p) => ({ ...p, categoryId: e.target.value }))}>
                      {orderedCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Duracion (automatica)</Label>
                    <Input
                      value={videoForm.duration}
                      readOnly
                      placeholder="Se completa al subir el video"
                    />
                  </div>
                  <div>
                    <Label>Nivel</Label>
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={videoForm.level} onChange={(e) => setVideoForm((p) => ({ ...p, level: e.target.value as VideoForm["level"] }))}>
                      <option value="Basico">Basico</option>
                      <option value="Intermedio">Intermedio</option>
                      <option value="Avanzado">Avanzado</option>
                    </select>
                  </div>
                </div>
                <div><Label>Outcomes (uno por linea)</Label><Textarea rows={3} value={videoForm.outcomesText} onChange={(e) => setVideoForm((p) => ({ ...p, outcomesText: e.target.value }))} /></div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><Label>Orden</Label><Input type="number" value={videoForm.displayOrder} onChange={(e) => setVideoForm((p) => ({ ...p, displayOrder: Number(e.target.value || 0) }))} /></div>
                  <div className="flex items-center justify-between rounded-md border p-3 mt-6"><Label>Publicado</Label><Switch checked={videoForm.isPublished} onCheckedChange={(checked) => setVideoForm((p) => ({ ...p, isPublished: checked }))} /></div>
                  <div className="flex items-center justify-between rounded-md border p-3 mt-6"><Label>Destacado</Label><Switch checked={videoForm.isFeatured} onCheckedChange={(checked) => setVideoForm((p) => ({ ...p, isFeatured: checked }))} /></div>
                </div>
                <div className="space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>URL del video MP4 (opcional si subes archivo)</Label>
                      <Input
                        placeholder="https://cdn.ejemplo.com/tutorial.mp4"
                        value={manualVideoUrl}
                        onChange={(e) => setManualVideoUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Key del video (obligatoria si usas URL)</Label>
                      <Input
                        placeholder="filekey_o_identificador"
                        value={manualVideoKey}
                        onChange={(e) => setManualVideoKey(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="relative rounded-md border border-dashed p-4">
                    <div className="pointer-events-none flex flex-col items-center justify-center gap-1 text-center">
                      <Upload className="h-6 w-6 text-primary" />
                      <p className="text-sm font-medium">Haz clic para seleccionar video MP4</p>
                      <p className="text-xs text-muted-foreground">Maximo 256MB</p>
                    </div>
                    <UploadButton<OurFileRouter, "tutorialVideoUploader">
                      endpoint="tutorialVideoUploader"
                      onUploadBegin={() => {
                        setIsUploadingVideo(true)
                        setVideoUploadProgress(0)
                        setVideoUploadError(null)
                      }}
                      onUploadProgress={(progress: number) => {
                        setVideoUploadProgress(Math.max(0, Math.min(100, Math.round(progress))))
                      }}
                      onClientUploadComplete={onUploadComplete}
                      onUploadError={(error: Error) => {
                        setIsUploadingVideo(false)
                        setVideoUploadProgress(0)
                        setVideoUploadError(error.message || "Ocurrio un error inesperado al subir el video.")
                        toast({ title: "Error al subir video", description: error.message, variant: "destructive" })
                      }}
                      className="absolute inset-0 z-10"
                      appearance={{
                        container: "h-full w-full",
                        button: "h-full w-full mt-0 bg-transparent text-transparent hover:bg-transparent after:hidden",
                        allowedContent: "hidden",
                      }}
                      content={{
                        button() {
                          return <span className="sr-only">Seleccionar video MP4</span>
                        },
                      }}
                    />
                  </div>
                  {isUploadingVideo ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground inline-flex items-center">
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        Subiendo... {videoUploadProgress}%
                      </p>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-[width] duration-200 ease-out"
                          style={{ width: `${videoUploadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {videoUploadError ? <p className="text-xs text-destructive">{videoUploadError}</p> : null}
                  {uploadedVideo ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Archivo: {uploadedVideo.name || uploadedVideo.key}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={clearUploadedVideo}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Quitar video
                      </Button>
                    </div>
                  ) : null}
                </div>
                {uploadedVideo ? <video className="w-full max-h-80 rounded border bg-black" src={uploadedVideo.url} controls preload="metadata" /> : null}
                <div className="flex gap-2">
                  <Button onClick={saveVideo} disabled={isPending || isUploadingVideo || categories.length === 0}>{isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}{editingVideo ? "Actualizar video" : "Crear video"}</Button>
                  <Button variant="outline" onClick={resetVideoForm}>Cancelar</Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="space-y-3">
            {orderedVideos.map((video) => (
              <Card key={video.id}>
                <CardContent className="pt-6 space-y-3">
                  <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
                    <video className="w-full rounded border bg-black aspect-video" src={video.videoUrl} controls preload="metadata" />
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{video.title}</h3>
                        {video.isPublished ? <Badge>Publicado</Badge> : <Badge variant="secondary">Borrador</Badge>}
                        {video.isFeatured ? <Badge className="bg-amber-500 hover:bg-amber-500">Destacado</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{video.description}</p>
                      <p className="text-xs text-muted-foreground">Slug: {video.slug} | Categoria: {video.categoryLabel} | Duracion: {video.duration} | Nivel: {video.level}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => onVideoEdit(video)}><Pencil className="h-4 w-4 mr-2" />Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => startTransition(async () => { const result = await setTutorialVideoPublished(video.id, !video.isPublished); if (!result.success) { toast({ title: "No se pudo cambiar publicacion", description: result.error, variant: "destructive" }); return }; refreshData() })}>{video.isPublished ? "Pasar a borrador" : "Publicar"}</Button>
                        <Button size="sm" variant="outline" onClick={() => startTransition(async () => { const result = await setTutorialVideoFeatured(video.id, !video.isFeatured); if (!result.success) { toast({ title: "No se pudo cambiar destacado", description: result.error, variant: "destructive" }); return }; refreshData() })}><Star className="h-4 w-4 mr-2" />{video.isFeatured ? "Quitar destacado" : "Destacar"}</Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteVideoItem(video)}><Trash2 className="h-4 w-4 mr-2" />Eliminar</Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input className="w-24" type="number" value={video.displayOrder} onChange={(e) => setVideos((prev) => prev.map((item) => item.id === video.id ? { ...item, displayOrder: Number(e.target.value || 0) } : item))} />
                        <Button size="sm" variant="secondary" onClick={() => startTransition(async () => { const result = await updateTutorialVideoOrder(video.id, video.displayOrder); if (!result.success) { toast({ title: "No se pudo guardar orden", description: result.error, variant: "destructive" }); return }; refreshData() })}>Guardar orden</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {orderedVideos.length === 0 ? <Card><CardContent className="pt-6 text-sm text-muted-foreground">No hay videos registrados.</CardContent></Card> : null}
          </div>
        </TabsContent>

        <TabsContent value="categorias" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{editingCategory ? "Editar categoria" : "Nueva categoria"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Nombre</Label><Input value={categoryForm.label} onChange={(e) => setCategoryForm((p) => ({ ...p, label: e.target.value }))} /></div>
                <div><Label>Slug</Label><Input value={categoryForm.slug} onChange={(e) => setCategoryForm((p) => ({ ...p, slug: e.target.value }))} /></div>
              </div>
              <div><Label>Descripcion</Label><Textarea rows={3} value={categoryForm.description} onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Orden</Label><Input type="number" value={categoryForm.displayOrder} onChange={(e) => setCategoryForm((p) => ({ ...p, displayOrder: Number(e.target.value || 0) }))} /></div>
                <div className="flex items-center justify-between rounded-md border p-3 mt-6"><Label>Activa</Label><Switch checked={categoryForm.isActive} onCheckedChange={(checked) => setCategoryForm((p) => ({ ...p, isActive: checked }))} /></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveCategory} disabled={isPending}>{isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}{editingCategory ? "Actualizar categoria" : "Crear categoria"}</Button>
                {editingCategory ? <Button variant="outline" onClick={resetCategoryForm}>Cancelar edicion</Button> : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            {orderedCategories.map((category) => (
              <Card key={category.id}>
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{category.label}</h3>
                    {category.isActive ? <Badge>Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                  <p className="text-xs text-muted-foreground">Slug: {category.slug} | Videos: {category.videosCount}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onCategoryEdit(category)}><Pencil className="h-4 w-4 mr-2" />Editar</Button>
                    <Button size="sm" variant="outline" onClick={() => startTransition(async () => { const result = await updateTutorialCategory({ id: category.id, label: category.label, slug: category.slug, description: category.description, displayOrder: category.displayOrder, isActive: !category.isActive }); if (!result.success) { toast({ title: "No se pudo actualizar categoria", description: result.error, variant: "destructive" }); return }; refreshData() })}>{category.isActive ? "Desactivar" : "Activar"}</Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteCategoryItem(category)}><Trash2 className="h-4 w-4 mr-2" />Eliminar</Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input className="w-24" type="number" value={category.displayOrder} onChange={(e) => setCategories((prev) => prev.map((item) => item.id === category.id ? { ...item, displayOrder: Number(e.target.value || 0) } : item))} />
                    <Button size="sm" variant="secondary" onClick={() => startTransition(async () => { const result = await updateTutorialCategoryOrder(category.id, category.displayOrder); if (!result.success) { toast({ title: "No se pudo guardar orden", description: result.error, variant: "destructive" }); return }; refreshData() })}>Guardar orden</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {orderedCategories.length === 0 ? <Card><CardContent className="pt-6 text-sm text-muted-foreground">No hay categorias registradas.</CardContent></Card> : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
