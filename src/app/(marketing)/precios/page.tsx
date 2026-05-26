import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PricingCard } from "@/components/marketing/pricing-card"
import type { PricingPlan } from "@/components/marketing/pricing-card"

const plans: PricingPlan[] = [
  {
    name: "Plan completo",
    price: "RD$ 1,300",
    description: "Todas las funcionalidades principales incluidas para administrar tu negocio.",
    features: [
      "Punto de venta",
      "Facturación en RD$",
      "Control de inventario",
      "Ventas y reportes",
      "Caja",
      "Clientes",
      "Cuentas por cobrar",
      "Cotizaciones",
      "Devoluciones",
      "Usuarios y permisos",
      "Soporte para negocios dominicanos",
    ],
    cta: "Probar gratis 15 días",
    ctaHref: "/app",
    popular: true,
  },
]

const noHiddenCosts = [
  "Sin comisiones por transacción",
  "Sin contratos largos",
  "Prueba gratis por 15 días",
  "Todas las funcionalidades principales incluidas",
  "Soporte para ayudarte a comenzar",
]

const priceFaqs = [
  {
    question: "¿Cuánto cuesta MOVOPos?",
    answer: "MOVOPos cuesta RD$1,300 al mes luego de la prueba gratis de 15 días.",
  },
  {
    question: "¿La prueba gratis requiere tarjeta?",
    answer: "No. La prueba gratis no requiere tarjeta.",
  },
  {
    question: "¿El precio incluye facturación e inventario?",
    answer:
      "Sí. El plan incluye punto de venta, facturación, inventario, ventas, clientes, cuentas por cobrar, cotizaciones, devoluciones y reportes.",
  },
  {
    question: "¿Hay comisiones por transacción?",
    answer: "No hay comisiones por transacción.",
  },
  {
    question: "¿Puedo cancelar cuando quiera?",
    answer: "Sí, puedes cancelar cuando quieras.",
  },
  {
    question: "¿Puedo usar varios usuarios?",
    answer: "Sí, el plan permite múltiples usuarios con permisos por rol.",
  },
  {
    question: "¿El precio está en pesos dominicanos?",
    answer: "Sí. El precio se muestra en RD$ y también puedes pagar US$20 con tarjeta de crédito.",
  },
]

export const metadata: Metadata = {
  title: "Precios de MOVOPos | Sistema POS desde RD$1,300 al mes",
  description:
    "Conoce los precios de MOVOPos, un sistema POS para facturación, inventario, ventas, caja y reportes en República Dominicana. Prueba gratis 15 días desde RD$1,300 al mes.",
  keywords: [
    "sistema pos precio",
    "precio sistema pos",
    "software de facturación precio",
    "sistema de facturación precio",
    "punto de venta precio",
    "sistema de inventario precio",
    "software pos precio",
    "sistema pos mensual",
  ],
  alternates: {
    canonical: "/precios",
  },
  robots: {
    // Fijamos index/follow explícito para prevenir regresiones SEO en futuras ediciones.
    index: true,
    follow: true,
  },
}

export default function PreciosPage() {
  return (
    <div className="py-20 sm:py-28">
      <div className="container">
        <section className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Precios de MOVOPos para tu sistema POS
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground">
            Elige un sistema POS completo para facturación, inventario, ventas, caja, clientes y
            reportes en República Dominicana. Prueba gratis durante 15 días y continúa desde
            RD$1,300 al mes.
          </p>
          <p className="mt-4 text-base text-muted-foreground">
            Si buscas <strong>sistema POS precio</strong>, <strong>punto de venta precio</strong>{" "}
            o <strong>sistema de facturación precio</strong>, aquí tienes una opción clara y
            mensual.
          </p>
          <div className="mt-8">
            <Button asChild size="lg" className="font-semibold">
              <Link href="/app">
                Comenzar prueba gratis
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-14">
          <div className="mx-auto max-w-md">
            {plans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} />
            ))}
          </div>
        </section>

        <section className="mt-14 mx-auto max-w-5xl rounded-3xl border bg-slate-50 p-6 sm:p-10">
          <h2 className="text-3xl font-semibold text-foreground">
            Un precio claro para controlar tu negocio
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {noHiddenCosts.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl bg-white p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
                <p className="text-base text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            MOVOPos funciona como <strong>software de facturación precio</strong> mensual y
            también como <strong>sistema de inventario precio</strong> competitivo en una sola
            plataforma.
          </p>
        </section>

        <section className="mt-14 mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold text-foreground text-center">
            ¿Cuánto te cuesta no tener un sistema POS?
          </h2>
          <p className="mt-4 text-center text-muted-foreground">
            Un sistema POS no solo registra ventas. También te ayuda a evitar pérdidas de
            inventario, errores en caja, cuentas por cobrar olvidadas y decisiones sin reportes.
          </p>

          <div className="mt-8 overflow-hidden rounded-2xl border">
            <table className="w-full text-left">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-sm font-semibold text-slate-700">Sin sistema</th>
                  <th className="px-4 py-3 text-sm font-semibold text-slate-700">Con MOVOPos</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-4 py-3 text-sm text-muted-foreground">Inventario desactualizado</td>
                  <td className="px-4 py-3 text-sm text-foreground">Inventario controlado</td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    Ventas anotadas manualmente
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    Ventas registradas automáticamente
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3 text-sm text-muted-foreground">Errores en caja</td>
                  <td className="px-4 py-3 text-sm text-foreground">Caja más ordenada</td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    Cuentas por cobrar dispersas
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    Créditos y abonos organizados
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    No sabes qué productos se venden más
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">Reportes claros</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-14 mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold text-foreground text-center">
            Preguntas frecuentes de precios
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {priceFaqs.map((faq) => (
              <article key={faq.question} className="rounded-2xl border bg-white p-5">
                <h3 className="text-lg font-semibold text-foreground">{faq.question}</h3>
                <p className="mt-2 text-base text-muted-foreground">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
