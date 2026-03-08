"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowRight,
  Clock3,
  LifeBuoy,
  Mail,
  MessageCircle,
  PlayCircle,
  Youtube,
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
  tutorialCategories,
  tutorialVideos,
  type TutorialCategory,
  type TutorialVideo,
} from "@/components/marketing/tutorial-videos"

type TabValue = "todos" | TutorialCategory

function getYoutubeEmbedUrl(youtubeId: string) {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}`
}

function getYoutubeWatchUrl(youtubeId: string) {
  return `https://www.youtube.com/watch?v=${youtubeId}`
}

function isPublished(video: TutorialVideo) {
  return Boolean(video.youtubeId)
}

function VideoPreview({ video }: { video: TutorialVideo }) {
  if (video.youtubeId) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-[1.5rem] border border-white/10 bg-black shadow-2xl">
        <iframe
          className="h-full w-full"
          src={getYoutubeEmbedUrl(video.youtubeId)}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
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
          <p className="text-lg font-semibold text-foreground">Espacio listo para tu video</p>
          <p className="mx-auto max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
            Cuando subas este tutorial a YouTube y agregues su `youtubeId`, aqui se mostrara el
            reproductor automaticamente.
          </p>
        </div>
      </div>
    </div>
  )
}

function VideoCard({
  video,
  isActive,
  onSelect,
}: {
  video: TutorialVideo
  isActive: boolean
  onSelect: () => void
}) {
  const published = isPublished(video)

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left"
      aria-pressed={isActive}
    >
      <Card
        className={[
          "h-full overflow-hidden border transition-all duration-200 hover:-translate-y-1 hover:shadow-xl",
          isActive
            ? "border-purple-400 shadow-xl ring-2 ring-purple-200"
            : "border-border/80 shadow-sm",
        ].join(" ")}
      >
        <div className="relative aspect-video overflow-hidden border-b bg-slate-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.45),_transparent_50%)]" />
          <div className="relative flex h-full items-center justify-center">
            {published ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-purple-primary shadow-xl">
                <Youtube className="h-8 w-8" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 text-center text-white">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                  <PlayCircle className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium text-white/90">Tutorial listo para publicar</p>
              </div>
            )}
          </div>
        </div>

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
            {published ? "Ver en el reproductor principal" : "Seleccionar vista previa"}
            <ArrowRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </button>
  )
}

export function TutorialVideoHub() {
  const defaultVideo = tutorialVideos.find((video) => video.featured) ?? tutorialVideos[0]
  const [selectedTab, setSelectedTab] = useState<TabValue>("primeros-pasos")
  const [selectedSlug, setSelectedSlug] = useState(defaultVideo.slug)

  const selectedVideo =
    tutorialVideos.find((video) => video.slug === selectedSlug) ?? defaultVideo

  const plannedCount = tutorialVideos.length
  const categoryCount = tutorialCategories.filter((category) => category.value !== "todos").length
  const publishedCount = tutorialVideos.filter(isPublished).length

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
                  Reune en un solo lugar los tutoriales de YouTube para que tus usuarios entiendan
                  rapido cada modulo, desde los primeros pasos hasta la configuracion avanzada.
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
                    <p className="mt-1 text-sm text-white/70">tutoriales planificados</p>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
                  <CardContent className="p-5">
                    <p className="text-3xl font-semibold">{categoryCount}</p>
                    <p className="mt-1 text-sm text-white/70">categorias para encontrar rapido</p>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
                  <CardContent className="p-5">
                    <p className="text-3xl font-semibold">
                      {publishedCount}/{plannedCount}
                    </p>
                    <p className="mt-1 text-sm text-white/70">videos publicados en YouTube</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur md:p-6">
              <VideoPreview video={selectedVideo} />
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
              para actualizar el reproductor principal.
            </p>
          </div>

          <Tabs
            value={selectedTab}
            onValueChange={(value) => setSelectedTab(value as TabValue)}
            className="mt-10"
          >
            <div className="overflow-x-auto pb-2">
              <TabsList className="h-auto min-w-max gap-2 rounded-2xl bg-white p-2 shadow-sm">
                {tutorialCategories.map((category) => (
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

            {tutorialCategories.map((category) => {
              const videos =
                category.value === "todos"
                  ? tutorialVideos
                  : tutorialVideos.filter((video) => video.category === category.value)

              return (
                <TabsContent key={category.value} value={category.value} className="mt-6">
                  <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-purple-700">
                      {category.label}
                    </p>
                    <p className="mt-2 text-base text-muted-foreground">{category.description}</p>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {videos.map((video) => (
                      <div key={video.slug} id={video.slug}>
                        <VideoCard
                          video={video}
                          isActive={video.slug === selectedSlug}
                          onSelect={() => setSelectedSlug(video.slug)}
                        />
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )
            })}
          </Tabs>

        </div>
      </section>

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
