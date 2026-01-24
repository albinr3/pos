"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function BillingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[Billing:error]", error)
  }, [error])

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">Facturación</h1>
      <div className="rounded-md border bg-background p-6">
        <p className="text-sm text-muted-foreground mb-3">
          Ocurrió un error cargando la pantalla de facturación.
        </p>
        {process.env.NODE_ENV === "development" && (
          <pre className="text-xs text-muted-foreground mb-4 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <Button onClick={reset}>Reintentar</Button>
      </div>
    </div>
  )
}
