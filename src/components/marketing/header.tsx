"use client"

import Link from "next/link"
import Image from "next/image"
import { useState } from "react"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/pricing", label: "Precios" },
  { href: "/about", label: "Acerca de nosotros" },
]

export function MarketingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header 
      className="sticky top-0 z-50 w-full"
      style={{
        background: 'transparent'
      }}
    >
      <div className="container flex h-20 items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Image
            src="/logo.webp"
            alt="Tejada POS"
            width={150}
            height={50}
            className="h-12 w-auto sm:h-14"
            priority
          />
        </Link>

        <nav className="hidden md:flex items-center space-x-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-lg font-medium text-white/90 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/about"
            className="text-lg font-medium text-white/90 transition-colors hover:text-white"
          >
            Contacto
          </Link>
          <Button asChild className="bg-white text-[#6B46C1] hover:bg-white/90">
            <Link href="/app">Iniciar Sesión</Link>
          </Button>
        </nav>

        <div className="md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            className="text-white hover:bg-white/10"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t">
          <div className="container flex flex-col space-y-4 py-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-lg font-medium text-white/90 transition-colors hover:text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/about"
              className="text-lg font-medium text-white/90 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Contacto
            </Link>
            <Button asChild className="w-full bg-white text-[#6B46C1] hover:bg-white/90">
              <Link href="/app" onClick={() => setMobileMenuOpen(false)}>
                Iniciar Sesión
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}

