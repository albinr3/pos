import type { MetadataRoute } from "next"

const siteUrl = "https://movopos.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    "/",
    "/pricing",
    "/about",
    "/como-usar-la-plataforma",
    "/contact",
    "/sistema-pos",
    "/sistema-de-inventario",
    "/facturacion-online",
    "/app-movil",
    "/punto-de-venta-abarrotes",
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
