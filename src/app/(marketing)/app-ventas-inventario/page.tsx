import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  Download,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Store,
  TabletSmartphone,
} from "lucide-react"

const appDownloadUrl = "https://pub-db000bf677ef4b89aebfffa3aea14be3.r2.dev/apk_movo/movo-release.apk"

export const metadata: Metadata = {
  title: "App para Ventas, Facturación e Inventario",
  description:
    "Usa MOVOPos como app para ventas, facturación e inventario desde Android. Registra ventas, controla productos, factura en RD$ y administra tu negocio desde el celular.",
  keywords: [
    "app para ventas e inventario",
    "app para ventas",
    "app de inventario",
    "app para inventario y ventas",
    "app para facturacion e inventario",
    "app control de inventario",
    "app para registrar ventas",
    "app para administrar negocio",
    "app para tiendas",
    "app para negocios",
    "punto de venta para celular",
    "punto de venta para tablet",
    "sistema pos tablet",
    "sistema movil pos",
    "aplicacion de facturacion",
    "aplicacion para punto de venta",
    "control de stock app",
    "inventario app",
  ],
  alternates: {
    canonical: "/app-ventas-inventario",
  },
  openGraph: {
    title: "App para Ventas, Facturación e Inventario | MOVOPos",
    description:
      "Registra ventas, controla inventario, factura en RD$ y administra tu negocio desde una app Android para celulares y tablets.",
    url: "/app-ventas-inventario",
    images: [
      {
        url: "/pos-mobile-app-mockup.png",
        width: 1200,
        height: 630,
        alt: "App MOVOPos para ventas, facturación e inventario",
      },
    ],
  },
  twitter: {
    title: "App para Ventas, Facturación e Inventario | MOVOPos",
    description:
      "Controla ventas, productos, inventario, facturas y reportes desde una app Android hecha para negocios en República Dominicana.",
    images: ["/pos-mobile-app-mockup.png"],
  },
}

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MOVOPos App para Ventas, Facturación e Inventario",
  operatingSystem: "ANDROID",
  applicationCategory: "BusinessApplication",
  keywords:
    "app para ventas e inventario, app para ventas, app de inventario, app para facturacion e inventario, punto de venta para celular, punto de venta para tablet, sistema movil pos, aplicacion de facturacion, control de stock app",
  downloadUrl: appDownloadUrl,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "DOP",
  },
  description:
    "Aplicación Android para ventas, facturación e inventario en República Dominicana. Permite registrar ventas, controlar stock, facturar en RD$ y trabajar desde celular o tablet.",
}

const faqItems = [
  {
    question: "¿MOVOPos es una app para ventas e inventario?",
    answer:
      "Sí. MOVOPos funciona como app para ventas e inventario porque permite registrar ventas, controlar productos, revisar stock y consultar reportes desde Android.",
  },
  {
    question: "¿Puedo usar la app para facturar desde el celular?",
    answer:
      "Sí. Puedes usar MOVOPos como aplicación de facturación desde el celular para emitir ventas y facturas en RD$.",
  },
  {
    question: "¿La app funciona en tablet Android?",
    answer:
      "Sí. MOVOPos puede usarse como punto de venta para celular y como sistema POS tablet en dispositivos Android.",
  },
  {
    question: "¿Puedo controlar inventario desde la app?",
    answer:
      "Sí. La app de inventario permite controlar productos, existencias, movimientos de stock y ventas relacionadas con cada producto.",
  },
  {
    question: "¿Sirve para tiendas y pequeños negocios?",
    answer:
      "Sí. MOVOPos es una app para tiendas, negocios y emprendedores que necesitan administrar ventas, facturación, inventario y reportes.",
  },
  {
    question: "¿Funciona sin internet?",
    answer:
      "Sí. La app permite vender y facturar cuando la conexión falle, y luego sincroniza la información al recuperar internet.",
  },
  {
    question: "¿Cómo instalo la app en Android?",
    answer:
      "Descarga el APK desde esta página, permite la instalación desde el navegador o gestor de archivos y abre MOVOPos con tu cuenta.",
  },
]

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
}

const appUses = [
  {
    title: "Registrar ventas desde el celular",
    description:
      "Vende rápido, cobra con distintos métodos de pago y registra cada operación desde una app para registrar ventas en tu negocio.",
    icon: ShoppingCart,
  },
  {
    title: "Controlar inventario en tiempo real",
    description:
      "Consulta productos, existencias, entradas, salidas y movimientos para mantener tu inventario app actualizado.",
    icon: PackageCheck,
  },
  {
    title: "Facturar en RD$",
    description:
      "Usa una aplicación de facturación para emitir ventas y facturas en pesos dominicanos desde Android.",
    icon: ReceiptText,
  },
  {
    title: "Revisar reportes del negocio",
    description:
      "Analiza ventas, caja, productos y resultados para administrar mejor tu negocio desde el celular o tablet.",
    icon: BarChart3,
  },
]

const businessTypes = [
  "colmados",
  "minimarkets",
  "tiendas de ropa",
  "repuestos",
  "salones",
  "ferreterías",
  "emprendedores",
  "negocios familiares",
]

const inventoryFeatures = [
  "App de inventario para productos y stock",
  "Control de inventario app desde Android",
  "Control de stock app por entradas y salidas",
  "App para manejo de inventarios en tiendas",
  "Inventario app conectado con ventas",
  "App para hacer inventarios desde celular",
]

function MobileStickyDownloadCTA() {
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 md:hidden">
      <Button
        size="lg"
        className="h-12 w-full bg-violet-600 text-base font-semibold shadow-lg hover:bg-violet-700"
        asChild
      >
        <a href={appDownloadUrl}>
          <Download className="mr-2 h-5 w-5" />
          Descargar app para Android
        </a>
      </Button>
    </div>
  )
}

export default function AppMovilPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <section className="relative overflow-hidden bg-white py-16 sm:py-24 lg:py-28">
        <div className="absolute inset-0 -z-10 bg-violet-50/60" />
        <div className="container px-4 md:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col justify-center space-y-8">
              <div className="space-y-4">
                <div className="inline-flex items-center rounded-lg bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800">
                  <Smartphone className="mr-2 h-4 w-4" />
                  App para Android
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl xl:text-6xl/none">
                  App para ventas, facturación e inventario desde tu celular
                </h1>
                <p className="max-w-[650px] text-lg leading-8 text-slate-600 sm:text-xl">
                  Controla ventas, productos, inventario, facturas y reportes desde una app
                  Android hecha para negocios en República Dominicana. Vende desde tu celular o
                  tablet, incluso cuando la conexión falle.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Button
                  size="lg"
                  className="h-14 w-full bg-violet-600 px-8 text-base font-semibold shadow-lg hover:bg-violet-700 sm:w-auto"
                  asChild
                >
                  <a href={appDownloadUrl}>
                    <Download className="mr-2 h-5 w-5" />
                    Descargar app para Android
                  </a>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 w-full border-slate-300 bg-white px-8 text-base font-semibold text-slate-900 hover:bg-slate-50 sm:w-auto"
                  asChild
                >
                  <Link href="/app">Crear cuenta gratis</Link>
                </Button>
              </div>

              <div className="flex flex-col space-y-4 border-t border-slate-200 pt-4">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {["Ventas e inventario", "Facturación en RD$", "Celular o tablet", "Modo offline"].map((item) => (
                    <li key={item} className="flex items-center">
                      <CheckCircle2 className="mr-2 h-4 w-4 text-violet-600" />
                      <span className="text-sm font-medium text-slate-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="relative flex items-center justify-center lg:justify-end">
              <div className="absolute inset-0 -z-10 rotate-3 scale-105 rounded-lg bg-gradient-to-tr from-violet-100 to-transparent" />
              <div className="relative w-full max-w-sm drop-shadow-2xl">
                <Image
                  src="/pos_en_app_android.png"
                  alt="App para ventas, facturación e inventario MOVOPos en Android"
                  width={600}
                  height={800}
                  className="rounded-lg object-contain object-center"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-16 sm:py-24">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-slate-950">
                Cómo instalar la app de MOVOPos en Android
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Descarga la app Android en formato APK, instala MOVOPos y entra con tu cuenta para
                empezar a vender, facturar y controlar inventario.
              </p>
            </div>
            <div className="space-y-6">
              {[
                {
                  title: "Descarga el APK",
                  description:
                    "Toca el botón de descarga y espera que el archivo APK de MOVOPos termine de bajar en tu celular.",
                },
                {
                  title: "Permite la instalación",
                  description:
                    "Android puede pedir permiso para instalar apps desde el navegador o gestor de archivos. Activa el permiso solo para completar la instalación.",
                },
                {
                  title: "Abre MOVOPos",
                  description:
                    "Instala la app, inicia sesión con tu cuenta y usa la aplicación para punto de venta, facturación e inventario.",
                },
              ].map((step, index) => (
                <article key={step.title} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-[3rem_1fr]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 font-semibold text-white">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">{step.title}</h3>
                    {index === 0 ? (
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        Toca el botón de{" "}
                        <a
                          href={appDownloadUrl}
                          className="font-semibold text-violet-700 underline underline-offset-2 hover:text-violet-800"
                        >
                          descarga
                        </a>{" "}
                        y espera que el archivo APK de MOVOPos termine de bajar en tu celular.
                      </p>
                    ) : (
                      <p className="mt-2 text-sm leading-7 text-slate-600">{step.description}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-16 sm:py-24">
        <div className="container px-4 md:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Una app para administrar ventas, inventario y facturación
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              MOVOPos centraliza las tareas diarias de una app para administrar negocio: vender,
              facturar, controlar productos y revisar resultados desde Android.
            </p>
          </div>

          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {appUses.map((item) => {
              const Icon = item.icon
              return (
                <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-violet-100">
                    <Icon className="h-5 w-5 text-violet-700" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="container px-4 md:px-6">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <div className="inline-flex items-center rounded-lg bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
                <Store className="mr-2 h-4 w-4" />
                Negocios y emprendedores
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                App para negocios, tiendas y emprendedores
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Si buscas una app para negocios, app para tiendas o app para controlar negocio,
                MOVOPos ayuda a organizar ventas, productos, facturas, clientes y reportes sin
                depender de hojas sueltas.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {businessTypes.map((type) => (
                <div key={type} className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                  {type}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-950 py-16 text-white sm:py-24">
        <div className="container px-4 md:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="inline-flex items-center rounded-lg bg-white/10 px-3 py-1 text-sm font-medium text-white">
                <TabletSmartphone className="mr-2 h-4 w-4" />
                Celular y tablet Android
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Punto de venta para celular y tablet Android
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">
                Usa MOVOPos como punto de venta para celular, punto de venta para tablet, sistema
                POS tablet o sistema móvil POS. La app está pensada para vender desde Android en el
                mostrador, en ruta o donde atiendas clientes.
              </p>
            </div>
            <div className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10 sm:p-6">
              <Image
                src="/pos_en_tablet.png"
                alt="Punto de venta para tablet Android con MOVOPos"
                width={1400}
                height={900}
                className="mx-auto h-auto max-h-[430px] w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="container px-4 md:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-start">
            <div>
              <div className="inline-flex items-center rounded-lg bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800">
                <Boxes className="mr-2 h-4 w-4" />
                Inventario y stock
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                App de inventario para controlar productos y stock
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                MOVOPos funciona como app de inventario y app control de inventario para negocios
                que necesitan saber qué tienen disponible, qué se vendió y qué productos requieren
                reposición.
              </p>
            </div>
            <div className="grid gap-3">
              {inventoryFeatures.map((feature) => (
                <div key={feature} className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  <PackageCheck className="mr-2 h-4 w-4 text-violet-600" />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-12 text-center text-3xl font-bold text-slate-950">
              Preguntas frecuentes sobre la app para ventas e inventario
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {faqItems.map((item) => (
                <article key={item.question} className="rounded-lg border border-slate-200 bg-slate-50 p-6">
                  <h3 className="font-semibold text-slate-950">{item.question}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-violet-900 py-16 text-white sm:py-20">
        <div className="container px-4 text-center md:px-6">
          <h2 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">
            Administra tu negocio desde Android
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-8 text-violet-100">
            Descarga la app, crea tu cuenta gratis y empieza a registrar ventas, facturar en RD$ y
            controlar inventario desde celular o tablet.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              className="h-14 bg-white px-8 text-base font-semibold text-violet-900 hover:bg-slate-100"
              asChild
            >
              <a href={appDownloadUrl}>
                <Download className="mr-2 h-5 w-5" />
                Descargar app para Android
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 border-violet-300 bg-transparent px-8 text-base font-semibold text-white hover:bg-violet-800"
              asChild
            >
              <Link href="/app">Crear cuenta gratis</Link>
            </Button>
          </div>
          <div className="mt-6 flex items-center justify-center text-sm text-violet-100">
            <ShieldCheck className="mr-2 h-5 w-5 text-emerald-300" />
            Descarga directa y segura para Android
          </div>
        </div>
      </section>

      <MobileStickyDownloadCTA />
      <div className="h-20 md:hidden" aria-hidden="true" />
    </>
  )
}
