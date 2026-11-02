import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  ArrowRight,
  Barcode,
  CheckCircle2,
  CloudCheck,
  CreditCard,
  Download,
  HelpCircle,
  MessageCircle,
  PackageCheck,
  Printer,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  WifiOff,
  Zap,
} from "lucide-react"
import { siteUrl } from "@/lib/site-url"
import { buildSupportWhatsAppUrl } from "@/lib/contact-info"

const canonicalPath = "/sistema-facturacion-tiendas-celulares"
const canonicalUrl = `${siteUrl}${canonicalPath}`
const appDownloadUrl = "https://pub-db000bf677ef4b89aebfffa3aea14be3.r2.dev/apk_movo/movo-release.apk"

const whatsappConsultationUrl = buildSupportWhatsAppUrl(
  "Hola, me interesa conocer más sobre el sistema en la nube de facturación para mi tienda de celulares y accesorios."
)

// SEO: Metadatos optimizados para la consulta principal y secundarias de alta conversión.
// Nota: layout.tsx ya añade '| MOVOPos' mediante template; no duplicar la marca aquí para evitar títulos repetidos.
// Evitamos la palabra "software" en el meta description priorizando "sistema en la nube".
export const metadata: Metadata = {
  title: "Sistema de Facturación para Tiendas de Celulares",
  description:
    "Sistema en la nube de punto de venta y facturación para tiendas de celulares y accesorios. Control de inventario, IMEI, caja, ventas y comprobantes en RD$.",
  keywords: [
    "sistema de facturacion para tiendas de celulares",
    "sistema para tienda de celulares",
    "punto de venta para tiendas de celulares",
    "punto de venta para celular",
    "sistema en la nube para celulares",
    "control de inventario por imei",
    "sistema pos para celulares",
    "facturacion tiendas de celulares republica dominicana",
    "programa de facturacion celulares y accesorios",
    "punto de venta celulares",
    "control de ventas celulares",
    "sistema para venta de accesorios de celular",
  ],
  alternates: {
    canonical: canonicalPath,
  },
  openGraph: {
    title: "Sistema de Facturación para Tiendas de Celulares | MOVOPos",
    description:
      "Controla el inventario de teléfonos por IMEI, vende accesorios con código de barras, imprime tickets y administra la caja de tu tienda de móviles en RD$.",
    url: canonicalPath,
    images: [
      {
        url: "/marketing/tienda-celulares-hero.jpg",
        width: 1200,
        height: 675,
        alt: "Sistema de facturación en la nube para tiendas de celulares MOVOPos",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sistema de Facturación para Tiendas de Celulares | MOVOPos",
    description:
      "Administra las ventas, inventario por IMEI y caja de tu tienda de celulares con un sistema en la nube rápido y fácil de usar en República Dominicana.",
    images: ["/marketing/tienda-celulares-hero.jpg"],
  },
}

// Datos estructurados Schema.org para aplicación empresarial
const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MOVOPos - Sistema de Facturación en la Nube para Tiendas de Celulares",
  operatingSystem: "Web, Android, Windows, macOS",
  applicationCategory: "BusinessApplication",
  url: canonicalUrl,
  image: `${siteUrl}/marketing/tienda-celulares-hero.jpg`,
  description:
    "Sistema en la nube de punto de venta y facturación para tiendas de celulares y accesorios en República Dominicana. Permite control de inventario por IMEI, ventas rápidas, tickets térmicos y cuadre de caja.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "DOP",
  },
}

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Inicio",
      item: siteUrl,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Sistema de Facturación para Tiendas de Celulares",
      item: canonicalUrl,
    },
  ],
}

const keyPillars = [
  {
    icon: Smartphone,
    title: "Control por IMEI y Serie",
    description:
      "Cada teléfono móvil es único. Registra cada equipo con su IMEI o número de serie para dar seguimiento exacto a garantías de clientes y proveedores sin equivocaciones.",
  },
  {
    icon: Barcode,
    title: "Catálogo ágil de Accesorios",
    description:
      "Organiza cargadores, cables, fundas, audífonos y protectores de pantalla. Escanea con lector de código de barras o busca en segundos al momento de cobrar.",
  },
  {
    icon: Receipt,
    title: "Facturación y Tickets en RD$",
    description:
      "Emite tickets en impresoras térmicas de 58mm y 80mm vía Bluetooth o USB. Factura con ITBIS o comprobantes fiscales y envía copias digitales por WhatsApp.",
  },
  {
    icon: TrendingUp,
    title: "Caja Diaria y Métodos de Pago",
    description:
      "Abre y cierra turnos de caja sin diferencias. Registra pagos en efectivo, transferencias locales (Banreservas, Popular, BHD) y tarjetas de crédito o débito.",
  },
]

const stepGuide = [
  {
    number: "01",
    title: "Crea tu cuenta e ingresa tus productos",
    description:
      "Regístrate en menos de dos minutos. Puedes dar de alta tus teléfonos con su IMEI, asignar precios y organizar tus accesorios por categorías y marcas.",
  },
  {
    number: "02",
    title: "Vende en mostrador o desde tu celular",
    description:
      "Selecciona el modelo de celular o escanea el accesorio. Elige si el cliente paga en efectivo, transferencia o tarjeta e imprime el ticket de venta al instante.",
  },
  {
    number: "03",
    title: "Cierra el día con números transparentes",
    description:
      "Revisa el cuadre de caja, el total de dinero recaudado y la ganancia neta del día. Sin cuadernos perdidos ni horas cuadrando cálculos a mano.",
  },
]

const comparisonRows = [
  {
    feature: "Control de inventario por IMEI",
    movopos: "Registro exacto por equipo y búsqueda instantánea",
    traditional: "Anotaciones en cuadernos propensas a errores y pérdidas",
  },
  {
    feature: "Velocidad de cobro en mostrador",
    movopos: "Segundos por cliente con lector de barra e impresora térmica",
    traditional: "Lenta escritura a mano de recibos y facturas en papel",
  },
  {
    feature: "Validación de garantías",
    movopos: "Búsqueda del IMEI para ver fecha de venta, cliente y proveedor",
    traditional: "Buscar recibos viejos en archivadores o libretas",
  },
  {
    feature: "Seguridad y control de caja",
    movopos: "Apertura y cierre por turno con auditoría contra descuadres",
    traditional: "Riesgo alto de faltantes de dinero al final de la jornada",
  },
  {
    feature: "Acceso remoto al negocio",
    movopos: "Consulta ventas y existencias desde tu móvil estés donde estés",
    traditional: "Dependencia total de estar físicamente en la tienda",
  },
]

const faqList = [
  {
    question: "¿Por qué MOVOPos es el sistema para tienda de celulares más recomendado?",
    answer:
      "MOVOPos reúne en una sola plataforma en la nube todo lo que necesita un negocio de telefonía: control de inventario por IMEI y serie, catálogo rápido para venta de accesorios con código de barras, impresión de tickets térmicos con garantía y cuadre de caja diario por turnos sin descuadres.",
  },
  {
    question: "¿Cómo agiliza este punto de venta para tiendas de celulares el cobro en mostrador?",
    answer:
      "Este punto de venta para tiendas de celulares te permite registrar cobros en segundos desde una computadora, tablet o celular Android. Puedes escanear accesorios, buscar smartphones por modelo o IMEI y procesar pagos mixtos en efectivo, tarjetas o transferencias bancarias en RD$.",
  },
  {
    question: "¿Cómo funciona el control de teléfonos celulares por IMEI en MOVOPos?",
    answer:
      "Al registrar o vender un teléfono inteligente, puedes ingresar su IMEI o número de serie en la referencia o nota del artículo. De este modo, el ticket de compra y el historial de ventas reflejan exactamente qué unidad física se entregó a cada cliente, facilitando el control de garantías y evitando fraudes.",
  },
  {
    question: "¿Puedo usar el sistema en mi computadora de mostrador y en el celular al mismo tiempo?",
    answer:
      "Sí. MOVOPos es un sistema en la nube multidispositivo. Puedes tener tu computadora o laptop en el mostrador principal para facturar con lector de códigos e impresora térmica, y al mismo tiempo consultar ventas o stock desde tu teléfono Android o tablet.",
  },
  {
    question: "¿Qué ocurre si se va el internet en la tienda de celulares?",
    answer:
      "La aplicación móvil de MOVOPos cuenta con modo sin conexión (offline). Te permite seguir cobrando y registrando ventas aunque se caiga el servicio de internet o falle la energía. En cuanto regresa la conexión, todos los datos se sincronizan automáticamente con la nube.",
  },
  {
    question: "¿Qué impresoras son compatibles para imprimir tickets de venta?",
    answer:
      "MOVOPos es compatible con impresoras térmicas de tickets estándar de 58 mm y 80 mm, tanto por conexión Bluetooth (desde celulares y tablets) como por cable USB o red local en computadoras.",
  },
  {
    question: "¿El sistema está adaptado a República Dominicana y monedas locales?",
    answer:
      "Totalmente. MOVOPos está configurado de manera nativa para operar en pesos dominicanos (RD$), permite configurar el ITBIS (18%) y gestionar pagos por transferencias de los bancos más comunes del país como Banreservas, Banco Popular y Banco BHD.",
  },
  {
    question: "¿Es necesario pagar una suscripción para empezar a probar el sistema?",
    answer:
      "No. Puedes crear tu cuenta gratis para probar las funciones del punto de venta e inventario. Solo requieres un correo para activar tu negocio y comenzar a ordenar tus ventas.",
  },
]

function MobileStickyCTA() {
  return (
    <aside
      aria-label="Acciones rápidas móviles"
      className="fixed inset-x-0 bottom-0 z-50 md:hidden bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 shadow-2xl"
    >
      <div className="flex items-center gap-2.5 max-w-md mx-auto">
        <Button
          size="lg"
          className="h-14 flex-1 bg-violet-600 hover:bg-violet-700 text-white text-base font-bold shadow-lg shadow-violet-600/30 active:scale-[0.98] transition-all rounded-xl"
          asChild
        >
          <Link href="/login" className="flex items-center justify-center gap-2">
            <span>Crear cuenta gratis</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          size="lg"
          className="h-14 w-14 p-0 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 active:scale-[0.98] transition-all shrink-0 rounded-xl flex items-center justify-center"
          asChild
        >
          <a
            href={whatsappConsultationUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Consultar por WhatsApp"
          >
            <MessageCircle className="h-6 w-6" />
          </a>
        </Button>
      </div>
    </aside>
  )
}

export default function SistemaFacturacionTiendasCelularesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 py-16 text-white sm:py-24 lg:py-28">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-600/20 via-transparent to-transparent" />
        <div className="container px-4 md:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col justify-center space-y-6">
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-violet-300 backdrop-blur-sm">
                <Sparkles className="h-4 w-4 text-violet-400" />
                <span>Sistema en la nube para tiendas de telefonía y accesorios</span>
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl lg:text-5xl leading-tight">
                Sistema de Facturación para Tiendas de Celulares y Accesorios
              </h1>

              <p className="max-w-[620px] text-base leading-relaxed text-slate-300 sm:text-lg">
                Organiza tu negocio con un sistema en la nube diseñado para el ritmo del mostrador.
                Controla teléfonos por IMEI o serie, factura en segundos, emite tickets térmicos en RD$ y
                cuadra tu caja diaria sin errores.
              </p>

              <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center pt-2">
                <Button
                  size="lg"
                  className="h-13 bg-violet-600 px-8 text-base font-semibold text-white shadow-lg hover:bg-violet-700 hover:shadow-violet-600/25"
                  className="h-16 w-full sm:w-auto bg-violet-600 px-8 sm:px-10 text-lg sm:text-xl font-bold text-white shadow-2xl shadow-violet-600/40 hover:bg-violet-700 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  asChild
                >
                  <Link href="/login">Crear cuenta gratis</Link>
                  <Link href="/login" className="flex items-center justify-center gap-2.5">
                    <span>Crear cuenta gratis</span>
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="h-13 border-slate-700 bg-slate-800/80 px-6 text-base font-medium text-white hover:bg-slate-800 hover:text-white"
                  className="h-16 w-full sm:w-auto border-2 border-slate-700 bg-slate-800/90 px-7 sm:px-9 text-base sm:text-lg font-semibold text-white hover:bg-slate-700 hover:border-slate-500 hover:text-white transition-all"
                  asChild
                >
                  <a
                    href={whatsappConsultationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2.5"
                  >
                    Hablar con un asesor
                    <MessageCircle className="h-5 w-5 text-emerald-400" />
                    <span>Hablar con un asesor</span>
                  </a>
                </Button>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs sm:text-sm text-slate-300 font-medium">
                  <div className="flex items-center gap-2">
                    <CloudCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>100% en la nube</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <WifiOff className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>Funciona offline</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Barcode className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>Control IMEI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Printer className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>Tickets en RD$</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-violet-500/10">
                <Image
                  src="/marketing/tienda-celulares-hero.jpg"
                  alt="Dependiente en mostrador de tienda de celulares utilizando el sistema de facturación en la nube MOVOPos para registrar una venta"
                  width={900}
                  height={506}
                  className="w-full h-auto object-cover transform transition-transform duration-500 hover:scale-105"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PILARES DEL SECTOR CELULARES */}
      <section className="bg-slate-50 py-16 sm:py-24">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Sistema para tienda de celulares: ¿por qué necesitas una solución especializada?
            </h2>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              Vender tecnología exige un punto de venta para tiendas de celulares rápido en el mostrador,
              control milimétrico de teléfonos por IMEI y una administración clara de cientos de accesorios y repuestos.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {keyPillars.map((pillar) => {
              const Icon = pillar.icon
              return (
                <div
                  key={pillar.title}
                  className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-violet-200"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{pillar.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{pillar.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* SECCIÓN INVENTARIO POR IMEI CON IMAGEN */}
      <section className="py-16 sm:py-24 bg-white border-t border-slate-100">
        <div className="container px-4 md:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1 relative rounded-2xl overflow-hidden border border-slate-200 shadow-xl">
              <Image
                src="/marketing/inventario-imei-celulares.jpg"
                alt="Lector escaneando etiqueta con código de barras e IMEI en la caja de un teléfono celular para control de inventario"
                width={800}
                height={533}
                className="w-full h-auto object-cover"
              />
            </div>

            <div className="order-1 lg:order-2 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
                <Barcode className="h-4 w-4" />
                <span>Gestión de Stock Confiable</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Control de inventario por IMEI, número de serie y códigos de barra
              </h2>
              <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
                Despídete de las confusiones al vender celulares. Cada teléfono queda identificado con
                sus datos únicos para que sepas en todo momento qué unidades tienes en vitrina, cuáles
                has vendido y a quién se las entregaste.
              </p>

              <ul className="space-y-3 pt-2">
                {[
                  "Trazabilidad completa para hacer valer garantías con suplidores y clientes.",
                  "Alertas automáticas de stock mínimo en cargadores, cables y accesorios de alta demanda.",
                  "Búsqueda instantánea en caja por nombre, modelo, marca o código de barra.",
                  "Actualización de inventario en tiempo real con cada venta realizada.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
                    <span className="text-sm sm:text-base text-slate-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN FACTURACIÓN Y TICKETS CON IMAGEN */}
      <section className="py-16 sm:py-24 bg-slate-50 border-t border-slate-200">
        <div className="container px-4 md:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-lg bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
                <Printer className="h-4 w-4" />
                <span>Cobro Rápido en el Punto de Venta</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Facturación ágil en mostrador: imprime tickets térmicos y factura en RD$
              </h2>
              <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
                Atiende a más clientes en menos tiempo. MOVOPos genera recibos térmicos limpios y
                profesionales con los datos de tu tienda, el detalle del equipo adquirido y las
                condiciones de garantía.
              </p>

              <div className="grid gap-4 pt-2">
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4">
                  <Printer className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">
                      Impresión térmica Bluetooth y USB
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      Compatible con impresoras de 58 mm y 80 mm para imprimir desde tu celular, tablet o PC.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4">
                  <CreditCard className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">
                      Múltiples métodos de pago
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      Registra cobros en efectivo, transferencias bancarias y tarjetas dividiendo el pago si es necesario.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4">
                  <Zap className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">
                      Cotizaciones rápidas por WhatsApp
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      Envía cotizaciones formales a tus clientes directamente a su WhatsApp con un solo clic.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-xl">
              <Image
                src="/marketing/mostrador-entrega-ticket-celular.jpg"
                alt="Vendedora entregando ticket de venta impreso y teléfono celular nuevo a cliente en mostrador"
                width={800}
                height={533}
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FLUJO DE TRABAJO EN 3 PASOS */}
      <section className="py-16 sm:py-24 bg-white border-t border-slate-100">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Comienza a operar tu tienda de celulares en 3 pasos
            </h2>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              La transición de un cuaderno o Excel a un sistema en la nube nunca fue tan fácil.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {stepGuide.map((step) => (
              <div
                key={step.number}
                className="relative flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-7 shadow-sm transition hover:shadow-md"
              >
                <span className="text-4xl font-extrabold text-violet-600/30 mb-4">
                  {step.number}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TABLA COMPARATIVA EXCEL/LIBRETAS VS MOVOPOS */}
      <section className="py-16 sm:py-24 bg-slate-900 text-white">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              ¿Por qué dejar los cuadernos y hojas de Excel?
            </h2>
            <p className="mt-4 text-lg text-slate-300 leading-relaxed">
              Comparativa directa entre la gestión tradicional y la automatización con un sistema en la nube.
            </p>
          </div>

          <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm sm:text-base">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-300">
                    <th className="p-4 sm:p-5 font-semibold">Aspecto Operativo</th>
                    <th className="p-4 sm:p-5 font-semibold text-violet-400">Con MOVOPos</th>
                    <th className="p-4 sm:p-5 font-semibold text-slate-400">Cuaderno o Excel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-300">
                  {comparisonRows.map((row) => (
                    <tr key={row.feature} className="hover:bg-slate-900/40 transition">
                      <td className="p-4 sm:p-5 font-medium text-white">{row.feature}</td>
                      <td className="p-4 sm:p-5 text-violet-200">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-violet-400 shrink-0" />
                          <span>{row.movopos}</span>
                        </div>
                      </td>
                      <td className="p-4 sm:p-5 text-slate-400">{row.traditional}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* PREGUNTAS FRECUENTES (FAQ) */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-lg bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 mb-3">
              <HelpCircle className="h-4 w-4" />
              <span>Resolvemos tus dudas</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Preguntas Frecuentes sobre el Sistema para Celulares
            </h2>
            <p className="mt-3 text-slate-600">
              Conoce cómo MOVOPos se adapta a la operación cotidiana de tu negocio.
            </p>
          </div>

          <div className="mx-auto max-w-3xl">
            <Accordion type="single" collapsible className="w-full space-y-4">
              {faqList.map((faq, index) => (
                <AccordionItem
                  key={faq.question}
                  value={`faq-${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 px-5 shadow-sm"
                >
                  <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline hover:text-violet-700 py-4">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-600 leading-relaxed pb-4 pt-1 text-sm sm:text-base">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 text-white">
      <section className="py-20 sm:py-24 bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 text-white mb-16 md:mb-0">
        <div className="container px-4 md:px-6 text-center">
          <div className="mx-auto max-w-2xl space-y-6">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
              Lleva el control total de tu tienda de celulares hoy
            </h2>
            <p className="text-lg text-violet-100 leading-relaxed">
            <p className="text-lg sm:text-xl text-violet-100 leading-relaxed">
              Empieza a facturar en minutos, organiza tus teléfonos por IMEI y cuida el dinero de tu caja.
              Sin contratos forzosos ni complicaciones técnicas.
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-2">
            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
              <Button
                size="lg"
                className="h-13 bg-white text-violet-900 font-bold hover:bg-slate-100 shadow-xl"
                className="h-16 px-10 text-lg sm:text-xl bg-white text-violet-950 font-extrabold hover:bg-slate-100 shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                asChild
              >
                <Link href="/login">Crear cuenta gratis</Link>
                <Link href="/login" className="flex items-center justify-center gap-2.5">
                  <span>Crear cuenta gratis</span>
                  <ArrowRight className="h-5 w-5 text-violet-900" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-13 border-white/40 bg-transparent text-white font-semibold hover:bg-white/10"
                className="h-16 px-9 text-base sm:text-lg border-2 border-white/60 bg-white/10 text-white font-bold hover:bg-white/20 backdrop-blur-sm transition-all"
                asChild
              >
                <a
                  href={whatsappConsultationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2.5"
                >
                  Consultar por WhatsApp
                  <MessageCircle className="h-5 w-5 text-emerald-300" />
                  <span>Consultar por WhatsApp</span>
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* STICKY CTA PARA DISPOSITIVOS MÓVILES */}
      <MobileStickyCTA />
    </>
  )
}

