import type { MetadataRoute } from "next"

const siteUrl = "https://movopos.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    "/",
    "/pricing",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/login",
  ]

  return pages.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }))
}
