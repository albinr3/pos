import { Hero } from "@/components/marketing/hero"
import { Features } from "@/components/marketing/features"
import { BusinessTypesSection } from "@/components/marketing/business-types-section"
import { POSDemoSection } from "@/components/marketing/pos-demo-section"
import { CTASection } from "@/components/marketing/cta-section"
import { FAQSection } from "@/components/marketing/faq-section"
import { PricingCard } from "@/components/marketing/pricing-card"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

const previewPlans = [
  {
    name: "Plan Mensual",
    price: "RD$ 1,300",
    description: "Acceso completo a todas las funcionalidades",
    features: [
      "Productos ilimitados",
      "Ventas ilimitadas",
      "Control de inventario completo",
      "Múltiples usuarios",
      "Reportes avanzados",
      "Cuentas por cobrar",
      "Cotizaciones y devoluciones",
      "Soporte por email",
    ],
    cta: "Comenzar prueba de 15 días gratis",
    ctaHref: "/app",
    popular: true,
  },
]

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      <BusinessTypesSection />
      <POSDemoSection />
      
      <section className="py-12 sm:py-16 bg-white">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-8">
            <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Precio simple y transparente
            </h2>
            <p className="mt-6 text-xl text-muted-foreground">
              Un solo plan con todas las funcionalidades que necesitas. Puedes cancelar en cualquier momento.
            </p>
          </div>

          <div className="mx-auto max-w-md">
            {previewPlans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} />
            ))}
          </div>
        </div>
      </section>

      <FAQSection />

      <CTASection />
    </>
  )
}


