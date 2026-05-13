"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Check, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { skipAccountOnboarding } from "@/app/(app)/onboarding/actions"

export type OnboardingGuideStep = {
  target: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

type TargetRect = {
  top: number
  left: number
  width: number
  height: number
}

type OnboardingGuideProps = {
  accountId?: string | null
  step: OnboardingGuideStep | null
  stepIndex: number
  totalSteps: number
  onClose?: () => void
  onSkip?: () => void
  progressKey?: string
  stepKey?: string
  resumePath?: string
}

const SKIP_KEY_PREFIX = "tejada-pos-onboarding-skip"
const HIGHLIGHT_PADDING = 8
const CARD_WIDTH = 320
const CARD_GAP = 14

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getTarget(step: OnboardingGuideStep) {
  const targets = Array.from(document.querySelectorAll<HTMLElement>(`[data-onboarding-target="${step.target}"]`))
  return targets.find((target) => {
    const rect = target.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }) ?? targets[0] ?? null
}

export function OnboardingGuide({
  accountId,
  step,
  stepIndex,
  totalSteps,
  onClose,
  onSkip,
  progressKey,
  stepKey,
  resumePath,
}: OnboardingGuideProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [rect, setRect] = useState<TargetRect | null>(null)
  const [isSkipping, startSkipping] = useTransition()

  useEffect(() => {
    if (!step || !isVisible) return

    let frame = 0

    const updateRect = () => {
      const target = getTarget(step)
      if (!target) {
        setRect(null)
        return
      }

      const nextRect = target.getBoundingClientRect()
      setRect({
        top: nextRect.top,
        left: nextRect.left,
        width: nextRect.width,
        height: nextRect.height,
      })
    }

    const focusTarget = () => {
      const target = getTarget(step)
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" })
      frame = window.requestAnimationFrame(updateRect)
    }

    const timer = window.setTimeout(focusTarget, 80)
    const interval = window.setInterval(updateRect, 150)
    window.addEventListener("resize", updateRect)
    window.addEventListener("scroll", updateRect, true)

    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", updateRect)
      window.removeEventListener("scroll", updateRect, true)
    }
  }, [isVisible, step])

  const cardPosition = useMemo(() => {
    if (!rect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      } as const
    }

    const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth
    const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight
    const left = clamp(rect.left, 16, Math.max(16, viewportWidth - CARD_WIDTH - 16))
    const belowTop = rect.top + rect.height + CARD_GAP
    const top = belowTop + 220 > viewportHeight
      ? Math.max(16, rect.top - 220 - CARD_GAP)
      : belowTop

    return {
      top,
      left,
      transform: "none",
    } as const
  }, [rect])

  if (!step || !isVisible) return null

  const closeGuide = () => {
    setIsVisible(false)
    onClose?.()
  }

  const handleSkip = () => {
    startSkipping(async () => {
      onSkip?.()
      if (progressKey) {
        try {
          localStorage.setItem(
            progressKey,
            JSON.stringify({
              skipped: true,
              stepKey: stepKey ?? null,
              stepIndex,
              resumePath: resumePath ?? null,
              updatedAt: new Date().toISOString(),
            })
          )
        } catch {
          // Ignore storage errors.
        }
      }
      await skipAccountOnboarding()
      if (accountId) {
        try {
          sessionStorage.setItem(`${SKIP_KEY_PREFIX}:${accountId}`, "1")
        } catch {
          // Ignore storage errors.
        }
      }
      closeGuide()
    })
  }

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none" aria-live="polite">
      {rect ? (
        <div
          className="fixed rounded-xl border-2 border-emerald-400 bg-transparent shadow-[0_0_0_9999px_rgba(2,6,23,0.50),0_0_0_6px_rgba(16,185,129,0.22)]"
          style={{
            top: rect.top - HIGHLIGHT_PADDING,
            left: rect.left - HIGHLIGHT_PADDING,
            width: rect.width + HIGHLIGHT_PADDING * 2,
            height: rect.height + HIGHLIGHT_PADDING * 2,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/50" />
      )}

      <div
        className="fixed w-[min(320px,calc(100vw-32px))] rounded-xl border bg-background p-4 shadow-2xl pointer-events-auto"
        style={cardPosition}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Paso {stepIndex + 1} de {totalSteps}
            </div>
            <h2 className="mt-1 text-base font-semibold">{step.title}</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={closeGuide} aria-label="Cerrar guía">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">{step.description}</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" className="justify-start text-muted-foreground" onClick={handleSkip} disabled={isSkipping}>
            {isSkipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
            Saltar por ahora
          </Button>
          {step.onAction ? (
            <Button type="button" onClick={step.onAction}>
              <Check className="mr-2 h-4 w-4" />
              {step.actionLabel ?? "Siguiente"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
