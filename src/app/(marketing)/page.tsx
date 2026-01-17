import { Hero } from "@/components/marketing/hero"
import { Features } from "@/components/marketing/features"
import { CTASection } from "@/components/marketing/cta-section"
import { WorksSection } from "@/components/marketing/works-section"
import { PricingCard } from "@/components/marketing/pricing-card"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

const previewPlans = [
  {
    name: "Básico",
    price: "RD$ 2,500",
    description: "Perfecto para pequeños negocios",
    features: [
      "Hasta 500 productos",
      "Ventas ilimitadas",
      "Reportes básicos",
      "Soporte por email",
    ],
    cta: "Comenzar",
    ctaHref: "/pricing",
  },
  {
    name: "Pro",
    price: "RD$ 4,500",
    description: "Para negocios en crecimiento",
    features: [
      "Productos ilimitados",
      "Múltiples usuarios",
      "Reportes avanzados",
      "Soporte prioritario",
      "Integraciones",
    ],
    cta: "Comenzar",
    ctaHref: "/pricing",
    popular: true,
  },
]

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      
      <section className="py-24 sm:py-32 bg-white">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Planes que se adaptan a ti
            </h2>
            <p className="mt-6 text-xl text-muted-foreground">
              Elige el plan perfecto para tu negocio. Puedes cambiar o cancelar en cualquier momento.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-2">
            {previewPlans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} />
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/pricing"
              className="text-base font-medium inline-flex items-center gap-1 transition-colors hover:opacity-80"
              style={{
                color: 'rgb(130, 4, 255)'
              }}
            >
              Ver todos los planes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <WorksSection />
      <CTASection />
    </>
  )
}


