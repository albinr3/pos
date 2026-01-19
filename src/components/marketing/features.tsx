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
    description: "Sistema completo de ventas con facturación térmica y gestión de clientes.",
    icon: ShoppingCart,
  },
  {
    name: "Control de Inventario",
    description: "Gestión completa de productos, stock, proveedores y compras.",
    icon: Package,
  },
  {
    name: "Cuentas por Cobrar",
    description: "Administra créditos, abonos y seguimiento de pagos pendientes.",
    icon: CreditCard,
  },
  {
    name: "Reportes y Análisis",
    description: "Dashboard con métricas, reportes de ventas y estado de resultados.",
    icon: BarChart3,
  },
  {
    name: "Gestión de Clientes",
    description: "Base de datos completa de clientes con historial de compras.",
    icon: Users,
  },
  {
    name: "Cotizaciones",
    description: "Crea y comparte cotizaciones profesionales con tus clientes.",
    icon: FileText,
  },
  {
    name: "Devoluciones",
    description: "Procesa devoluciones y ajusta inventario automáticamente.",
    icon: Truck,
  },
  {
    name: "Seguro y Confiable",
    description: "Tus datos están seguros con respaldos automáticos y control de acceso.",
    icon: Shield,
  },
]

export function Features() {
  return (
    <section className="py-12 sm:py-16 bg-white">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-8">
          <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Todo lo que necesitas en un solo lugar
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            Funcionalidades diseñadas para hacer crecer tu negocio de manera eficiente.
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


