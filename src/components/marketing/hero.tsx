import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function Hero() {
  return (
    <section
      className="relative overflow-hidden -mt-20 pb-12 sm:pb-16"
      style={{
        background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
      }}
    >
      <div className="container pt-28 sm:pt-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="text-center lg:text-left">
            <h1 className="text-5xl font-bold tracking-tight text-white sm:text-7xl">
              Sistema de facturación
              <span className="block mt-3 text-white">
                en República Dominicana
              </span>
            </h1>
            <p className="mt-8 text-xl leading-8 text-white/90 sm:text-2xl">
              Sistema de facturación en la nube para negocios en República Dominicana con un
              software de facturacion, sistema de ventas e inventario, cuentas por cobrar.
              Prueba gratis 15 días y administra ventas en RD$ desde cualquier
              dispositivo.
            </p>
            <div className="mt-10 flex items-center justify-center lg:justify-start gap-x-6">
              <Button asChild size="lg" className="bg-white text-gray-900 hover:bg-gray-100 font-semibold">
                <Link href="/app">
                  Comenzar prueba gratis
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-2 border-white text-white bg-transparent hover:bg-white/10 hover:text-white">
                <Link href="/sistema-pos">Ver sistema POS</Link>
              </Button>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <Image
              src="/hero-img.svg"
              alt="Sistema POS e Inventario"
              width={600}
              height={600}
              className="w-full max-w-lg h-auto"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  )
}


