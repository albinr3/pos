import { blogPosts } from "@/content/blog"

export const blogCategories = [
  {
    slug: "punto-de-venta",
    name: "Punto de venta",
    description: "Guías para vender más rápido, controlar caja y atender mejor en el mostrador.",
    keywords: ["sistema pos", "punto de venta", "ventas"],
  },
  {
    slug: "facturacion",
    name: "Facturación",
    description: "Contenido sobre facturación, recibos, cotizaciones y procesos comerciales.",
    keywords: ["facturación", "recibos", "cotizaciones"],
  },
  {
    slug: "inventario",
    name: "Inventario",
    description: "Buenas prácticas para controlar productos, existencias, entradas y salidas.",
    keywords: ["inventario", "stock", "productos"],
  },
  {
    slug: "negocios-rd",
    name: "Negocios en RD",
    description: "Ideas prácticas para administrar negocios dominicanos con información clara.",
    keywords: ["negocios en república dominicana", "administración", "reportes"],
  },
] as const

export type BlogCategorySlug = (typeof blogCategories)[number]["slug"]

export type BlogInlineLink = {
  text: string
  href: string
  external?: boolean
}

export type BlogInlineContent = string | Array<string | BlogInlineLink>

export type BlogContentBlock =
  | {
      type: "heading"
      id: string
      title: string
    }
  | {
      type: "paragraph"
      content: BlogInlineContent
    }
  | {
      type: "list"
      style?: "bullet" | "number"
      items: BlogInlineContent[]
    }
  | {
      type: "quote"
      content: BlogInlineContent
    }
  | {
      type: "callout"
      title?: string
      content: BlogInlineContent
    }
  | {
      type: "table"
      caption?: string
      headers: string[]
      rows: string[][]
    }

export type BlogAuthor = {
  name: string
  role: string
  bio: string
}

export type BlogImage = {
  src: string
  alt: string
  width: number
  height: number
  photographer?: string
  photographerUrl?: string
  pexelsUrl?: string
}

export type BlogFaq = {
  question: string
  answer: string
}

export type BlogRelatedLink = {
  title: string
  description: string
  href: string
  external?: boolean
}

export type BlogPostSummary = {
  slug: string
  title: string
  description: string
  category: BlogCategorySlug
  publishedAt: string
  updatedAt?: string
  readingTimeMinutes: number
  keywords: string[]
  heroImage: BlogImage
}

export type BlogPost = BlogPostSummary & {
  author: BlogAuthor
  excerpt: string
  tldr: string
  tableOfContents: Array<{ id: string; title: string }>
  sectionImages?: Record<string, BlogImage>
  body: BlogContentBlock[]
  faqs: BlogFaq[]
  internalLinks: BlogRelatedLink[]
  externalLinks: BlogRelatedLink[]
}

export { blogPosts }

export function getBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug)
}

export function getBlogCategory(slug: BlogCategorySlug) {
  return blogCategories.find((category) => category.slug === slug)
}
