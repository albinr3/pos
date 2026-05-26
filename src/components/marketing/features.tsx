"use client"

import {
  ShoppingCart,
  ReceiptText,
  Package,
  CreditCard,
  BarChart3,
  Users,
  FileText,
  RotateCcw,
} from "lucide-react"
import { FeatureCard } from "./feature-card"

const features = [
  {
    name: "Punto de Venta",
    description: "Cobra rápido en caja, registra ventas y reduce filas en el mostrador.",
    icon: ShoppingCart,
  },
  {
    name: "Facturación",
    description: "Emite facturas en RD$ con una operación ágil para ventas diarias.",
    icon: ReceiptText,
  },
  {
    name: "Control de Inventario",
    description: "Controla productos, stock y movimientos para evitar faltantes o sobreinventario.",
    icon: Package,
  },
  {
    name: "Ventas y Reportes",
    description: "Monitorea resultados, márgenes y productos más vendidos con reportes claros.",
    icon: BarChart3,
  },
  {
    name: "Cuentas por Cobrar",
    description: "Créditos, abonos y seguimiento de pagos pendientes para tus clientes.",
    icon: CreditCard,
  },
  {
    name: "Clientes",
    description: "Mantén historial de compras, datos de contacto y estado de cuenta por cliente.",
    icon: Users,
  },
  {
    name: "Cotizaciones",
    description: "Crea y envía cotizaciones profesionales en segundos.",
    icon: FileText,
  },
  {
    name: "Devoluciones",
    description: "Registra devoluciones y ajusta inventario automáticamente con trazabilidad.",
    icon: RotateCcw,
  },
]

export function Features() {
  return (
    <section className="py-12 sm:py-16 bg-white">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-8">
          <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Un sistema POS completo para administrar tu negocio
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            MOVOPos integra punto de venta, facturación, inventario, ventas, clientes y cuentas
            por cobrar en una sola plataforma para negocios en República Dominicana.
          </p>
        </div>

        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
          {features.map((feature) => (
            <FeatureCard
              key={feature.name}
              name={feature.name}
              description={feature.description}
              icon={feature.icon}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

