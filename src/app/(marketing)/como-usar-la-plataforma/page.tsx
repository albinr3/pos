import type { Metadata } from "next"

import { TutorialVideoHub } from "@/components/marketing/tutorial-video-hub"
import { getPublishedTutorialLibrary } from "@/lib/tutorial-library"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Como usar la plataforma | Tutoriales MOVOPos",
  description:
    "Aprende a usar MOVOPos con tutoriales en video sobre ventas, inventario, compras y configuracion. Todo en una sola pagina clara y facil de navegar.",
  alternates: {
    canonical: "/como-usar-la-plataforma",
  },
  openGraph: {
    title: "Como usar la plataforma | Tutoriales MOVOPos",
    description:
      "Biblioteca visual para aprender a usar MOVOPos con tutoriales paso a paso y soporte guiado.",
    url: "/como-usar-la-plataforma",
  },
  twitter: {
    title: "Como usar la plataforma | Tutoriales MOVOPos",
    description:
      "Tutoriales en video para dominar MOVOPos: ventas, inventario, compras y configuracion.",
  },
}

export default async function HowToUsePlatformPage() {
  const { categories, videos } = await getPublishedTutorialLibrary()
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Como usar la plataforma | Tutoriales MOVOPos",
      url: "https://movopos.com/como-usar-la-plataforma",
      description:
        "Centro de tutoriales y soporte visual para aprender a usar MOVOPos paso a paso.",
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: videos.map((video, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: video.title,
        description: video.description,
        url: `https://movopos.com/como-usar-la-plataforma#${video.slug}`,
      })),
    },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TutorialVideoHub categories={categories} videos={videos} />
    </>
  )
}
