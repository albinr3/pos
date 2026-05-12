"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { CheckCircle2, Circle, PackagePlus, ShoppingCart, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { skipAccountOnboarding, type AccountOnboardingState } from "../onboarding/actions"

const SKIP_KEY_PREFIX = "tejada-pos-onboarding-skip"

function StepItem({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? CheckCircle2 : Circle
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className={cn("h-5 w-5 flex-none", done ? "text-emerald-600" : "text-muted-foreground")} />
      <span className={done ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  )
}

export function OnboardingCard({ state }: { state: AccountOnboardingState }) {
  const skipKey = `${SKIP_KEY_PREFIX}:${state.accountId}`
  const [isHidden, setIsHidden] = useState(state.phase === "COMPLETED")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (state.phase === "COMPLETED") return

    const timer = window.setTimeout(() => {
      try {
        setIsHidden(sessionStorage.getItem(skipKey) === "1")
      } catch {
        setIsHidden(false)
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [skipKey, state.phase])

  const primaryAction = useMemo(() => {
    if (state.phase === "PRODUCT") {
      return {
        href: "/onboarding/primer-producto",
        label: "Crear mi primer producto",
        Icon: PackagePlus,
      }
    }

    if (state.saleProductId) {
      return {
        href: `/sales?onboardingProductId=${encodeURIComponent(state.saleProductId)}`,
        label: "Vender mi primer producto",
        Icon: ShoppingCart,
      }
    }

    return {
      href: "/products",
      label: "Preparar producto para vender",
      Icon: PackagePlus,
    }
  }, [state.phase, state.saleProductId])

  if (isHidden) return null

  const PrimaryIcon = primaryAction.Icon

  const handleSkip = () => {
    startTransition(async () => {
      await skipAccountOnboarding()
      try {
        sessionStorage.setItem(skipKey, "1")
      } catch {
        // Ignore storage errors.
      }
      setIsHidden(true)
    })
  }

  return (
    <Card className="overflow-hidden border-emerald-200 bg-emerald-50/80 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30">
      <CardContent className="p-4 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm dark:bg-emerald-950 dark:text-emerald-200">
                Activación guiada
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Haz tu primera venta en 5 minutos</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Primero crea un producto real de tu negocio. Luego te llevamos directo a venderlo.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <StepItem done label="Datos del negocio listos" />
              <StepItem done={state.activeProductCount > 0} label="Primer producto creado" />
              <StepItem done={state.saleCount > 0} label="Primera venta registrada" />
            </div>

            {state.phase === "SALE" && state.saleProductName ? (
              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                Vamos a vender <span className="font-semibold">{state.saleProductName}</span> con 1 unidad lista en el carrito.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:min-w-64">
            <Button asChild size="lg" className="h-12 w-full bg-emerald-600 text-white hover:bg-emerald-700">
              <Link href={primaryAction.href}>
                <PrimaryIcon className="mr-2 h-5 w-5" />
                {primaryAction.label}
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full text-muted-foreground"
              onClick={handleSkip}
              disabled={isPending}
            >
              <X className="mr-2 h-4 w-4" />
              Saltar por ahora
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
