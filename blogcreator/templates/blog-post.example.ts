import type { BlogImage, BlogPost } from "@/lib/blog"
import pexels from "./pexels.json"

const pexelsImages = pexels as Record<string, Record<string, BlogImage>>
const postImages = pexelsImages["sistema-pos-en-republica-dominicana"] ?? {}
const heroImage = postImages.hero

export const ejemploPost: BlogPost = {
  slug: "sistema-pos-en-republica-dominicana",
  title: "Sistema POS en República Dominicana: guía clara",
  description:
    "Aprende qué debe tener un sistema POS en República Dominicana para vender, facturar y controlar inventario con menos vueltas.",
  category: "punto-de-venta",
  publishedAt: "2026-05-30",
  readingTimeMinutes: 7,
  keywords: [
    "sistema pos en republica dominicana",
    "punto de venta para tienda",
    "sistema para ventas e inventario",
  ],
  heroImage: {
    src: heroImage?.src ?? "/hero-img.svg",
    alt: heroImage?.alt ?? "Sistema POS en República Dominicana para ventas e inventario",
    width: heroImage?.width ?? 1200,
    height: heroImage?.height ?? 630,
    photographer: heroImage?.photographer,
    photographerUrl: heroImage?.photographerUrl,
    pexelsUrl: heroImage?.pexelsUrl,
  },
  author: {
    name: "Julio Rodríguez",
    role: "Programador y especialista en sistemas POS",
    bio: "Julio ayuda a negocios pequeños a vender, facturar y controlar inventario con números claros, sin ponerle traje y corbata a un colmado.",
  },
  excerpt:
    "Una guía práctica para entender qué debe resolver un POS antes de meterlo en caja.",
  tldr:
    "Un sistema POS en República Dominicana debe ayudarte a vender, facturar y controlar inventario desde un solo lugar. Si no te muestra ventas, caja y productos claros, no está resolviendo lo importante.",
  tableOfContents: [
    { id: "que-debe-hacer-un-sistema-pos", title: "Qué debe hacer un POS" },
  ],
  sectionImages: postImages,
  body: [
    {
      type: "heading",
      id: "que-debe-hacer-un-sistema-pos",
      title: "Qué debe hacer un sistema POS en un negocio pequeño",
    },
    {
      type: "paragraph",
      content:
        "Un sistema POS debe registrar ventas, descontar inventario, emitir comprobantes y mostrar reportes claros. Lo demás depende del negocio.",
    },
  ],
  faqs: [
    {
      question: "¿Qué es un sistema POS?",
      answer:
        "Es un sistema para registrar ventas, facturar, controlar inventario y revisar reportes del negocio desde un solo lugar.",
    },
  ],
  internalLinks: [
    {
      title: "Precios de MOVOPos",
      description: "Planes disponibles para empezar con precio claro.",
      href: "/precios",
    },
  ],
  externalLinks: [],
}
