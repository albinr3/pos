"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  ArrowRight,
  Clock3,
  LifeBuoy,
  Mail,
  MessageCircle,
  PlayCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PublicTutorialCategory, PublicTutorialVideo } from "@/lib/tutorial-types"

type TabValue = "todos" | string

type TutorialVideoHubProps = {
  categories: PublicTutorialCategory[]
  videos: PublicTutorialVideo[]
}

function isPublished(video: PublicTutorialVideo) {
  return Boolean(video.videoUrl)
}

function HeroThumbnail({ video }: { video: PublicTutorialVideo | null }) {
  if (video?.videoUrl) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-[1.5rem] border border-white/10 bg-black shadow-2xl">
        <video
          className="h-full w-full object-cover"
          src={video.videoUrl}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-purple-primary shadow-xl">
            <PlayCircle className="h-8 w-8" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-[1.5rem] border border-purple-200/70 bg-white shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.18),_transparent_55%),linear-gradient(135deg,_rgba(99,102,241,0.08),_rgba(168,85,247,0.18))]" />
      <div className="relative flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-purple text-white shadow-lg">
          <PlayCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-foreground">Sin videos publicados por ahora</p>
          <p className="mx-auto max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
            Pronto veras aqui los tutoriales disponibles para aprender a usar MOVOPos.
          </p>
        </div>
      </div>
    </div>
  )
}

function VideoCard({
  video,
  isActive,
  onOpenModal,
}: {
  video: PublicTutorialVideo
  isActive: boolean
  onOpenModal: () => void
}) {
  const published = isPublished(video)

  return (
    <Card
      className={[
        "h-full overflow-hidden border transition-all duration-200 hover:-translate-y-1 hover:shadow-xl",
        isActive
          ? "border-purple-400 shadow-xl ring-2 ring-purple-200"
          : "border-border/80 shadow-sm",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onOpenModal}
        className="group w-full text-left"
        aria-label={`Abrir video ${video.title}`}
      >
        <div className="relative aspect-video overflow-hidden border-b bg-slate-950">
          {video.videoUrl ? (
            <video
              className="h-full w-full object-cover"
              src={video.videoUrl}
              muted
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
          ) : (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.45),_transparent_50%)]" />
            </>
          )}
          <div className="pointer-events-none absolute inset-0 bg-black/20" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-purple-primary shadow-xl transition-transform duration-200 group-hover:scale-105">
              <PlayCircle className="h-8 w-8" />
            </div>
          </div>
        </div>
      </button>

      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="bg-purple-50 text-purple-700 hover:bg-purple-50">
            {video.categoryLabel}
          </Badge>
          <Badge variant="outline">{video.level}</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            {video.duration}
          </span>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-xl leading-snug">{video.title}</CardTitle>
          <CardDescription className="text-sm leading-6">{video.description}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-2">
          {video.outcomes.slice(0, 2).map((outcome) => (
            <div key={outcome} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-1 h-2 w-2 rounded-full bg-purple-500" />
              <span>{outcome}</span>
            </div>
          ))}
        </div>

        <div className="inline-flex items-center gap-2 text-sm font-semibold text-purple-700">
          {published ? "Haz clic para abrir y reproducir" : "Seleccionar vista previa"}
          <ArrowRight className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  )
}

function VideoPlayerModal({
  video,
  open,
  onOpenChange,
  onNext,
  hasNext,
  nextTitle,
}: {
  video: PublicTutorialVideo | null
  open: boolean
  onOpenChange: (next: boolean) => void
  onNext: () => void
  hasNext: boolean
  nextTitle: string | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[92vw] lg:w-[88vw] lg:max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{video?.title ?? "Reproductor de tutorial"}</DialogTitle>
        </DialogHeader>
        {video?.videoUrl ? (
          <div className="space-y-4">
            <div className="aspect-video rounded-lg overflow-hidden border bg-black">
              <video
                key={video.slug}
                className="h-full w-full"
                src={video.videoUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onEnded={() => {
                  if (hasNext) onNext()
                }}
              />
            </div>
            <div className="rounded-lg border bg-background/70 p-4 sm:p-5">
              <div className="flex justify-end">
                <Button type="button" onClick={onNext} disabled={!hasNext}>
                  Siguiente tutorial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
              {nextTitle ? (
                <p className="mt-2 text-right text-xs text-muted-foreground">
                  Siguiente: {nextTitle}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Este tutorial no tiene video disponible.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function TutorialVideoHub({ categories, videos }: TutorialVideoHubProps) {
  const categoriesWithAll = useMemo(
    () => [
      {
        value: "todos",
        label: "Todos",
        description: "Recorre toda la biblioteca y elige el siguiente paso.",
      },
      ...categories,
    ],
    [categories]
  )

  const defaultVideo = useMemo(
    () => videos.find((video) => video.featured) ?? videos[0] ?? null,
    [videos]
  )
  const defaultTab = categories[0]?.value ?? "todos"

  const [selectedTab, setSelectedTab] = useState<TabValue>(defaultTab)
  const [selectedSlug, setSelectedSlug] = useState(defaultVideo?.slug ?? "")
  const [modalVideo, setModalVideo] = useState<PublicTutorialVideo | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const currentModalIndex = useMemo(() => {
    if (!modalVideo) return -1
    return videos.findIndex((video) => video.slug === modalVideo.slug)
  }, [modalVideo, videos])

  const hasNextModalVideo = videos.length > 1 && currentModalIndex >= 0
  const nextModalVideo = hasNextModalVideo
    ? videos[(currentModalIndex + 1) % videos.length] ?? null
    : null

  const goToNextModalVideo = () => {
    if (!nextModalVideo) return
    setSelectedSlug(nextModalVideo.slug)
    setModalVideo(nextModalVideo)
  }

  const plannedCount = videos.length
  const categoryCount = categories.length
  const publishedCount = videos.filter(isPublished).length

  return (
    <>
      <section className="relative overflow-hidden bg-[linear-gradient(135deg,_#120033_0%,_#35107A_55%,_#6B46C1_100%)] pb-20 pt-10 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.15),_transparent_35%)]" />
        <div className="container relative">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-8">
              <Badge className="border-white/20 bg-white/10 px-4 py-1.5 text-white backdrop-blur">
                Centro de tutoriales MOVOPos
              </Badge>

              <div className="space-y-5">
                <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                  Aprende a usar la plataforma con videos claros, cortos y accionables
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-white/80 sm:text-xl">
                  Reune en un solo lugar los tutoriales alojados en UploadThing para que tus
                  usuarios entiendan rapido cada modulo, desde los primeros pasos hasta la
                  configuracion avanzada.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-[#6B46C1] hover:bg-white/90"
                >
                  <Link href="#biblioteca">Ver biblioteca de tutoriales</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/contact">Hablar con soporte</Link>
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
                  <CardContent className="p-5">
                    <p className="text-3xl font-semibold">{plannedCount}</p>
                    <p className="mt-1 text-sm text-white/70">tutoriales publicados</p>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
                  <CardContent className="p-5">
                    <p className="text-3xl font-semibold">{categoryCount}</p>
                    <p className="mt-1 text-sm text-white/70">categorias activas</p>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
                  <CardContent className="p-5">
                    <p className="text-3xl font-semibold">
                      {publishedCount}/{plannedCount}
                    </p>
                    <p className="mt-1 text-sm text-white/70">videos listos para ver</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur md:p-6">
              <HeroThumbnail video={defaultVideo} />
            </div>
          </div>
        </div>
      </section>

      <section id="biblioteca" className="bg-slate-50 py-14 sm:py-20">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="bg-white text-purple-700 shadow-sm">Biblioteca visual</Badge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
              Encuentra el siguiente tutorial segun la tarea que necesitas resolver
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Usa las categorias para ir directo al modulo correcto y selecciona cualquier tarjeta
              para abrir el video en una ventana de reproduccion.
            </p>
          </div>

          <Tabs
            value={selectedTab}
            onValueChange={(value) => setSelectedTab(value as TabValue)}
            className="mt-10"
          >
            <div className="overflow-x-auto pb-2">
              <TabsList className="h-auto min-w-max gap-2 rounded-2xl bg-white p-2 shadow-sm">
                {categoriesWithAll.map((category) => (
                  <TabsTrigger
                    key={category.value}
                    value={category.value}
                    className="rounded-xl px-4 py-2.5 text-sm"
                  >
                    {category.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {categoriesWithAll.map((category) => {
              const tabVideos =
                category.value === "todos"
                  ? videos
                  : videos.filter((video) => video.category === category.value)

              return (
                <TabsContent key={category.value} value={category.value} className="mt-6">
                  <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-purple-700">
                      {category.label}
                    </p>
                    <p className="mt-2 text-base text-muted-foreground">{category.description}</p>
                  </div>

                  {tabVideos.length === 0 ? (
                    <Card>
                      <CardContent className="pt-6 text-center text-muted-foreground">
                        Todavia no hay videos en esta categoria.
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                      {tabVideos.map((video) => (
                        <div key={video.slug} id={video.slug}>
                          <VideoCard
                            video={video}
                            isActive={video.slug === selectedSlug}
                            onOpenModal={() => {
                              setSelectedSlug(video.slug)
                              setModalVideo(video)
                              setModalOpen(true)
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              )
            })}
          </Tabs>
        </div>
      </section>

      <VideoPlayerModal
        video={modalVideo}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onNext={goToNextModalVideo}
        hasNext={hasNextModalVideo}
        nextTitle={nextModalVideo?.title ?? null}
      />

      <section className="bg-slate-50 py-14 sm:py-20">
        <div className="container">
          <Card className="overflow-hidden border-0 bg-gradient-to-r from-violet-950 via-purple-900 to-fuchsia-700 text-white shadow-2xl">
            <CardContent className="grid gap-8 p-8 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="space-y-4">
                <Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">
                  <LifeBuoy className="mr-1 h-3.5 w-3.5" />
                  Soporte disponible
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Si no encontraste como realizar algo o tienes un problema, contactanos
                </h2>
                <p className="max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
                  Nuestro equipo puede ayudarte cuando un tutorial no sea suficiente, tengas una
                  duda puntual o necesites resolver un problema dentro de la plataforma.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button asChild size="lg" className="bg-white text-[#6B46C1] hover:bg-white/90">
                  <Link href="/contact">
                    <MessageCircle className="h-4 w-4" />
                    Ir a contacto
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="mailto:soporte@movopos.com">
                    <Mail className="h-4 w-4" />
                    Escribir por email
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  )
}
