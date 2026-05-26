import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, LaptopMinimal, Cloud, Printer, Users } from "lucide-react"
import { Button } from "@/components/ui/button"

const items = [
  {
    title: "Desde cualquier dispositivo",
    description: "Accede a tu sistema desde laptop, tablet o celular con conexión a internet.",
    icon: LaptopMinimal,
  },
  {
    title: "Datos en la nube",
    description: "Revisa ventas e inventario sin depender de una sola computadora en el negocio.",
    icon: Cloud,
  },
  {
    title: "Impresión térmica",
    description: "Mantén una operación ágil en caja con soporte para impresoras térmicas.",
    icon: Printer,
  },
  {
    title: "Trabajo en equipo",
    description: "Agrega usuarios con permisos para ventas, administración e inventario.",
    icon: Users,
  },
]

export const metadata: Metadata = {
  title: "Facturación online | MOVOPos",
  description:
    "Facturación online para negocios en República Dominicana. Factura en la nube, controla inventario y vende desde cualquier dispositivo con MOVOPos.",
  alternates: {
    canonical: "/facturacion-online",
  },
}

export default function FacturacionOnlinePage() {
  return (
    <div className="py-16 sm:py-24">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Facturación online para negocios que necesitan flexibilidad
          </h1>
          <p className="mt-6 text-xl text-muted-foreground">
            Si buscas facturación online en República Dominicana, MOVOPos te permite vender,
            facturar y revisar inventario desde cualquier dispositivo conectado. Muchas empresas
            llegan aquí comparando un software de facturacion, software facturacion, un programa de
            facturacion o un programa facturacion para operar mejor.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/app">
                Probar ahora
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/precios">Ver precios</Link>
            </Button>
          </div>
        </div>

        <section className="mx-auto mt-16 max-w-6xl">
          <div className="grid gap-6 md:grid-cols-2">
            {items.map((item) => {
              const Icon = item.icon
              return (
                <article key={item.title} className="rounded-3xl border bg-white p-8 shadow-sm">
                  <Icon className="h-8 w-8 text-violet-700" />
                  <h2 className="mt-5 text-2xl font-semibold text-foreground">{item.title}</h2>
                  <p className="mt-3 text-base text-muted-foreground">{item.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl text-center">
          <h2 className="text-3xl font-semibold text-foreground">
            Ideal para negocios que no quieren depender de instalaciones complejas
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            La facturación online te ayuda a operar con más libertad, revisar tu negocio a
            distancia y mantener el control comercial sin procesos pesados ni herramientas
            dispersas, especialmente si necesitas un programa para hacer facturas o un programa
            para facturar con acceso desde cualquier lugar.
          </p>
        </section>
      </div>
    </div>
  )
}
