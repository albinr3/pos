/* eslint-disable @next/next/no-img-element */
"use client"

import Link from "next/link"
import {
  Store,
  Car,
  Wrench,
  Shirt,
  Scissors,
  Home,
  GlassWater,
  Smartphone,
} from "lucide-react"

const businessTypes = [
  { name: "Tiendas de Celulares", icon: Smartphone, href: "/sistema-facturacion-tiendas-celulares" },
  { name: "Colmados", icon: Store },
  { name: "Auto Adornos", icon: Car },
  { name: "Repuestos", icon: Wrench },
  { name: "Tiendas de Ropa", icon: Shirt },
  { name: "Salones", icon: Scissors },
  { name: "Tiendas de Hogar", icon: Home },
  { name: "Tiendas de Bebidas", icon: GlassWater },
]

export function BusinessTypesSection() {
  return (
    <section
      className="py-16 sm:py-24"
      style={{
        background:
          "linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)",
      }}
    >
      <div className="container">
        <div className="mx-auto max-w-3xl text-center mb-12 sm:mb-16">
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl mb-6">
            Sistema POS para diferentes tipos de negocios en República Dominicana
          </h2>
          <p className="text-xl text-white/90 leading-relaxed">
            MOVOPos se adapta a la forma de vender de cada sector: colmados, repuestos,
            ferreterías, farmacias, ropa y más. Elige tu industria y mira cómo aplicar el sistema
            en tu negocio.
          </p>
        </div>

        <div className="mx-auto max-w-6xl mb-16 sm:mb-20">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 sm:gap-6">
            {businessTypes.map((business) => {
              const Icon = business.icon
              const content = (
                <div className="flex flex-col items-center p-4 sm:p-5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-lg h-full">
                  <div className="mb-3 sm:mb-4 p-3 rounded-lg bg-white/20">
                    <Icon className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                  </div>
                  <p className="text-sm sm:text-base font-medium text-white text-center leading-tight">
                    {business.name}
                  </p>
                </div>
              )

              if ("href" in business && business.href) {
                return (
                  <Link key={business.name} href={business.href} className="block">
                    {content}
                  </Link>
                )
              }

              return (
                <div key={business.name}>
                  {content}
                </div>
              )
            })}
          </div>
        </div>

        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-8 items-start">
            <Link href="/sistema-facturacion-tiendas-celulares" className="flex flex-col group block">
              <div className="mb-6">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white mb-2">
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Especializado</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">Tiendas de Celulares</h3>
                <p className="text-lg text-white/90 leading-relaxed">
                  Control por IMEI, inventario de accesorios y facturación rápida de teléfonos en mostrador con tickets en RD$.
                </p>
              </div>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-white transform transition-transform duration-300 group-hover:scale-[1.02] group-hover:shadow-3xl">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 via-transparent to-purple-500/20 pointer-events-none z-0"></div>
                <img
                  src="/tienda-celulares.jpg"
                  alt="Sistema de facturación en la nube para tiendas de celulares y accesorios"
                  className="w-full h-auto relative z-10"
                  decoding="async"
                  loading="lazy"
                />
              </div>
            </Link>

            <div className="flex flex-col group">
              <div className="mb-6">
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">Colmados</h3>
                <p className="text-lg text-white/90 leading-relaxed">
                  Gestión eficiente de inventario y ventas para colmados. Control total de
                  productos, precios y facturación desde cualquier dispositivo.
                </p>
              </div>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-white transform transition-transform duration-300 group-hover:scale-[1.02] group-hover:shadow-3xl">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10 pointer-events-none z-0"></div>
                <img
                  src="/colmadero.webp"
                  alt="Colmadero usando MOVOPos en laptop para gestionar su negocio"
                  className="w-full h-auto relative z-10"
                  decoding="async"
                  loading="lazy"
                />
              </div>
            </div>

            <div className="flex flex-col group">
              <div className="mb-6">
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">Auto Adornos</h3>
                <p className="text-lg text-white/90 leading-relaxed">
                  Sistema completo para tiendas de auto adornos. Organiza inventario de
                  accesorios, maneja clientes y crea cotizaciones profesionales.
                </p>
              </div>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-white transform transition-transform duration-300 group-hover:scale-[1.02] group-hover:shadow-3xl">
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-transparent to-purple-500/10 pointer-events-none z-0"></div>
                <img
                  src="/autoadorno.webp"
                  alt="Dueño de auto adorno utilizando MOVOPos para administrar su tienda"
                  className="w-full h-auto relative z-10"
                  decoding="async"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 sm:mt-16 text-center">
          <p className="text-lg sm:text-xl text-white/90 font-medium">
            Negocios de todo el país confían en MOVOPos para gestionar ventas, inventario y caja
            en República Dominicana.
          </p>
          {/* SEO: keyword de tercer nivel; mantener fuera de titles, H1 y metas principales. */}
          <p className="mx-auto mt-4 max-w-3xl text-base sm:text-lg text-white/80">
            Si buscas un programa de venta para negocio que sea fácil de usar, MOVOPos centraliza
            la operación diaria sin complicar el trabajo del equipo.
          </p>
        </div>
      </div>
    </section>
  )
}
