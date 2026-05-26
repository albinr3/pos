import { permanentRedirect } from "next/navigation"

export default function PricingRedirectPage() {
  // Redirección permanente para conservar señales SEO y evitar contenido duplicado.
  permanentRedirect("/precios")
}
