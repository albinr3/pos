import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays, Clock, ExternalLink, UserRound } from "lucide-react"

import {
  blogPosts,
  getBlogCategory,
  getBlogPostBySlug,
  type BlogContentBlock,
  type BlogImage,
  type BlogInlineContent,
} from "@/lib/blog"

const siteUrl = "https://movopos.com"

export const dynamicParams = false

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPostBySlug(slug)

  if (!post) {
    return {
      title: "Artículo no encontrado",
      robots: { index: false, follow: false },
    }
  }

  const postPath = `/blog/${post.slug}`

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: {
      canonical: postPath,
    },
    authors: [{ name: post.author.name }],
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: postPath,
      siteName: "MOVOPos",
      locale: "es_DO",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      authors: [post.author.name],
      images: [
        {
          url: post.heroImage.src,
          width: post.heroImage.width,
          height: post.heroImage.height,
          alt: post.heroImage.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [post.heroImage.src],
    },
  }
}

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("es-DO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`))
}

function renderInline(content: BlogInlineContent) {
  if (typeof content === "string") return content

  return content.map((part, index) => {
    if (typeof part === "string") return part

    return (
      <Link
        key={`${part.href}-${index}`}
        href={part.href}
        target={part.external ? "_blank" : undefined}
        rel={part.external ? "noopener nofollow" : undefined}
        className="font-semibold text-purple-primary underline-offset-4 hover:underline"
      >
        {part.text}
      </Link>
    )
  })
}

function BlogSectionImage({ image }: { image: BlogImage }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <Image
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        className="aspect-[16/9] h-auto w-full object-cover"
        loading="lazy"
      />
      {image.photographer ? (
        <figcaption className="px-4 py-2 text-xs text-slate-500">
          Foto:{" "}
          {image.photographerUrl ? (
            <Link
              href={image.photographerUrl}
              target="_blank"
              rel="noopener nofollow"
              className="underline-offset-4 hover:underline"
            >
              {image.photographer}
            </Link>
          ) : (
            image.photographer
          )}
          {image.pexelsUrl ? (
            <>
              {" "}
              vía{" "}
              <Link
                href={image.pexelsUrl}
                target="_blank"
                rel="noopener nofollow"
                className="underline-offset-4 hover:underline"
              >
                Pexels
              </Link>
            </>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  )
}

function BlogBlock({
  block,
  sectionImage,
}: {
  block: BlogContentBlock
  sectionImage?: BlogImage
}) {
  if (block.type === "heading") {
    return (
      <>
        <h2 id={block.id} className="scroll-mt-28 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          {block.title}
        </h2>
        {sectionImage ? <BlogSectionImage image={sectionImage} /> : null}
      </>
    )
  }

  if (block.type === "paragraph") {
    return <p className="text-lg leading-8 text-slate-700">{renderInline(block.content)}</p>
  }

  if (block.type === "list") {
    const ListTag = block.style === "number" ? "ol" : "ul"

    return (
      <ListTag className="ml-6 space-y-3 text-lg leading-8 text-slate-700 marker:text-purple-primary">
        {block.items.map((item, index) => (
          <li key={index} className={block.style === "number" ? "list-decimal" : "list-disc"}>
            {renderInline(item)}
          </li>
        ))}
      </ListTag>
    )
  }

  if (block.type === "quote") {
    return (
      <blockquote className="border-l-4 border-purple-primary bg-violet-50 px-5 py-4 text-lg font-medium leading-8 text-slate-800">
        {renderInline(block.content)}
      </blockquote>
    )
  }

  if (block.type === "callout") {
    return (
      <aside className="rounded-lg border border-violet-200 bg-violet-50 p-5">
        {block.title ? <p className="font-semibold text-violet-950">{block.title}</p> : null}
        <p className="mt-2 text-base leading-7 text-slate-700">{renderInline(block.content)}</p>
      </aside>
    )
  }

  return (
    <figure className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      {block.caption ? (
        <figcaption className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          {block.caption}
        </figcaption>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-950">
            <tr>
              {block.headers.map((header) => (
                <th key={header} scope="col" className="px-4 py-3 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="px-4 py-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getBlogPostBySlug(slug)

  if (!post) notFound()

  const category = getBlogCategory(post.category)
  const faqImage = post.sectionImages?.["preguntas-frecuentes"] ?? post.sectionImages?.["frequently-asked"]
  const postUrl = `${siteUrl}/blog/${post.slug}`
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: postUrl },
    ],
  }
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    image: `${siteUrl}${post.heroImage.src}`,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: {
      "@type": "Person",
      name: post.author.name,
      jobTitle: post.author.role,
    },
    publisher: {
      "@type": "Organization",
      name: "MOVOPos",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/movoLogo.png`,
      },
    },
    mainEntityOfPage: postUrl,
  }
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      {post.faqs.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}

      <article className="bg-white">
        <header className="border-b border-slate-200 bg-slate-50">
          <div className="container px-4 py-12 md:px-6 md:py-16">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm font-semibold text-purple-primary underline-offset-4 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al blog
            </Link>

            <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
              <div>
                {category ? (
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-primary">
                    {category.name}
                  </p>
                ) : null}
                <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
                  {post.title}
                </h1>
                <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-700">{post.excerpt}</p>

                <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="h-4 w-4" />
                    {post.author.name}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {post.readingTimeMinutes} min de lectura
                  </span>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <Image
                  src={post.heroImage.src}
                  alt={post.heroImage.alt}
                  width={post.heroImage.width}
                  height={post.heroImage.height}
                  className="aspect-[16/10] h-auto w-full object-cover"
                  priority
                />
                {post.heroImage.photographer ? (
                  <div className="px-4 py-2 text-xs text-slate-500">
                    Foto:{" "}
                    {post.heroImage.photographerUrl ? (
                      <Link
                        href={post.heroImage.photographerUrl}
                        target="_blank"
                        rel="noopener nofollow"
                        className="underline-offset-4 hover:underline"
                      >
                        {post.heroImage.photographer}
                      </Link>
                    ) : (
                      post.heroImage.photographer
                    )}
                    {post.heroImage.pexelsUrl ? (
                      <>
                        {" "}
                        vía{" "}
                        <Link
                          href={post.heroImage.pexelsUrl}
                          target="_blank"
                          rel="noopener nofollow"
                          className="underline-offset-4 hover:underline"
                        >
                          Pexels
                        </Link>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <div className="container grid gap-10 px-4 py-12 md:px-6 lg:grid-cols-[260px_minmax(0,760px)] lg:items-start lg:py-16">
          <aside className="lg:sticky lg:top-24">
            <nav className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" aria-label="Tabla de contenido">
              <p className="text-sm font-semibold text-slate-950">En este artículo</p>
              <ol className="mt-4 space-y-3 text-sm text-slate-600">
                {post.tableOfContents.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} className="hover:text-purple-primary">
                      {item.title}
                    </a>
                  </li>
                ))}
                {post.faqs.length > 0 ? (
                  <li>
                    <a href="#preguntas-frecuentes" className="hover:text-purple-primary">
                      Preguntas frecuentes
                    </a>
                  </li>
                ) : null}
              </ol>
            </nav>
          </aside>

          <div className="min-w-0">
            <section className="rounded-lg border border-violet-200 bg-violet-50 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-primary">
                Resumen rápido
              </p>
              <p className="mt-3 text-lg leading-8 text-slate-800">{post.tldr}</p>
            </section>

            <div className="mt-10 space-y-8">
              {post.body.map((block, index) => (
                <BlogBlock
                  key={block.type === "heading" ? block.id : `${block.type}-${index}`}
                  block={block}
                  sectionImage={block.type === "heading" ? post.sectionImages?.[block.id] : undefined}
                />
              ))}
            </div>

            {post.internalLinks.length > 0 ? (
              <section className="mt-12 rounded-lg border border-slate-200 bg-slate-50 p-6">
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                  También te puede servir
                </h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {post.internalLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <span className="font-semibold text-slate-950">{link.title}</span>
                      <span className="mt-2 block text-sm leading-6 text-slate-600">{link.description}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {post.externalLinks.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-xl font-bold tracking-tight text-slate-950">
                  Fuentes y lecturas útiles
                </h2>
                <ul className="mt-4 space-y-3 text-sm text-slate-700">
                  {post.externalLinks.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        target="_blank"
                        rel="noopener nofollow"
                        className="inline-flex items-center gap-2 font-semibold text-purple-primary underline-offset-4 hover:underline"
                      >
                        {link.title}
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <span className="block leading-6 text-slate-600">{link.description}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {post.faqs.length > 0 ? (
              <section id="preguntas-frecuentes" className="mt-12">
                {faqImage ? (
                  <div className="mb-6">
                    <BlogSectionImage image={faqImage} />
                  </div>
                ) : null}
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                  Preguntas frecuentes
                </h2>
                <dl className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                  {post.faqs.map((faq) => (
                    <div key={faq.question} className="p-5">
                      <dt className="font-semibold text-slate-950">{faq.question}</dt>
                      <dd className="mt-2 leading-7 text-slate-700">{faq.answer}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            <footer className="mt-12 rounded-lg border border-slate-200 bg-slate-50 p-6">
              <p className="font-semibold text-slate-950">{post.author.name}</p>
              <p className="mt-1 text-sm text-slate-600">{post.author.role}</p>
              <p className="mt-3 leading-7 text-slate-700">{post.author.bio}</p>
            </footer>
          </div>
        </div>
      </article>
    </>
  )
}
