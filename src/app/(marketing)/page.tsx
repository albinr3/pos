import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, BarChart3, PackageCheck, ReceiptText, ShoppingCart, Smartphone } from "lucide-react"
import { Hero } from "@/components/marketing/hero"
import { Features } from "@/components/marketing/features"
import { BusinessTypesSection } from "@/components/marketing/business-types-section"
import { POSDemoSection } from "@/components/marketing/pos-demo-section"
import { CTASection } from "@/components/marketing/cta-section"
import { FAQSection } from "@/components/marketing/faq-section"
import { faqItems } from "@/components/marketing/faq-data"
import { PricingCard } from "@/components/marketing/pricing-card"
import { Button } from "@/components/ui/button"

const homeSeoDescription =
  "Sistema POS en República Dominicana para facturar, vender y controlar inventario. Maneja caja, clientes, cuentas por cobrar y reportes. Prueba gratis 15 días."

const homeSocialImage = {
  url: "/hero-img.svg",
  width: 1200,
  height: 630,
  alt: "Sistema POS en República Dominicana",
}

export const metadata: Metadata = {
  // Nota SEO: no repetir marca aquí porque el layout aplica el template "%s | MOVOPos".
  title: "Sistema POS en República Dominicana | Facturación, Inventario y Ventas",
  description: homeSeoDescription,
  alternates: {
    canonical: "/",
  },
  // SEO: al sobrescribir openGraph/twitter en una página, Next no conserva las imágenes del layout.
  openGraph: {
    title: "Sistema POS en República Dominicana | Facturación, Inventario y Ventas",
    description: homeSeoDescription,
    url: "/",
    images: [homeSocialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sistema POS en República Dominicana | Facturación, Inventario y Ventas",
    description: homeSeoDescription,
    images: [homeSocialImage],
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
    secondaryPrice: "USD 20/mes",
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

const integratedModules = [
  {
    title: "Vende desde el punto de venta",
    description:
      "Registra productos, cobra rápido, aplica métodos de pago y factura tus ventas desde una pantalla sencilla.",
    icon: ShoppingCart,
  },
  {
    title: "Facturación para negocios en RD",
    description:
      "Emite facturas en pesos dominicanos y mantén tus ventas organizadas sin depender de procesos manuales.",
    icon: ReceiptText,
  },
  {
    title: "Inventario actualizado",
    description:
      "Controla productos, existencias, entradas, salidas y movimientos de inventario en tiempo real.",
    icon: PackageCheck,
  },
  {
    title: "Reportes para decidir mejor",
    description:
      "Consulta ventas, cuentas por cobrar, productos más vendidos y resultados de tu negocio cuando lo necesites.",
    icon: BarChart3,
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

function IntegratedPOSSection() {
  return (
    <section className="py-12 sm:py-16 bg-slate-50">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center mb-8 sm:mb-10">
          <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Todo conectado en un solo sistema POS, excelente como programa de venta para negocio.

          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            MOVOPos une punto de venta, facturación, inventario, caja, clientes, cuentas por cobrar
            y reportes para que puedas administrar tu negocio desde una sola plataforma.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {integratedModules.map((module) => {
            const Icon = module.icon
            return (
              <div key={module.title} className="rounded-lg border bg-white p-6 shadow-sm">
                <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-semibold leading-snug text-foreground">
                  {module.title}
                </h3>
                <p className="mt-3 text-base leading-7 text-muted-foreground">
                  {module.description}
                </p>
              </div>
            )
          })}
        </div>

        <div className="mt-8 flex justify-center">
          <Button asChild size="lg" className="font-semibold">
            <Link href="/app">
              Comenzar prueba gratis
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
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
                <Link href="/app-ventas-inventario">
                  Ver app para ventas e inventario
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
      <IntegratedPOSSection />

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
