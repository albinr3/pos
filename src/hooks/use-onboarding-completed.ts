"use client"
import { useEffect, useState } from "react"
export const ONBOARDING_COMPLETED_EVENT = "movopos:onboarding-completed"
export function useOnboardingCompleted(accountId?: string | null) {
  const [completed, setCompleted] = useState(false)
  useEffect(() => {
    setCompleted(false)
    const listener = (event: Event) => { if ((event as CustomEvent).detail === accountId) setCompleted(true) }
    window.addEventListener(ONBOARDING_COMPLETED_EVENT, listener)
    return () => window.removeEventListener(ONBOARDING_COMPLETED_EVENT, listener)
  }, [accountId])
  return completed
}
