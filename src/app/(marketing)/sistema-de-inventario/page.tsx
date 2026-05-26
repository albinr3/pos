import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Boxes, PackageSearch, ChartColumn, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

const blocks = [
  {
    title: "Control de stock",
    description: "Consulta existencias, movimientos y productos con baja rotación desde un solo lugar.",
    icon: Boxes,
  },
  {
    title: "Compras y reposición",
    description: "Organiza compras y evita quedarte sin mercancía en momentos de alta demanda.",
    icon: PackageSearch,
  },
  {
    title: "Reportes claros",
    description: "Detecta qué productos giran más y cuáles te inmovilizan capital.",
    icon: ChartColumn,
  },
  {
    title: "Menos errores manuales",
    description: "Mantén el inventario alineado con tus ventas y devoluciones diarias.",
    icon: ShieldCheck,
  },
]

export const metadata: Metadata = {
  title: "Sistema de inventario | MOVOPos",
  description:
    "Sistema de inventario para negocios en República Dominicana. Controla stock, compras, productos y movimientos en tiempo real con MOVOPos.",
  alternates: {
    canonical: "/sistema-de-inventario",
  },
}

export default function SistemaDeInventarioPage() {
  return (
    <div className="py-16 sm:py-24">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Sistema de inventario para controlar tu mercancía sin complicarte
          </h1>
          <p className="mt-6 text-xl text-muted-foreground">
            Lleva inventario, compras y productos en tiempo real con una solución pensada para
            negocios en República Dominicana que también necesitan facturación y punto de venta. Si
            estás buscando un programa de inventario, software de inventario o incluso software
            inventario para tu operación diaria, esta página va directo a esa necesidad.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/precios">
                Ver plan
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/">Ver sistema de facturación</Link>
            </Button>
          </div>
        </div>

        <section className="mx-auto mt-16 max-w-6xl">
          <div className="grid gap-6 md:grid-cols-2">
            {blocks.map((block) => {
              const Icon = block.icon
              return (
                <article key={block.title} className="rounded-3xl border bg-white p-8 shadow-sm">
                  <Icon className="h-8 w-8 text-violet-700" />
                  <h2 className="mt-5 text-2xl font-semibold text-foreground">{block.title}</h2>
                  <p className="mt-3 text-base text-muted-foreground">{block.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl rounded-3xl bg-slate-50 p-8 sm:p-10">
          <h2 className="text-3xl font-semibold text-foreground">
            Más que inventario: una operación conectada
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Un sistema de inventario aislado se queda corto. MOVOPos conecta inventario con ventas,
            devoluciones, cuentas por cobrar y reportes para que tus números reflejen la realidad
            del negocio, tanto si buscas software para inventarios, software para inventarios de
            almacén, programas para inventarios o un sistema de control de inventarios más completo.
          </p>
        </section>
      </div>
    </div>
  )
}
