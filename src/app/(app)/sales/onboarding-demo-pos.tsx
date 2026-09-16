"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Coffee, Loader2, ShoppingCart } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatRD } from "@/lib/money"
import { completeDemoCheckout } from "../onboarding/actions"

type DemoProduct = { id: string; name: string; priceCents: number }

export function OnboardingDemoPos({ products }: { products: DemoProduct[] }) {
  const router = useRouter()
  const [selectedProduct, setSelectedProduct] = useState<DemoProduct | null>(null)
  const [isPending, startTransition] = useTransition()
  const [completed, setCompleted] = useState(false)
  const [nextPath, setNextPath] = useState("/products?onboarding=product")
  const [error, setError] = useState<string | null>(null)

  const handlePracticeCheckout = () => {
    if (!selectedProduct) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await completeDemoCheckout()
        if (!result.ok) return
        if (result.next === "COMPLETED") setNextPath("/onboarding/completado")
        setCompleted(true)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo completar la práctica.")
      }
    })
  }

  if (completed) {
    return (
      <Card className="mx-auto w-full max-w-xl border-emerald-200 bg-emerald-50/70">
        <CardContent className="space-y-5 p-6 text-center sm:p-8">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
          <div>
            <h2 className="text-2xl font-semibold">¡Así de fácil es cobrar!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Este fue un recibo de práctica: no creó factura, no descontó inventario y no aparecerá en tus reportes.
            </p>
          </div>
          <div className="rounded-lg border bg-background p-4 text-left text-sm">
            <div className="flex justify-between font-medium"><span>{selectedProduct?.name}</span><span>{formatRD(selectedProduct?.priceCents ?? 0)}</span></div>
            <div className="mt-3 flex justify-between border-t pt-3 font-semibold"><span>Total de práctica</span><span>{formatRD(selectedProduct?.priceCents ?? 0)}</span></div>
          </div>
          <Button size="lg" className="w-full" onClick={() => router.push(nextPath)}>
            {nextPath.includes("completado") ? "Ver activación completada" : "Ahora crea mi primer producto"}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <Card className="border-emerald-200 bg-emerald-50/70">
        <CardContent className="flex gap-3 p-4 text-sm text-emerald-950">
          <Coffee className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div><strong>Práctica rápida:</strong> selecciona Café Americano y presiona “Cobrar de práctica”. No se guardará ninguna venta.</div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => setSelectedProduct(product)}
            data-onboarding-target={product.name === "Café Americano" ? "demo-coffee" : undefined}
            className={`rounded-xl border-2 bg-card p-5 text-left shadow-sm transition-colors ${selectedProduct?.id === product.id ? "border-emerald-600 ring-2 ring-emerald-200" : "border-border hover:border-emerald-400"}`}
          >
            <ShoppingCart className="mb-5 h-6 w-6 text-emerald-600" />
            <div className="font-semibold">{product.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">{formatRD(product.priceCents)}</div>
          </button>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Carrito de práctica</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {selectedProduct ? (
            <div className="flex justify-between text-sm"><span>{selectedProduct.name}</span><span>{formatRD(selectedProduct.priceCents)}</span></div>
          ) : <p className="text-sm text-muted-foreground">Selecciona un producto para continuar.</p>}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" size="lg" disabled={!selectedProduct || isPending} onClick={handlePracticeCheckout} data-onboarding-target="demo-checkout">
            {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Procesando…</> : "Cobrar de práctica"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
