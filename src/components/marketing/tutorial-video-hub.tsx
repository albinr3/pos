"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowRight,
  BookOpenCheck,
  Clock3,
  LifeBuoy,
  MessageCircle,
  PlayCircle,
  Sparkles,
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  tutorialCategories,
  tutorialFaqs,
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
  const [selectedTab, setSelectedTab] = useState<TabValue>("todos")
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
                  <Link href="#tutorial-destacado">Ver tutorial destacado</Link>
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

      <section id="tutorial-destacado" className="bg-white py-14 sm:py-20">
        <div className="container">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                  Tutorial destacado
                </Badge>
                <Badge variant="outline">{selectedVideo.categoryLabel}</Badge>
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  {selectedVideo.duration}
                </span>
              </div>

              <div className="space-y-3">
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {selectedVideo.title}
                </h2>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {selectedVideo.description}
                </p>
              </div>
            </div>

            <Card className="border-purple-100 bg-gradient-to-br from-purple-50 via-white to-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <BookOpenCheck className="h-5 w-5 text-purple-700" />
                  Lo que aprendera el usuario
                </CardTitle>
                <CardDescription>
                  Cada tutorial esta pensado para resolver una tarea concreta dentro de MOVOPos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedVideo.outcomes.map((outcome) => (
                  <div key={outcome} className="flex items-start gap-3">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-purple-600" />
                    <p className="text-sm leading-6 text-muted-foreground">{outcome}</p>
                  </div>
                ))}

                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  {selectedVideo.youtubeId ? (
                    <Button asChild>
                      <Link
                        href={getYoutubeWatchUrl(selectedVideo.youtubeId)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir en YouTube
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link href="#biblioteca">Ver biblioteca completa</Link>
                    </Button>
                  )}
                  <Button asChild variant="outline">
                    <Link href="/contact">Solicitar ayuda personalizada</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
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

          <div className="mt-10 rounded-[2rem] border bg-white p-6 shadow-sm sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div className="space-y-3">
                <Badge variant="outline" className="border-purple-200 text-purple-700">
                  Pensado para excelente UX
                </Badge>
                <h3 className="text-2xl font-bold text-foreground sm:text-3xl">
                  Un solo reproductor principal para evitar una pagina lenta y saturada
                </h3>
              </div>
              <p className="text-base leading-7 text-muted-foreground">
                En lugar de cargar 10 iframes pesados al mismo tiempo, la experiencia prioriza un
                video principal y usa tarjetas como playlist visual. Asi la pagina se siente mas
                rapida, mas clara y mucho mas agradable en desktop y movil.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-14 sm:py-20">
        <div className="container">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <Card className="border-0 bg-[linear-gradient(135deg,_rgba(30,27,75,1)_0%,_rgba(88,28,135,1)_100%)] text-white shadow-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <LifeBuoy className="h-6 w-6" />
                  Si un tutorial no resuelve tu duda
                </CardTitle>
                <CardDescription className="text-white/75">
                  Complementa la biblioteca con canales de soporte directos para no perder
                  conversiones ni tiempo operativo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-sm text-white/75">Escalada rapida</p>
                  <p className="mt-1 text-lg font-semibold">Contacta al equipo de soporte</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="bg-white text-[#6B46C1] hover:bg-white/90">
                    <Link href="/contact">Ir a contacto</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  >
                    <a href="mailto:soporte@movopos.com">
                      <MessageCircle className="h-4 w-4" />
                      Escribir por email
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="space-y-3">
                <Badge className="w-fit bg-purple-100 text-purple-800 hover:bg-purple-100">
                  Preguntas frecuentes
                </Badge>
                <CardTitle className="text-3xl font-bold tracking-tight">
                  Todo queda listo para que escales tu centro de ayuda en video
                </CardTitle>
                <CardDescription className="text-base leading-7">
                  Esta primera version deja la base visual, la estructura de soporte y el flujo de
                  reproduccion preparados para cuando empieces a publicar tus videos en YouTube.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {tutorialFaqs.map((faq) => (
                    <AccordionItem key={faq.question} value={faq.question}>
                      <AccordionTrigger className="text-left text-base">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm leading-7 text-muted-foreground">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-14 sm:py-20">
        <div className="container">
          <Card className="overflow-hidden border-0 bg-gradient-to-r from-violet-950 via-purple-900 to-fuchsia-700 text-white shadow-2xl">
            <CardContent className="grid gap-8 p-8 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="space-y-4">
                <Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Base lista para crecer
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Convierte esta pagina en tu centro de soporte visual para clientes
                </h2>
                <p className="max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
                  Solo faltara conectar los IDs reales de YouTube para que cada tutorial se publique
                  sin rehacer el diseño, la navegacion ni la experiencia general.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button asChild size="lg" className="bg-white text-[#6B46C1] hover:bg-white/90">
                  <Link href="#biblioteca">Explorar tutoriales</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/pricing">Ver la plataforma</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  )
}
