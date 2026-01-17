import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function CTASection() {
  return (
    <section 
      className="py-24 sm:py-32"
      style={{
        background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
      }}
    >
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            ¿Listo para comenzar?
          </h2>
          <p className="mt-6 text-xl leading-8 text-white/90">
            Únete a cientos de negocios que ya están usando Tejada POS para gestionar sus ventas e inventario.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Button asChild size="lg" className="bg-white text-gray-900 hover:bg-gray-100 font-semibold">
              <Link href="/pricing">
                Ver Planes
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-2 border-white text-white bg-transparent hover:bg-white/10 hover:text-white">
              <Link href="/app">Probar Ahora</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}


