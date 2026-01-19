"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { PropsWithChildren } from "react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
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
  const pathname = usePathname()
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [companyAddress, setCompanyAddress] = useState("Carretera la Rosa, Moca")
  const [companyPhone, setCompanyPhone] = useState("829-475-1454")
  
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    // Fetch company settings
    fetch("/api/company-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.address) setCompanyAddress(data.address)
        if (data.phone) setCompanyPhone(data.phone)
      })
      .catch(() => {
        // Fallback to default
      })
  }, [])
  
  // Determinar el tema actual (resuelve "system" a "light" o "dark")
  const currentTheme = resolvedTheme || theme || "light"
  const logoPath = currentTheme === "light" ? "/movoLogoDark.png" : "/movoLogo.png"
  
  return (
    <div className="min-h-dvh bg-background">
      <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[260px_1fr]">
        <aside className="hidden border-r bg-card md:block">
          <div className="flex h-dvh flex-col">
            <div className="px-6 py-5">
              <div className="flex items-center justify-center">
                {mounted && <img src={logoPath} alt="Logo" className="h-auto w-full max-h-16 object-contain" />}
              </div>
            </div>
            <Separator />
            <nav className="flex-1 space-y-1 px-3 py-3">
              {nav.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/")
                return (
                  <Button
                    key={item.href}
                    asChild
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-2 text-base transition-colors",
                      isActive && "bg-purple-primary/10 text-purple-primary font-semibold hover:bg-purple-primary/20 hover:text-purple-primary"
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  </Button>
                )
              })}
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
              <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
                <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
                <div className="px-6 py-5 flex-shrink-0">
                  <div className="flex items-center justify-center">
                    {mounted && <img src={logoPath} alt="Logo" className="h-auto w-full max-h-16 object-contain" />}
                  </div>
                </div>
                <Separator className="flex-shrink-0" />
                <nav className="flex-1 space-y-1 px-3 py-3 overflow-y-auto">
                  {nav.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + "/")
                    return (
                      <Button 
                        key={item.href} 
                        asChild 
                        variant="ghost" 
                        className={cn(
                          "w-full justify-start gap-2 text-base transition-colors",
                          isActive && "bg-purple-primary/10 text-purple-primary font-semibold hover:bg-purple-primary/20 hover:text-purple-primary"
                        )}
                      >
                        <SheetClose asChild>
                          <Link href={item.href}>
                            <item.icon className="h-5 w-5" />
                            {item.label}
                          </Link>
                        </SheetClose>
                      </Button>
                    )
                  })}
                </nav>
                <Separator className="flex-shrink-0" />
                <div className="px-6 py-4 text-xs text-muted-foreground flex-shrink-0">Local (1 PC) · RD$ · ITBIS incluido</div>
              </SheetContent>
            </Sheet>

            <HeaderLogoClient />
            <div className="ml-auto flex items-center gap-3">
              <ThemeToggle />
              <div className="hidden text-xs text-muted-foreground md:block">
                {companyAddress} · {companyPhone}
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
