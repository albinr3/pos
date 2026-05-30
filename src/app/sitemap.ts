import type { MetadataRoute } from "next"

import { blogPosts } from "@/lib/blog"

const siteUrl = "https://movopos.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    "/",
    // Canonical de precios para indexación; /pricing redirige de forma permanente.
    "/precios",
    "/about",
    "/como-usar-la-plataforma",
    "/blog",
    "/contact",
    "/app-ventas-inventario",
    "/privacy",
    "/terms",
  ]

  const staticPages = pages.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.7,
  }))

  // Los posts salen del registro tipado para no olvidar artículos publicados fuera del sitemap.
  const blogPages = blogPosts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: new Date(`${post.updatedAt ?? post.publishedAt}T00:00:00`),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }))

  return [...staticPages, ...blogPages]
}
