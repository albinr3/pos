"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { PropsWithChildren, useMemo } from "react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import type { SuperAdminUser } from "@/lib/super-admin-auth"
import {
  BarChart3,
  Building2,
  CreditCard,
  Settings,
  Menu,
  Users,
  LogOut,
  DollarSign,
  FileText,
  Landmark,
  Shield,
  Bug,
  Tag,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/app/theme-toggle"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  permission?: keyof SuperAdminUser
}

const nav: NavItem[] = [
  { href: "/super-admin", label: "Dashboard", icon: BarChart3 },
  { href: "/super-admin/accounts", label: "Cuentas", icon: Building2, permission: "canManageAccounts" },
  { href: "/super-admin/payments", label: "Pagos", icon: CreditCard, permission: "canApprovePayments" },
  { href: "/super-admin/plans", label: "Planes", icon: Tag, permission: "canModifyPricing" },
  { href: "/super-admin/banks", label: "Cuentas Bancarias", icon: Landmark, permission: "canManageAccounts" },
  { href: "/super-admin/errors", label: "Errores", icon: Bug, permission: "canManageAccounts" },
  { href: "/super-admin/reports", label: "Reportes", icon: FileText, permission: "canViewFinancials" },
  { href: "/super-admin/settings", label: "Configuración", icon: Settings, permission: "canModifyPricing" },
]

export function SuperAdminShell({
  admin,
  children,
}: PropsWithChildren<{ admin: SuperAdminUser }>) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const handleLogout = async () => {
    await fetch("/api/super-admin/logout", { method: "POST" })
    router.push("/super-admin/login")
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "OWNER":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">Owner</Badge>
      case "ADMIN":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">Admin</Badge>
      case "FINANCE":
        return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">Finance</Badge>
      case "SUPPORT":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-xs">Support</Badge>
      default:
        return <Badge variant="outline" className="text-xs">{role}</Badge>
    }
  }

  // Filtrar navegación según permisos
  const filteredNav = useMemo(() => {
    return nav.filter((item) => {
      if (!item.permission) return true
      // Los roles OWNER y ADMIN ven todo
      if (admin.role === "OWNER" || admin.role === "ADMIN") return true
      return admin[item.permission] === true
    })
  }, [admin])

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = resolvedTheme || theme || "light"
  const logoPath = currentTheme === "light" ? "/movoLogoDark.png" : "/movoLogo.png"

  return (
    <div className="min-h-dvh bg-background">
      <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[260px_1fr]">
        <aside className="hidden border-r bg-card md:block">
          <div className="flex h-dvh flex-col">
            <div className="px-6 py-5">
              <div className="flex items-center justify-center gap-2">
                {mounted && <img src={logoPath} alt="Logo" className="h-auto w-full max-h-12 object-contain" />}
              </div>
              <div className="flex items-center justify-center mt-2">
                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                  <Shield className="h-3 w-3 mr-1" />
                  Super Admin
                </Badge>
              </div>
            </div>
            <Separator />
            <nav className="flex-1 space-y-1 px-3 py-3">
              {filteredNav.map((item) => {
                const isActive = pathname === item.href || 
                  (item.href !== "/super-admin" && pathname?.startsWith(item.href + "/"))
                return (
                  <Button
                    key={item.href}
                    asChild
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-2 text-base transition-colors",
                      isActive && "bg-red-500/10 text-red-600 font-semibold hover:bg-red-500/20 hover:text-red-600"
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
              Panel de Administración
            </div>
          </div>
        </aside>

        <div className="flex min-h-dvh flex-col">
          <div className="sticky top-0 z-10">
            <header className="flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
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
                      {mounted && <img src={logoPath} alt="Logo" className="h-auto w-full max-h-12 object-contain" />}
                    </div>
                    <div className="flex items-center justify-center mt-2">
                      <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                        <Shield className="h-3 w-3 mr-1" />
                        Super Admin
                      </Badge>
                    </div>
                  </div>
                  <Separator className="flex-shrink-0" />
                  <nav className="flex-1 space-y-1 px-3 py-3 overflow-y-auto">
                    {filteredNav.map((item) => {
                      const isActive = pathname === item.href || 
                        (item.href !== "/super-admin" && pathname?.startsWith(item.href + "/"))
                      return (
                        <Button
                          key={item.href}
                          asChild
                          variant="ghost"
                          className={cn(
                            "w-full justify-start gap-2 text-base transition-colors",
                            isActive && "bg-red-500/10 text-red-600 font-semibold hover:bg-red-500/20 hover:text-red-600"
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
                  <div className="px-6 py-4 text-xs text-muted-foreground flex-shrink-0">
                    Panel de Administración
                  </div>
                </SheetContent>
              </Sheet>

              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-500" />
                <span className="font-semibold text-sm">Super Admin</span>
              </div>

              <div className="ml-auto flex items-center gap-3">
                <ThemeToggle />

                {/* Admin dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2 px-2">
                      <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                        <Shield className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="hidden md:flex flex-col items-start">
                        <span className="text-sm font-medium">{admin.name}</span>
                        <span className="text-xs text-muted-foreground">{admin.email}</span>
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col gap-1">
                        <span>{admin.name}</span>
                        <span className="text-xs font-normal text-muted-foreground">{admin.email}</span>
                        {getRoleBadge(admin.role)}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      Cerrar sesión
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
          </div>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
