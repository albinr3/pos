"use client"

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react"

export function HeaderLogoClient() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState("Tejada Auto Adornos")

  useEffect(() => {
    // Fetch company settings
    fetch("/api/company-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.logoUrl) setLogoUrl(data.logoUrl)
        if (data.name) setCompanyName(data.name)
      })
      .catch(() => {
        // Fallback to default
      })
  }, [])

  if (!logoUrl) {
    return <div className="text-sm font-semibold">{companyName}</div>
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 overflow-hidden rounded-md border bg-white dark:bg-card">
        <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
      </div>
      <div className="hidden text-sm font-semibold md:block">{companyName}</div>
    </div>
  )
}





