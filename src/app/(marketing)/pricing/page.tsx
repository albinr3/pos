import { PricingCard } from "@/components/marketing/pricing-card"
import type { PricingPlan } from "@/components/marketing/pricing-card"

const plans: PricingPlan[] = [
  {
    name: "Básico",
    price: "RD$ 2,500",
    description: "Perfecto para pequeños negocios que están comenzando",
    features: [
      "Hasta 500 productos",
      "Ventas ilimitadas",
      "Control de inventario básico",
      "Reportes de ventas",
      "Facturación térmica",
      "Soporte por email",
      "Actualizaciones incluidas",
    ],
    cta: "Comenzar ahora",
    ctaHref: "/app",
  },
  {
    name: "Pro",
    price: "RD$ 4,500",
    description: "Para negocios en crecimiento que necesitan más funcionalidades",
    features: [
      "Productos ilimitados",
      "Múltiples usuarios (hasta 5)",
      "Control de inventario avanzado",
      "Reportes avanzados y dashboard",
      "Cuentas por cobrar",
      "Gestión de proveedores",
      "Cotizaciones y devoluciones",
      "Soporte prioritario",
      "Integraciones disponibles",
      "Actualizaciones incluidas",
    ],
    cta: "Comenzar ahora",
    ctaHref: "/app",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Personalizado",
    description: "Solución personalizada para grandes empresas",
    features: [
      "Todo lo de Pro",
      "Usuarios ilimitados",
      "Personalización completa",
      "API y webhooks",
      "Soporte 24/7",
      "Gerente de cuenta dedicado",
      "Capacitación personalizada",
      "Migración de datos asistida",
      "SLA garantizado",
    ],
    cta: "Contactar ventas",
    ctaHref: "/about",
  },
]

export const metadata = {
  title: "Precios | Tejada POS",
  description: "Elige el plan perfecto para tu negocio. Precios transparentes y sin sorpresas.",
}

export default function PricingPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Precios simples y transparentes
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Elige el plan que mejor se adapte a tu negocio. Sin costos ocultos, sin sorpresas.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-3">
          {plans.map((plan) => (
            <PricingCard key={plan.name} plan={plan} />
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Todos los planes incluyen garantía de satisfacción de 30 días.
            ¿Tienes preguntas?{" "}
            <a href="/about" className="text-primary hover:underline">
              Contáctanos
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}


