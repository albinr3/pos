"use client"

import { useEffect } from "react"

export function BillingRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.location.pathname.startsWith("/billing")) return
    window.location.replace("/billing")
  }, [])

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-lg font-semibold">Redirigiendo a facturación…</div>
        <div className="text-sm text-muted-foreground">
          Tu cuenta requiere pago para continuar.
        </div>
      </div>
    </div>
  )
}
