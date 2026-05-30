import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  BookOpenText,
  CalendarClock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { blogCategories, blogPosts } from "@/lib/blog"

const siteUrl = "https://movopos.com"
const blogPath = "/blog"
const blogUrl = `${siteUrl}${blogPath}`
const blogSeoTitle = "Blog sobre POS, Facturación e Inventario en RD"
const blogSeoDescription =
  "Blog de MOVOPos sobre sistema POS, facturación, inventario, ventas y administración para negocios en República Dominicana."
const blogSocialImage = {
  url: "/hero-img.svg",
  width: 1200,
  height: 630,
  alt: "Blog de MOVOPos sobre sistema POS, facturación e inventario",
}

export const metadata: Metadata = {
  title: blogSeoTitle,
  description: blogSeoDescription,
  keywords: [
    "blog sistema pos",
    "blog facturación",
    "blog inventario",
    "sistema pos república dominicana",
    "software de ventas",
    "control de inventario",
    "punto de venta",
    "movopos blog",
  ],
  alternates: {
    canonical: blogPath,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    title: "Blog de MOVOPos | POS, Facturación e Inventario en RD",
    description: blogSeoDescription,
    url: blogPath,
    images: [blogSocialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog de MOVOPos | POS, Facturación e Inventario en RD",
    description: blogSeoDescription,
    images: [blogSocialImage],
  },
}

const collectionPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Blog de MOVOPos",
  url: blogUrl,
  description: blogSeoDescription,
  isPartOf: {
    "@type": "WebSite",
    name: "MOVOPos",
    url: siteUrl,
  },
  about: blogCategories.map((category) => ({
    "@type": "Thing",
    name: category.name,
    description: category.description,
  })),
}

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Inicio",
      item: `${siteUrl}/`,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Blog",
      item: blogUrl,
    },
  ],
}

export default function BlogPage() {
  const hasPublishedPosts = blogPosts.length > 0

  return (
    <>
      {/* SEO: no emitir BlogPosting hasta tener posts reales; evita datos estructurados engañosos. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <section className="bg-white py-16 sm:py-24">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center rounded-lg bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800">
              <BookOpenText className="mr-2 h-4 w-4" />
              Blog de MOVOPos
            </div>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
              Blog sobre POS, facturación e inventario para negocios en República Dominicana
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">
              {hasPublishedPosts
                ? "Guías prácticas para vender mejor, controlar inventario, organizar facturación y administrar negocios con MOVOPos."
                : "Aquí reuniremos guías prácticas para vender mejor, controlar inventario, organizar facturación y administrar negocios con MOVOPos. La sección ya está lista, pero aún no hay artículos publicados."}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="font-semibold">
                <Link href="/app">
                  Probar MOVOPos gratis
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="font-semibold">
                <Link href="/como-usar-la-plataforma">Ver tutoriales</Link>
              </Button>
            </div>
          </div>
          {/* No mostrar métricas en el hero del blog; la página debe ir directo al contenido. */}
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="container px-4 md:px-6">
          {hasPublishedPosts ? (
            <>
              <div className="mx-auto max-w-3xl text-center">
                <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                  Artículos publicados
                </h2>
                <p className="mt-4 text-lg leading-8 text-slate-600">
                  Guías prácticas para organizar ventas, facturación, inventario y reportes sin
                  llenar el negocio de vueltas.
                </p>
              </div>

              <div className="mx-auto mt-10 grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
                {blogPosts.map((post) => {
                  const category = blogCategories.find((item) => item.slug === post.category)

                  return (
                    <article
                      key={post.slug}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <Link href={`/blog/${post.slug}`} className="block">
                        <Image
                          src={post.heroImage.src}
                          alt={post.heroImage.alt}
                          width={post.heroImage.width}
                          height={post.heroImage.height}
                          className="aspect-[16/10] h-auto w-full object-cover"
                        />
                        <div className="p-6">
                          {category ? (
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-primary">
                              {category.name}
                            </p>
                          ) : null}
                          <h3 className="mt-3 text-xl font-bold leading-tight text-slate-950">
                            {post.title}
                          </h3>
                          <p className="mt-3 text-sm leading-7 text-slate-600">{post.description}</p>
                          <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
                            <span>{post.readingTimeMinutes} min</span>
                            <span className="font-semibold text-purple-primary">Leer guía</span>
                          </div>
                        </div>
                      </Link>
                    </article>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-slate-50 p-8 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm">
                <CalendarClock className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-2xl font-bold text-slate-950">
                Aún no hay artículos publicados
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Esta sección queda preparada para publicar guías de ventas, facturación e inventario.
                Mientras tanto, puedes revisar los tutoriales existentes o crear tu cuenta de prueba.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild className="font-semibold">
                  <Link href="/como-usar-la-plataforma">Ir a tutoriales</Link>
                </Button>
                <Button asChild variant="outline" className="font-semibold">
                  <Link href="/app">Comenzar prueba gratis</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
