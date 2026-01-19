/* eslint-disable @next/next/no-img-element */
"use client"

export function POSDemoSection() {
  return (
    <section className="py-12 sm:py-16 bg-gradient-to-b from-white via-gray-50/50 to-white">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center mb-10">
          <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Factura de la forma que prefieras
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            Dos modos de visualización para adaptarse a tu estilo de trabajo
          </p>
        </div>

        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-20 items-start">
            {/* Modo Lista */}
            <div className="flex flex-col group">
              <div className="mb-6">
                <h3 className="text-3xl font-bold text-foreground mb-3">
                  Modo Lista
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Visualización tradicional en formato tabla. Perfecto para búsquedas rápidas y gestión eficiente de productos.
                </p>
              </div>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200/80 bg-white transform transition-transform duration-300 group-hover:scale-[1.02]">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-blue-500/5 pointer-events-none z-0"></div>
                <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white/80 to-transparent pointer-events-none z-20"></div>
                <img
                  src="/ventatipolista.gif"
                  alt="Proceso de facturación en modo lista"
                  className="w-full h-auto relative z-10"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Modo Imágenes */}
            <div className="flex flex-col group">
              <div className="mb-6">
                <h3 className="text-3xl font-bold text-foreground mb-3">
                  Modo Imágenes
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Vista visual con fotos de productos. Ideal para tiendas donde la imagen del producto es clave en la venta.
                </p>
              </div>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200/80 bg-white transform transition-transform duration-300 group-hover:scale-[1.02]">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-pink-500/5 pointer-events-none z-0"></div>
                <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white/80 to-transparent pointer-events-none z-20"></div>
                <img
                  src="/ventatipoimagenes.gif"
                  alt="Proceso de facturación en modo imágenes"
                  className="w-full h-auto relative z-10"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-lg text-muted-foreground">
              Cambia entre modos en cualquier momento según tus necesidades
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
