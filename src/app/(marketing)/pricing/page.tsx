import { PricingCard } from "@/components/marketing/pricing-card"
import type { PricingPlan } from "@/components/marketing/pricing-card"
import type { Metadata } from "next"

const plans: PricingPlan[] = [
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
      "Gestión de proveedores",
      "Cotizaciones y devoluciones",
      "Soporte por email",
      "Actualizaciones incluidas",
    ],
    cta: "Comenzar prueba de 15 días gratis",
    ctaHref: "/app",
    popular: true,
  },
]

export const metadata: Metadata = {
  title: "Precios | MOVOPos",
  description: "Elige el plan perfecto para tu negocio. Precios transparentes y sin sorpresas.",
  alternates: {
    canonical: "/pricing",
  },
}

export default function PricingPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Precio simple y transparente
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Un solo plan con todas las funcionalidades que necesitas. Puedes cancelar en cualquier momento.
          </p>
        </div>

        <div className="mx-auto max-w-md">
          {plans.map((plan) => (
            <PricingCard key={plan.name} plan={plan} />
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Incluye prueba gratuita de 15 días. ¿Tienes preguntas?{" "}
            <a href="/about" className="text-primary hover:underline">
              Contáctanos
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}


