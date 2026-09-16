"use client"

import { useTransition } from "react"
import { CheckCircle2, PartyPopper, PlayCircle, X } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { skipAccountOnboarding } from "../onboarding/actions"

type ActivationStage = "SALE" | "PRODUCT"

const confettiColors = ["bg-emerald-400", "bg-violet-500", "bg-amber-400", "bg-sky-400", "bg-rose-400"]

export function OnboardingActivationModal({ stage, accountId }: { stage: ActivationStage; accountId: string }) {
  const router = useRouter()
  const [isSkipping, startTransition] = useTransition()
  const isSale = stage === "SALE"

  const handleSkip = () => {
    startTransition(async () => {
      await skipAccountOnboarding()
      try {
        sessionStorage.setItem(`tejada-pos-onboarding-skip:${accountId}`, "1")
      } catch {
        // La navegación sigue funcionando aunque el navegador bloquee sessionStorage.
      }
      router.replace("/dashboard")
    })
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-background p-6 text-center shadow-2xl sm:p-8">
        {!isSale ? (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-around">
            {confettiColors.map((color, index) => (
              <span
                key={color}
                className={`h-2.5 w-2.5 rotate-12 rounded-sm ${color} animate-bounce`}
                style={{ animationDelay: `${index * 120}ms` }}
              />
            ))}
          </div>
        ) : null}

        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${isSale ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-600"}`}>
          {isSale ? <PartyPopper className="h-8 w-8" /> : <CheckCircle2 className="h-10 w-10 animate-bounce" />}
        </div>

        <h2 className="mt-5 text-2xl font-semibold tracking-tight">
          {isSale ? "Hagamos tu primera venta de prueba" : "¡Felicidades! Creaste tu primera venta de prueba"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {isSale
            ? "Te guiaremos dentro de la caja para que conozcas cómo se selecciona un producto y se completa una venta. No se guardará ninguna factura."
            : "Ya sabes cómo usar la caja. Ahora veamos cómo crear un producto propio para que empieces a vender de verdad."}
        </p>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button
            size="lg"
            onClick={() => router.push(isSale ? "/dashboard?onboarding=sale" : "/dashboard?onboarding=product")}
          >
            <PlayCircle className="mr-2 h-5 w-5" />
            {isSale ? "Empezar tutorial" : "Empezar"}
          </Button>
          <Button variant="outline" size="lg" onClick={handleSkip} disabled={isSkipping}>
            <X className="mr-2 h-5 w-5" />
            Descartar
          </Button>
        </div>
      </div>
    </div>
  )
}
