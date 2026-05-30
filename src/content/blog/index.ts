import type { BlogPost } from "@/lib/blog"
import { queEsUnSistemaDeFacturacionPost } from "./que-es-un-sistema-de-facturacion"

// El generador de blog debe registrar aquí solo artículos reales y publicados.
// Así el índice, la ruta /blog/[slug] y el sitemap siempre leen la misma fuente.
export const blogPosts: BlogPost[] = [
  queEsUnSistemaDeFacturacionPost,
]
