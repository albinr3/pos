"use client"

import Link from "next/link"
import { PropsWithChildren } from "react"
import {
  BarChart3,
  CreditCard,
  Package,
  Settings,
  ShoppingCart,
  ShoppingBag,
  ClipboardList,
  Users,
  Menu,
  Truck,
  DollarSign,
  Receipt,
  Building2,
  RotateCcw,
  FileText,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/app/theme-toggle"
import { HeaderLogoClient } from "@/components/app/header-logo-client"

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/sales", label: "Ventas", icon: ShoppingCart },
  { href: "/quotes", label: "Cotizaciones", icon: FileText },
  { href: "/returns", label: "Devoluciones", icon: RotateCcw },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/products", label: "Productos", icon: Package },
  { href: "/suppliers", label: "Proveedores", icon: Building2 },
  { href: "/purchases", label: "Compras", icon: ShoppingBag },
  { href: "/ar", label: "Cuentas por cobrar", icon: CreditCard },
  { href: "/payments/list", label: "Recibos de pago", icon: Receipt },
  { href: "/daily-close", label: "Cuadre diario", icon: ClipboardList },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/shipping-labels", label: "Etiquetas de envío", icon: Truck },
  { href: "/operating-expenses", label: "Gastos operativos", icon: DollarSign },
  { href: "/settings", label: "Ajustes", icon: Settings },
]

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[260px_1fr]">
        <aside className="hidden border-r bg-card md:block">
          <div className="flex h-dvh flex-col">
            <div className="px-6 py-5">
              <div className="text-sm font-semibold text-muted-foreground">Tejada Auto Adornos</div>
              <div className="text-lg font-semibold leading-6">POS & Inventario</div>
            </div>
            <Separator />
            <nav className="flex-1 space-y-1 px-3 py-3">
              {nav.map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-2 text-base",
                    item.href === "/sales" && "font-semibold"
                  )}
                >
                  <Link href={item.href}>
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                </Button>
              ))}
            </nav>
            <Separator />
            <div className="px-6 py-4 text-xs text-muted-foreground">
              Local (1 PC) · RD$ · ITBIS incluido
            </div>
          </div>
        </aside>

        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menú">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
                <div className="px-6 py-5">
                  <div className="text-sm font-semibold text-muted-foreground">Tejada Auto Adornos</div>
                  <div className="text-lg font-semibold leading-6">POS & Inventario</div>
                </div>
                <Separator />
                <nav className="space-y-1 px-3 py-3">
                  {nav.map((item) => (
                    <Button key={item.href} asChild variant="ghost" className="w-full justify-start gap-2 text-base">
                      <SheetClose asChild>
                        <Link href={item.href}>
                          <item.icon className="h-5 w-5" />
                          {item.label}
                        </Link>
                      </SheetClose>
                    </Button>
                  ))}
                </nav>
                <Separator />
                <div className="px-6 py-4 text-xs text-muted-foreground">Local (1 PC) · RD$ · ITBIS incluido</div>
              </SheetContent>
            </Sheet>

            <HeaderLogoClient />
            <div className="ml-auto flex items-center gap-3">
              <ThemeToggle />
              <div className="hidden text-xs text-muted-foreground md:block">
                Carretera la Rosa, Moca · 829-475-1454
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
