"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, PackagePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/app/price-input"
import { toCents } from "@/lib/money"
import { useToast } from "@/hooks/use-toast"
import { createExpressProduct } from "../actions"

function parseStock(value: string) {
  const normalized = value.trim().replace(",", ".")
  if (!normalized) return 0
  return Number(normalized)
}

export function ProductExpressClient({ itbisRateBp }: { itbisRateBp: number }) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [priceCents, setPriceCents] = useState(0)
  const [costInput, setCostInput] = useState("")
  const [stockInput, setStockInput] = useState("1")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)

  const costCents = useMemo(() => {
    const trimmed = costInput.trim()
    if (!trimmed) return null
    return toCents(trimmed.replace(",", "."))
  }, [costInput])

  const canSubmit = name.trim().length > 0 && priceCents > 0 && !isPending

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const stock = parseStock(stockInput)
    if (!Number.isFinite(stock) || stock < 0) {
      setError("La existencia inicial no puede ser negativa.")
      return
    }

    startTransition(async () => {
      const result = await createExpressProduct({
        name: name.trim(),
        priceCents,
        costCents,
        stock,
        code: code.trim() || null,
      })

      if (!result.ok) {
        setError(result.error)
        toast({
          title: "No se pudo crear el producto",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Producto creado",
        description: "Ya está listo para vender.",
      })
      router.push(`/sales?onboardingProductId=${encodeURIComponent(result.productId)}`)
    })
  }

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader className="space-y-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <PackagePlus className="h-6 w-6" />
        </div>
        <div>
          <CardTitle className="text-2xl">Crea tu primer producto</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Registra un producto real y lo agregaremos directo a una venta.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="express-name">Nombre del producto</Label>
            <Input
              id="express-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej: Coca-Cola 20 oz"
              autoFocus
              disabled={isPending}
              className="h-12"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="express-price">Precio de venta</Label>
              <PriceInput
                valueCents={priceCents}
                onChangeCents={setPriceCents}
                disabled={isPending}
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="express-cost">Costo opcional</Label>
              <Input
                id="express-cost"
                value={costInput}
                onChange={(event) => setCostInput(event.target.value)}
                placeholder="Si lo dejas vacío usa el precio"
                inputMode="decimal"
                disabled={isPending}
                className="h-12"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="express-stock">Existencia inicial</Label>
              <Input
                id="express-stock"
                value={stockInput}
                onChange={(event) => setStockInput(event.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                disabled={isPending}
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="express-code">Código o referencia opcional</Label>
              <Input
                id="express-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="SKU, código de barra..."
                disabled={isPending}
                className="h-12"
              />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            Tipo básico, unidad por pieza, disponible para venta e ITBIS {(itbisRateBp / 100).toFixed(2)}%.
          </div>

          {error ? (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <Button type="submit" size="lg" className="h-12 w-full" disabled={!canSubmit}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                Guardar producto y venderlo
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
