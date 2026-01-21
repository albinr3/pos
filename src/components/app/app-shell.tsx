"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { PropsWithChildren, useMemo } from "react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import type { CurrentUser } from "@/lib/auth"
import { UserButton, useClerk } from "@clerk/nextjs"
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
  Tag,
  Database,
  User,
  LogOut,
  RefreshCw,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/app/theme-toggle"
import { HeaderLogoClient } from "@/components/app/header-logo-client"
import { initAutoSync, syncCacheData } from "@/lib/auto-sync"
import { syncPendingData } from "@/lib/sync-manager"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/sales", label: "Ventas", icon: ShoppingCart },
  { href: "/quotes", label: "Cotizaciones", icon: FileText },
  { href: "/returns", label: "Devoluciones", icon: RotateCcw },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/products", label: "Productos", icon: Package },
  { href: "/categories", label: "Categorías", icon: Tag },
  { href: "/suppliers", label: "Proveedores", icon: Building2 },
  { href: "/purchases", label: "Compras", icon: ShoppingBag },
  { href: "/ar", label: "Cuentas por cobrar", icon: CreditCard },
  { href: "/payments/list", label: "Recibos de pago", icon: Receipt },
  { href: "/daily-close", label: "Cuadre diario", icon: ClipboardList },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/shipping-labels", label: "Etiquetas de envío", icon: Truck },
  { href: "/operating-expenses", label: "Gastos operativos", icon: DollarSign },
  { href: "/settings", label: "Ajustes", icon: Settings },
  { href: "/backups", label: "Backups", icon: Database },
]

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useClerk()
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [companyAddress, setCompanyAddress] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")
  const [user, setUser] = useState<CurrentUser | null>(null)

  const handleChangeUser = async () => {
    // Limpiar sesión de subusuario y redirigir a selección
    await fetch("/api/auth/logout-subuser", { method: "POST" })
    router.push("/select-user")
  }

  const handleLogout = async () => {
    // Limpiar sesión de subusuario
    await fetch("/api/auth/logout-subuser", { method: "POST" })
    // Cerrar sesión de Clerk
    await signOut({ redirectUrl: "/login" })
  }

  const getRoleBadge = (role: string, isOwner: boolean) => {
    if (isOwner) {
      return <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">Dueño</Badge>
    }
    switch (role) {
      case "ADMIN":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">Admin</Badge>
      case "CAJERO":
        return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">Cajero</Badge>
      case "ALMACEN":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-xs">Almacén</Badge>
      default:
        return <Badge variant="outline" className="text-xs">{role}</Badge>
    }
  }
  
  // Filtrar navegación según permisos
  const filteredNav = useMemo(() => {
    if (!user) return []
    return nav.filter((item) => {
      // Ocultar backups si no tiene permiso
      if (item.href === "/backups" && !user.canManageBackups && user.username !== "admin") {
        return false
      }
      return true
    })
  }, [user])
  
  useEffect(() => {
    setMounted(true)
    // Inicializar auto-sincronización de cache
    initAutoSync()
    // Intentar precargar cache y sincronizar pendientes al cargar si hay conexión
    if (navigator.onLine) {
      syncCacheData()
      syncPendingData()
    }
    
    // Obtener usuario actual
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user)
          if (navigator.onLine) {
            syncCacheData()
            syncPendingData()
          }
        }
        // No redirigir aquí - el layout del servidor ya maneja la redirección
      })
      .catch(() => {
        // Error al obtener usuario - el layout del servidor ya maneja la redirección
        console.error("Error fetching user")
      })
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
              {filteredNav.map((item) => {
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
                  {filteredNav.map((item) => {
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
              {companyAddress && companyPhone && (
                <div className="hidden text-xs text-muted-foreground lg:block">
                  {companyAddress} · {companyPhone}
                </div>
              )}
              <ThemeToggle />
              
              {/* User dropdown */}
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2 px-2">
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <User className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="hidden md:flex flex-col items-start">
                        <span className="text-sm font-medium">{user.name}</span>
                        <span className="text-xs text-muted-foreground">@{user.username}</span>
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col gap-1">
                        <span>{user.name}</span>
                        <span className="text-xs font-normal text-muted-foreground">@{user.username}</span>
                        {getRoleBadge(user.role, user.isOwner)}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleChangeUser}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Cambiar usuario
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      Cerrar sesión
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
