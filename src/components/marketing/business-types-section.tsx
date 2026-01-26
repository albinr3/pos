/* eslint-disable @next/next/no-img-element */
"use client"

import { Store, Car, Wrench, Shirt, Scissors, Home, GlassWater } from "lucide-react"

const businessTypes = [
  { name: "Colmados", icon: Store },
  { name: "Auto Adorno", icon: Car },
  { name: "Repuestos", icon: Wrench },
  { name: "Tienda de Ropa", icon: Shirt },
  { name: "Salones", icon: Scissors },
  { name: "Tienda de Hogar", icon: Home },
  { name: "Tienda de Bebidas", icon: GlassWater },
]

export function BusinessTypesSection() {
  return (
    <section 
      className="py-16 sm:py-24"
      style={{
        background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
      }}
    >
      <div className="container">
        {/* Encabezado */}
        <div className="mx-auto max-w-3xl text-center mb-12 sm:mb-16">
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl mb-6">
            Perfecto para cualquier tipo de negocio
          </h2>
          <p className="text-xl text-white/90 leading-relaxed">
            MOVOPos se adapta a negocios en República Dominicana: colmados, auto adornos, repuestos, tiendas de ropa, salones, hogar y más, con las funciones que necesitas para crecer.
          </p>
        </div>

        {/* Lista de Tipos de Negocios */}
        <div className="mx-auto max-w-5xl mb-16 sm:mb-20">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 sm:gap-6">
            {businessTypes.map((business) => {
              const Icon = business.icon
              return (
                <div
                  key={business.name}
                  className="flex flex-col items-center p-4 sm:p-6 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                >
                  <div className="mb-3 sm:mb-4 p-3 rounded-lg bg-white/20">
                    <Icon className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                  </div>
                  <p className="text-sm sm:text-base font-medium text-white text-center leading-tight">
                    {business.name}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Galería de Imágenes */}
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12 items-start">
            {/* Imagen Colmadero */}
            <div className="flex flex-col group">
              <div className="mb-6">
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                  Colmados
                </h3>
                <p className="text-lg text-white/90 leading-relaxed">
                  Gestión eficiente de inventario y ventas para colmados. Control total de productos, precios y facturación desde cualquier dispositivo.
                </p>
              </div>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-white transform transition-transform duration-300 group-hover:scale-[1.02] group-hover:shadow-3xl">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10 pointer-events-none z-0"></div>
                <img
                  src="/colmadero.png"
                  alt="Colmadero usando MOVOPos en laptop para gestionar su negocio"
                  className="w-full h-auto relative z-10"
                  decoding="async"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Imagen Auto Adorno */}
            <div className="flex flex-col group">
              <div className="mb-6">
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                  Auto Adorno
                </h3>
                <p className="text-lg text-white/90 leading-relaxed">
                  Sistema completo para tiendas de auto adorno. Organiza tu inventario de accesorios, maneja clientes y cotizaciones profesionales.
                </p>
              </div>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-white transform transition-transform duration-300 group-hover:scale-[1.02] group-hover:shadow-3xl">
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-transparent to-purple-500/10 pointer-events-none z-0"></div>
                <img
                  src="/autoadorno.png"
                  alt="Dueño de auto adorno utilizando MOVOPos para administrar su tienda"
                  className="w-full h-auto relative z-10"
                  decoding="async"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Texto Final */}
        <div className="mt-12 sm:mt-16 text-center">
          <p className="text-lg sm:text-xl text-white/90 font-medium">
            Negocios de todo el país confían en MOVOPos para gestionar sus ventas diarias en República Dominicana
          </p>
        </div>
      </div>
    </section>
  )
}
