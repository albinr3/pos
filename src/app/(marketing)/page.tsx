import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Smartphone } from "lucide-react"
import { Hero } from "@/components/marketing/hero"
import { Features } from "@/components/marketing/features"
import { BusinessTypesSection } from "@/components/marketing/business-types-section"
import { POSDemoSection } from "@/components/marketing/pos-demo-section"
import { CTASection } from "@/components/marketing/cta-section"
import { FAQSection } from "@/components/marketing/faq-section"
import { faqItems } from "@/components/marketing/faq-data"
import { PricingCard } from "@/components/marketing/pricing-card"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  // Nota SEO: no repetir marca aquí porque el layout aplica el template "%s | MOVOPos".
  title: "Sistema POS en República Dominicana | Facturación, Inventario y Ventas",
  description:
    "Sistema POS en República Dominicana para facturar, vender y controlar inventario. Administra ventas, caja, clientes, cuentas por cobrar y reportes con MOVOPos. Prueba gratis 15 días.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Sistema POS en República Dominicana | Facturación, Inventario y Ventas",
    description:
      "Sistema POS en República Dominicana para facturar, vender y controlar inventario. Administra ventas, caja, clientes, cuentas por cobrar y reportes con MOVOPos. Prueba gratis 15 días.",
    url: "/",
  },
  twitter: {
    title: "Sistema POS en República Dominicana | Facturación, Inventario y Ventas",
    description:
      "Sistema POS en República Dominicana para facturar, vender y controlar inventario. Administra ventas, caja, clientes, cuentas por cobrar y reportes con MOVOPos. Prueba gratis 15 días.",
  },
}

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MOVOPos",
    url: "https://movopos.com/",
    logo: "https://movopos.com/movoLogo.png",
    sameAs: ["https://movopos.com"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Sistema POS en República Dominicana | Facturación e Inventario | MOVOPos",
    url: "https://movopos.com/",
    description:
      "Sistema POS en República Dominicana para facturar, vender y controlar inventario con caja, clientes, cuentas por cobrar y reportes.",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  },
]

const previewPlans = [
  {
    name: "Plan Mensual",
    price: "RD$ 1,300",
    description: "Sistema POS completo con facturación, inventario y ventas",
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

const solutionPages = [
  {
    title: "Sistema POS",
    description:
      "Conoce cómo funciona un sistema punto de venta para vender más rápido y cobrar con más control.",
    href: "/sistema-pos",
  },
  {
    title: "Facturación e inventario",
    description:
      "Mira cómo centralizar facturación, ventas e inventario en una sola plataforma para tu negocio.",
    href: "/sistema-de-inventario",
  },
  {
    title: "Facturación online",
    description:
      "Ideal para negocios que quieren facturar en la nube desde laptop, tablet o celular.",
    href: "/facturacion-online",
  },
  {
    title: "Punto de venta para colmados",
    description:
      "Una guía para colmados y negocios de alta rotación que necesitan caja e inventario ordenado.",
    href: "/punto-de-venta-abarrotes",
  },
]

function DesktopSectionCTA() {
  return (
    <div className="hidden md:block py-6 bg-white">
      <div className="container flex justify-center">
        <Button asChild size="lg" className="font-semibold">
          <Link href="/app">
            Comenzar prueba gratis
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

function MobileStickyCTA() {
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 md:hidden">
      <Button asChild size="lg" className="w-full h-12 text-base font-semibold shadow-lg">
        <Link href="/app">
          Comenzar prueba gratis
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  )
}

function MobileAppTeaserSection() {
  return (
    <section className="py-12 sm:py-16 bg-slate-50">
      <div className="container">
        <div className="mx-auto max-w-4xl rounded-3xl border bg-white p-6 sm:p-10 shadow-sm">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center rounded-lg bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800">
                <Smartphone className="mr-2 h-4 w-4" />
                Nueva opción móvil
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                También tenemos app móvil para Android
              </h2>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                Descarga el APK de MOVOPos y factura, controla inventario y vende con o sin
                internet desde tu celular.
              </p>
              <Button asChild size="lg" className="mt-6 font-semibold">
                <Link href="/app-movil">
                  Ver app móvil
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="relative mx-auto w-full max-w-sm">
              <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-tr from-violet-100 to-transparent" />
              <Image
                src="/pos_en_app_android.png"
                alt="MOVOPos app móvil en Android"
                width={600}
                height={800}
                className="h-auto w-full rounded-2xl object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <Features />
      <BusinessTypesSection />
      <POSDemoSection />
      <DesktopSectionCTA />

      <section className="py-12 sm:py-16 bg-slate-50">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center mb-8">
            <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Guías para elegir tu sistema POS
            </h2>
            <p className="mt-6 text-xl text-muted-foreground">
              Explora páginas por necesidad para comparar opciones y elegir el mejor sistema POS
              para tu tipo de negocio en República Dominicana.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {solutionPages.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                className="rounded-2xl border bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <h3 className="text-2xl font-semibold text-foreground">{page.title}</h3>
                <p className="mt-3 text-base text-muted-foreground">{page.description}</p>
                <span className="mt-6 inline-flex items-center text-sm font-semibold text-violet-700">
                  Ver más
                  <ArrowRight className="ml-2 h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-white">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-8">
            <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Un sistema POS completo por RD$1,300 al mes
            </h2>
            <p className="mt-6 text-xl text-muted-foreground">
              Prueba MOVOPos gratis durante 15 días. Luego continúa con todas las funcionalidades
              incluidas por RD$1,300 al mes, sin comisiones por transacción.
            </p>
          </div>

          <div className="mx-auto max-w-md">
            {previewPlans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} />
            ))}
          </div>
        </div>
      </section>

      <MobileAppTeaserSection />
      <FAQSection />
      <CTASection />

      <div className="h-20 md:hidden" />
      <MobileStickyCTA />
    </>
  )
}
