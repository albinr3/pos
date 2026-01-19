"use client"

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

export function HeaderLogoClient() {
  const [logoUrl, setLogoUrl] = useState<string>("/movoLogoDark.png")
  const [companyName, setCompanyName] = useState("Tejada Auto Adornos")
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    // Fetch company settings
    fetch("/api/company-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.logoUrl) {
          setLogoUrl(data.logoUrl)
        } else {
          // Usar logo según el tema si no hay logo personalizado
          const currentTheme = resolvedTheme || theme || "light"
          setLogoUrl(currentTheme === "light" ? "/movoLogoDark.png" : "/movoLogo.png")
        }
        if (data.name) setCompanyName(data.name)
      })
      .catch(() => {
        // Fallback to default
      })
  }, [theme, resolvedTheme])

  // Actualizar logo cuando cambie el tema (si no hay logo personalizado)
  useEffect(() => {
    if (mounted && logoUrl && !logoUrl.startsWith("/api")) {
      const currentTheme = resolvedTheme || theme || "light"
      const defaultLogo = currentTheme === "light" ? "/movoLogoDark.png" : "/movoLogo.png"
      // Solo actualizar si estamos usando el logo por defecto
      if (logoUrl === "/movoLogo.png" || logoUrl === "/movoLogoDark.png") {
        setLogoUrl(defaultLogo)
      }
    }
  }, [theme, resolvedTheme, mounted, logoUrl])

  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 overflow-hidden rounded-md border bg-white dark:bg-card">
        <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
      </div>
      <div className="hidden text-sm font-semibold md:block">{companyName}</div>
    </div>
  )
}








