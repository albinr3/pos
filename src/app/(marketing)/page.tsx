import type { Metadata } from "next"
import { Hero } from "@/components/marketing/hero"
import { Features } from "@/components/marketing/features"
import { BusinessTypesSection } from "@/components/marketing/business-types-section"
import { POSDemoSection } from "@/components/marketing/pos-demo-section"
import { CTASection } from "@/components/marketing/cta-section"
import { FAQSection } from "@/components/marketing/faq-section"
import { faqItems } from "@/components/marketing/faq-data"
import { PricingCard } from "@/components/marketing/pricing-card"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

export const metadata: Metadata = {
  title: "Software POS en República Dominicana | MOVOPos",
  description:
    "Sistema de facturación e inventario POS en República Dominicana: punto de venta, cuentas por cobrar y facturación térmica con prueba gratis de 15 días.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Software POS en República Dominicana | MOVOPos",
    description:
      "Controla ventas, inventario y cuentas por cobrar con un sistema de facturación y POS en la nube para negocios en República Dominicana.",
    url: "/",
  },
  twitter: {
    title: "Software POS en República Dominicana | MOVOPos",
    description:
      "Controla ventas, inventario y cuentas por cobrar con un sistema de facturación y POS en la nube para negocios en República Dominicana.",
  },
};

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
    name: "Software POS en República Dominicana | MOVOPos",
    url: "https://movopos.com/",
    description:
      "Software POS en la nube para República Dominicana: controla ventas, inventario, compras y cuentas por cobrar con facturación térmica.",
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
];

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
              Un solo plan con todas las funcionalidades que necesitas en tu sistema de facturación e inventario. Prueba sistema de facturación gratis por 15 días y cancela cuando quieras.
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


