"use client"

import { AlertCircle, Clock, CreditCard } from "lucide-react"
import Link from "next/link"
import type { BillingState } from "@/lib/auth"

interface BillingBannerProps {
  billingState: BillingState
}

export function BillingBanner({ billingState }: BillingBannerProps) {
  const {
    status,
    isTrialing,
    isGrace,
    isBlocked,
    trialDaysRemaining,
    graceDaysRemaining,
    daysRemaining,
    needsPayment,
  } = billingState

  // No mostrar banner si está activo y no necesita pago
  if (status === "ACTIVE" && !needsPayment) {
    return null
  }

  // Banner de trial
  if (isTrialing && trialDaysRemaining !== null) {
    const isUrgent = trialDaysRemaining <= 3

    return (
      <div
        className={`px-4 py-2 text-center text-sm ${
          isUrgent
            ? "bg-yellow-500 text-yellow-950"
            : "bg-blue-500 text-white"
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          <Clock className="h-4 w-4" />
          <span>
            {trialDaysRemaining === 0
              ? "Tu período de prueba termina hoy."
              : trialDaysRemaining === 1
              ? "Te queda 1 día de prueba."
              : `Te quedan ${trialDaysRemaining} días de prueba.`}
          </span>
          <Link
            href="/billing"
            className={`ml-2 underline font-medium ${
              isUrgent ? "text-yellow-950" : "text-white"
            }`}
          >
            Elegir plan
          </Link>
        </div>
      </div>
    )
  }

  // Banner de gracia
  if (isGrace && graceDaysRemaining !== null) {
    return (
      <div className="bg-orange-500 text-white px-4 py-2 text-center text-sm">
        <div className="flex items-center justify-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>
            {graceDaysRemaining === 0
              ? "Tu período de gracia termina hoy. Tu cuenta será bloqueada."
              : graceDaysRemaining === 1
              ? "Te queda 1 día de gracia antes del bloqueo."
              : `Te quedan ${graceDaysRemaining} días de gracia antes del bloqueo.`}
          </span>
          <Link
            href="/billing"
            className="ml-2 underline font-medium text-white"
          >
            Pagar ahora
          </Link>
        </div>
      </div>
    )
  }

  // Banner de bloqueado
  if (isBlocked) {
    return (
      <div className="bg-red-600 text-white px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span className="font-medium">
            Tu cuenta está bloqueada por falta de pago.
          </span>
          <Link
            href="/billing"
            className="ml-2 inline-flex items-center gap-1 bg-white text-red-600 px-3 py-1 rounded font-medium hover:bg-red-50 transition-colors"
          >
            <CreditCard className="h-4 w-4" />
            Ir a Facturación
          </Link>
        </div>
      </div>
    )
  }

  // Banner cuando el período está por vencer (últimos 3 días)
  if (status === "ACTIVE" && daysRemaining !== null && daysRemaining <= 3) {
    return (
      <div className="bg-yellow-500 text-yellow-950 px-4 py-2 text-center text-sm">
        <div className="flex items-center justify-center gap-2">
          <Clock className="h-4 w-4" />
          <span>
            {daysRemaining === 0
              ? "Tu suscripción vence hoy."
              : daysRemaining === 1
              ? "Tu suscripción vence mañana."
              : `Tu suscripción vence en ${daysRemaining} días.`}
          </span>
          <Link
            href="/billing"
            className="ml-2 underline font-medium text-yellow-950"
          >
            Ver facturación
          </Link>
        </div>
      </div>
    )
  }

  return null
}
