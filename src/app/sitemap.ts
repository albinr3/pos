import type { MetadataRoute } from "next"

import { blogPosts } from "@/lib/blog"
import { siteUrl } from "@/lib/site-url"
import { appDemoVideo } from "@/content/marketing/app-demo"
import { appInstallVideo } from "@/content/marketing/app-install"

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
    "/sistema-facturacion-tiendas-celulares",
    "/privacy",
    "/terms",
  ]

  const staticPages = pages.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.7,
    // Anunciar el archivo y la miniatura reales facilita descubrir la demo de Android.
    ...(path === appDemoVideo.pagePath
      ? {
          videos: [appDemoVideo, appInstallVideo].map((video) => ({
            title: video.name,
            description: video.description,
            thumbnail_loc: `${siteUrl}${video.posterPath}`,
            content_loc: `${siteUrl}${video.videoPath}`,
            duration: video.durationSeconds,
            publication_date: video.uploadDate,
          })),
        }
      : {}),
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
