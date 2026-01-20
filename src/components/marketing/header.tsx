"use client"

import Link from "next/link"
import Image from "next/image"
import { useState } from "react"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs"

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
      <div className="container flex h-20 items-center justify-between px-3 sm:px-4">
        <Link href="/" className="flex items-center space-x-2 -ml-1 sm:ml-0">
          <Image
            src="/movoLogo.png?v=1"
            alt="MOVOPos"
            width={150}
            height={50}
            className="h-12 w-auto sm:h-14"
            priority
            unoptimized
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
            href="/contact"
            className="text-lg font-medium text-white/90 transition-colors hover:text-white"
          >
            Contacto
          </Link>
          <SignedOut>
            <Button asChild className="bg-white text-[#6B46C1] hover:bg-white/90">
              <Link href="/login">Iniciar Sesión</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" className="text-white hover:bg-white/10">
                <Link href="/dashboard">Ir a la App</Link>
              </Button>
              <UserButton 
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "w-9 h-9 ring-2 ring-white/30"
                  }
                }}
              />
            </div>
          </SignedIn>
        </nav>

        <div className="md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            className="text-white hover:bg-white/10 focus:bg-transparent active:bg-white/10 focus:text-white active:text-white focus:opacity-100 active:opacity-100 h-11 w-11"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t max-h-[calc(100vh-5rem)] overflow-y-auto">
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
              href="/contact"
              className="text-lg font-medium text-white/90 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Contacto
            </Link>
            <SignedOut>
              <Button asChild className="w-full bg-white text-[#6B46C1] hover:bg-white/90">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  Iniciar Sesión
                </Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button asChild className="w-full bg-white text-[#6B46C1] hover:bg-white/90">
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                  Ir a la App
                </Link>
              </Button>
              <div className="flex items-center justify-center pt-2">
                <UserButton 
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-10 h-10 ring-2 ring-white/30"
                    }
                  }}
                />
              </div>
            </SignedIn>
          </div>
        </div>
      )}
    </header>
  )
}

