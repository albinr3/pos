import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Download, Smartphone, WifiOff, Printer, BarChart3, ShieldCheck } from "lucide-react"

export const metadata: Metadata = {
  title: "Descargar MOVOPos App Móvil Android | Punto de Venta Celular",
  description:
    "Descarga el APK de la aplicación móvil de MOVOPos para Android. Factura, controla inventario y saca reportes desde tu celular en República Dominicana con o sin internet.",
  alternates: {
    canonical: "/app-movil",
  },
  openGraph: {
    title: "Descargar MOVOPos App Móvil Android | Punto de Venta",
    description:
      "Convierte tu smartphone Android en un potente punto de venta. Factura, cuadra caja y controla tu negocio desde donde estés.",
    url: "/app-movil",
    images: [
      {
        url: "/pos-mobile-app-mockup.png",
        width: 1200,
        height: 630,
        alt: "Mockup de la App Móvil de MOVOPos",
      },
    ],
  },
  twitter: {
    title: "Descargar MOVOPos App Móvil Android | Punto de Venta",
    description:
      "Convierte tu smartphone Android en un potente punto de venta. Factura, cuadra caja y controla tu negocio desde donde estés.",
    images: ["/pos-mobile-app-mockup.png"],
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "MOVOPos App Móvil",
  "operatingSystem": "ANDROID",
  "applicationCategory": "BusinessApplication",
  "downloadUrl": "https://movopos.com/downloads/movopos-app.apk",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "DOP"
  },
  "description": "Aplicación de punto de venta e inventario para negocios en República Dominicana. Facturación offline y en la nube."
}

const features = [
  {
    title: "Modo Offline",
    description: "Sigue facturando incluso si se cae el internet. El sistema se sincronizará automáticamente cuando vuelvas a tener conexión.",
    icon: WifiOff,
  },
  {
    title: "Impresión Bluetooth",
    description: "Conecta tu impresora térmica portátil por Bluetooth y entrega recibos a tus clientes al instante desde tu celular.",
    icon: Printer,
  },
  {
    title: "Cuadre de Caja Simplificado",
    description: "Cierra tu día en segundos. Visualiza tus cobros, gastos y ventas totales organizados por método de pago.",
    icon: BarChart3,
  },
  {
    title: "Ventas y Devoluciones",
    description: "Gestiona ventas, abonos a crédito y devoluciones rápidamente desde una interfaz diseñada para velocidad celular.",
    icon: Smartphone,
  },
]

export default function AppMovilPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white/50 py-16 sm:py-24 lg:py-32">
        <div className="absolute inset-0 bg-violet-50/50 -z-10" />
        <div className="container px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div className="flex flex-col justify-center space-y-8">
              <div className="space-y-4">
                <div className="inline-flex items-center rounded-lg bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800">
                  <Smartphone className="mr-2 h-4 w-4" />
                  Disponible para Android
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl xl:text-6xl/none text-slate-900">
                  Tu negocio en la palma de tu mano
                </h1>
                <p className="max-w-[600px] text-lg text-slate-600 sm:text-xl">
                  Descarga la aplicación POS móvil de MOVOPos. Factura en RD$, controla inventario y visualiza reportes desde tu celular con total libertad.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="h-14 px-8 text-base font-semibold shadow-lg bg-violet-600 hover:bg-violet-700 w-full sm:w-auto" asChild>
                  <a href="/downloads/movopos-app.apk" download>
                    <Download className="mr-2 h-5 w-5" />
                    Descargar APK Directo
                  </a>
                </Button>
                <div className="flex items-center text-sm text-slate-500 justify-center">
                  <ShieldCheck className="mr-2 h-5 w-5 text-emerald-500" />
                  Descarga 100% segura
                </div>
              </div>
              
              <div className="flex flex-col space-y-4 pt-4 border-t border-slate-200">
                <ul className="grid sm:grid-cols-2 gap-3">
                  {["Sin anuncios", "Actualizaciones gratis", "Fácil instalación", "No requiere PlayStore"].map((item) => (
                    <li key={item} className="flex items-center">
                      <CheckCircle2 className="mr-2 h-4 w-4 text-violet-600" />
                      <span className="text-sm text-slate-700 font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            <div className="flex items-center justify-center lg:justify-end relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-violet-100 to-transparent rounded-3xl transform rotate-3 scale-105 -z-10" />
              <div className="relative w-full max-w-sm drop-shadow-2xl">
                <Image
                  src="/pos_en_app_android.png"
                  alt="MOVOPos Aplicación Móvil en Smartphone Android"
                  width={600}
                  height={800}
                  className="rounded-3xl object-contain object-center"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 sm:py-32 bg-slate-50">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Diseñada para la velocidad de tu local
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              No dejes que tu sistema te frene. Nuestra app está optimizada para que atiendas rápido, sin depender al 100% de la conexión a internet.
            </p>
          </div>
          
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
            {features.map((feature, i) => (
              <div key={i} className="relative flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-100">
                  <feature.icon className="h-6 w-6 text-violet-700" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-slate-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tablet Preview Section */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-8 shadow-sm">
              <Image
                src="/pos_en_tablet.png"
                alt="MOVOPos en tablet Android"
                width={1400}
                height={900}
                className="w-full h-auto max-h-[420px] mx-auto rounded-2xl object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Installation Guide Section */}
      <section className="py-20 bg-white">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold text-center mb-12">¿Cómo instalar el APK?</h2>
            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 group-[.is-active]:bg-violet-600 text-slate-500 group-[.is-active]:text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                  1
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-2xl border shadow-sm">
                  <h3 className="font-bold text-lg text-slate-900">Descarga el archivo</h3>
                  <p className="text-sm text-slate-600 mt-2">Haz clic en el botón de descarga arriba. Se bajará un archivo .apk en tu celular.</p>
                </div>
              </div>
              
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 group-[.is-active]:bg-violet-600 text-slate-500 group-[.is-active]:text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                  2
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-2xl border shadow-sm">
                  <h3 className="font-bold text-lg text-slate-900">Permitir fuentes desconocidas</h3>
                  <p className="text-sm text-slate-600 mt-2">Al abrir el APK te pedirá permisos para instalar apps de Chrome o tus archivos. Dale &quot;Permitir&quot; para continuar.</p>
                </div>
              </div>
              
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 group-[.is-active]:bg-violet-600 text-slate-500 group-[.is-active]:text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                  3
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-2xl border shadow-sm">
                  <h3 className="font-bold text-lg text-slate-900">Instalar y Listo</h3>
                  <p className="text-sm text-slate-600 mt-2">Acepta la instalación. Una vez finalice, entra con tu correo y contraseña registrados. ¡Ya puedes facturar!</p>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 bg-violet-900 text-white">
        <div className="container px-4 md:px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
            Lleva el control de tu negocio contigo
          </h2>
          <p className="text-xl text-violet-200 mb-10 max-w-2xl mx-auto">
            ¿Aún no tienes cuenta? Regístrate en la web para obtener tus 15 días de prueba y usar el sistema tanto en tu PC como en tu celular.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button size="lg" className="h-14 px-8 text-base font-semibold bg-white text-violet-900 hover:bg-slate-100" asChild>
              <a href="/downloads/movopos-app.apk" download>
                <Download className="mr-2 h-5 w-5" />
                Descargar la App
              </a>
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-8 text-base font-semibold border-violet-700 bg-transparent text-white hover:bg-violet-800" asChild>
              <Link href="/app">
                Crear cuenta gratis
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
