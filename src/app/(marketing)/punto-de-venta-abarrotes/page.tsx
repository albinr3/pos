import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Store, Barcode, Boxes, WalletCards } from "lucide-react"
import { Button } from "@/components/ui/button"

const sections = [
  {
    title: "Ventas rápidas en mostrador",
    description: "Cobra sin fricciones en negocios de alta rotación y mantén el flujo de caja en orden.",
    icon: Store,
  },
  {
    title: "Productos organizados",
    description: "Busca productos con rapidez y mantén mejor control de precios y referencias.",
    icon: Barcode,
  },
  {
    title: "Inventario para abarrotes",
    description: "Sigue existencias, reposición y movimientos para evitar faltantes en horas pico.",
    icon: Boxes,
  },
  {
    title: "Cobros y cuentas claras",
    description: "Registra pagos, ventas fiadas y movimientos del día en un solo sistema.",
    icon: WalletCards,
  },
]

export const metadata: Metadata = {
  title: "Punto de venta abarrotes | MOVOPos",
  description:
    "Punto de venta para abarrotes, colmados y tiendas en República Dominicana. Factura, controla inventario y cobra más rápido con MOVOPos.",
  alternates: {
    canonical: "/punto-de-venta-abarrotes",
  },
}

export default function PuntoDeVentaAbarrotesPage() {
  return (
    <div className="py-16 sm:py-24">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Punto de venta para abarrotes, colmados y tiendas de alta rotación
          </h1>
          <p className="mt-6 text-xl text-muted-foreground">
            MOVOPos ayuda a negocios que venden rápido y manejan mucho producto a facturar mejor,
            controlar inventario y mantener el día bajo control en República Dominicana. Es una
            opción útil si buscas un punto de venta para negocio, puntos de venta para negocios
            pequeños o un sistema de ventas para negocio que no complique la operación.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/pricing">
                Ver plan
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">Solicitar demo</Link>
            </Button>
          </div>
        </div>

        <section className="mx-auto mt-16 max-w-6xl">
          <div className="grid gap-6 md:grid-cols-2">
            {sections.map((section) => {
              const Icon = section.icon
              return (
                <article key={section.title} className="rounded-3xl border bg-white p-8 shadow-sm">
                  <Icon className="h-8 w-8 text-violet-700" />
                  <h2 className="mt-5 text-2xl font-semibold text-foreground">{section.title}</h2>
                  <p className="mt-3 text-base text-muted-foreground">{section.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl rounded-3xl bg-slate-50 p-8 sm:p-10">
          <h2 className="text-3xl font-semibold text-foreground">
            Pensado para operaciones con muchas ventas pequeñas
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Un punto de venta para abarrotes debe ser rápido, claro y fácil de usar. Por eso
            MOVOPos combina facturación, inventario y control comercial en una experiencia simple
            para el día a día, con funciones propias de un sistema de ventas y de un software de
            ventas e inventario que ayudan a sostener el ritmo del negocio.
          </p>
        </section>
      </div>
    </div>
  )
}
