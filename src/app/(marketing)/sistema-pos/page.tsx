import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2, ShoppingCart, CreditCard, ReceiptText } from "lucide-react"
import { Button } from "@/components/ui/button"

const benefits = [
  "Facturación rápida para ventas de mostrador",
  "Cobros con efectivo, transferencia y otras formas de pago",
  "Historial de clientes y cuentas por cobrar",
  "Reportes para entender qué vendes y cuándo vendes más",
]

const features = [
  {
    title: "Caja rápida",
    description: "Vende con un flujo simple para reducir filas y cobrar más rápido.",
    icon: ShoppingCart,
  },
  {
    title: "Cobros organizados",
    description: "Registra pagos y mantén tus ventas claras en cada turno.",
    icon: CreditCard,
  },
  {
    title: "Facturas y comprobantes",
    description: "Imprime comprobantes térmicos y mantén control de cada transacción.",
    icon: ReceiptText,
  },
]

export const metadata: Metadata = {
  title: "Sistema POS | MOVOPos",
  description:
    "Sistema POS para negocios en República Dominicana. Vende más rápido, cobra mejor y conecta tu punto de venta con inventario y facturación.",
  alternates: {
    canonical: "/sistema-pos",
  },
}

export default function SistemaPOSPage() {
  return (
    <div className="py-16 sm:py-24">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Sistema POS para vender con más velocidad y control
          </h1>
          <p className="mt-6 text-xl text-muted-foreground">
            MOVOPos combina punto de venta, sistema de facturación e inventario en una sola
            plataforma para negocios en República Dominicana. Si estás comparando un sistema punto
            de venta, un programa punto de venta, un punto de venta para negocio o incluso un punto
            de venta online, aquí tienes una solución completa.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/pricing">
                Ver precio
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">Hablar con ventas</Link>
            </Button>
          </div>
        </div>

        <section className="mx-auto mt-16 max-w-5xl rounded-3xl border bg-white p-8 shadow-sm sm:p-10">
          <h2 className="text-3xl font-semibold text-foreground">Qué incluye el sistema POS</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
                <p className="text-base text-muted-foreground">{benefit}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-6xl">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <article key={feature.title} className="rounded-3xl border bg-slate-50 p-6">
                  <Icon className="h-8 w-8 text-violet-700" />
                  <h2 className="mt-5 text-2xl font-semibold text-foreground">{feature.title}</h2>
                  <p className="mt-3 text-base text-muted-foreground">{feature.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl text-center">
          <h2 className="text-3xl font-semibold text-foreground">
            Un punto de venta conectado con tu operación real
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Si buscas un sistema POS, normalmente también necesitas control de inventario,
            clientes, compras y reportes. MOVOPos une todo para que no dependas de herramientas
            separadas, especialmente si estás evaluando puntos de venta para negocios pequeños que
            quieren crecer con más orden.
          </p>
        </section>
      </div>
    </div>
  )
}
