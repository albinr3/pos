import type { MetadataRoute } from "next"

const siteUrl = "https://movopos.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    "/",
    // Canonical de precios para indexación; /pricing redirige de forma permanente.
    "/precios",
    "/about",
    "/como-usar-la-plataforma",
    "/contact",
    "/app-ventas-inventario",
    "/privacy",
    "/terms",
  ]

  return pages.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }))
}
