"use client"
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { ONBOARDING_COMPLETED_EVENT } from "@/hooks/use-onboarding-completed"
export function OnboardingCompletionSync({ accountId }: { accountId?: string }) {
  const router = useRouter()
  const completed = useRef<string | null>(null)
  useEffect(() => {
    if (!accountId) return
    let disposed = false, running = false
    const controller = new AbortController()
    const check = async () => {
      if (disposed || running || document.hidden || completed.current === accountId) return
      running = true
      try {
        const response = await fetch("/api/onboarding", { cache: "no-store", signal: controller.signal })
        if (!response.ok) return
        const state = await response.json()
        if (!disposed && state.completedAt) {
          completed.current = accountId
          window.dispatchEvent(new CustomEvent(ONBOARDING_COMPLETED_EVENT, { detail: accountId }))
          router.refresh()
        }
      } catch { /* Sin red: conservar formularios y reintentar al recuperar foco. */ }
      finally { running = false }
    }
    void check()
    const timer = window.setInterval(() => {
      if (document.querySelector('[data-onboarding-target], [data-onboarding-visible]')) void check()
    }, 30000)
    window.addEventListener("focus", check)
    window.addEventListener("online", check)
    document.addEventListener("visibilitychange", check)
    return () => { disposed = true; controller.abort(); clearInterval(timer); window.removeEventListener("focus", check); window.removeEventListener("online", check); document.removeEventListener("visibilitychange", check) }
  }, [accountId, router])
  return null
}
