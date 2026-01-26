"use client"

import {
  ShoppingCart,
  Package,
  CreditCard,
  BarChart3,
  Users,
  FileText,
  Truck,
  Shield,
} from "lucide-react"
import { FeatureCard } from "./feature-card"

const features = [
  {
    name: "Punto de Venta",
    description: "Facturación térmica rápida con clientes, impuestos y métodos de pago locales.",
    icon: ShoppingCart,
  },
  {
    name: "Control de Inventario",
    description: "Productos, stock mínimo, proveedores y compras centralizados en tiempo real.",
    icon: Package,
  },
  {
    name: "Cuentas por Cobrar",
    description: "Créditos, abonos y seguimiento de pagos pendientes para tus clientes.",
    icon: CreditCard,
  },
  {
    name: "Reportes y Análisis",
    description: "Dashboard con métricas clave, ventas por periodo y resultados del negocio.",
    icon: BarChart3,
  },
  {
    name: "Gestión de Clientes",
    description: "Historial de compras, datos de contacto y segmentación para fidelizar.",
    icon: Users,
  },
  {
    name: "Cotizaciones",
    description: "Crea y envía cotizaciones profesionales en segundos.",
    icon: FileText,
  },
  {
    name: "Devoluciones",
    description: "Procesa devoluciones y ajusta inventario automáticamente sin errores.",
    icon: Truck,
  },
  {
    name: "Seguro y Confiable",
    description: "Respaldos automáticos, roles y permisos para proteger tu operación.",
    icon: Shield,
  },
]

export function Features() {
  return (
    <section className="py-12 sm:py-16 bg-white">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-8">
          <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Funciones clave de sistema POS y facturación en República Dominicana
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            Operaciones listas para facturar, controlar inventario y cobrar en RD$ desde un solo lugar.
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


