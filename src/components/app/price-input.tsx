"use client"

import { useEffect, useState, useRef } from "react"
import { Input } from "@/components/ui/input"
import { toCents } from "@/lib/money"

export function PriceInput({
  valueCents,
  onChangeCents,
  disabled,
  maxCents,
}: {
  valueCents: number
  onChangeCents: (cents: number) => void
  disabled?: boolean
  maxCents?: number
}) {
  const [inputValue, setInputValue] = useState<string>("")
  const isUserTypingRef = useRef(false)

  // Sincronizar el valor del input cuando valueCents cambia externamente (solo si no está escribiendo)
  useEffect(() => {
    if (!isUserTypingRef.current) {
      const formatted = (valueCents / 100).toFixed(2)
      setInputValue(formatted)
    }
  }, [valueCents])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value
    
    // Solo permitir números y un punto decimal
    // Permitir valores vacíos para poder borrar
    if (newValue === "") {
      setInputValue("")
      onChangeCents(0)
      return
    }
    
    // Remover todo excepto números y un punto decimal
    // Permitir solo un punto decimal
    const cleaned = newValue.replace(/[^0-9.]/g, "")
    const parts = cleaned.split(".")
    
    // Si hay más de un punto, mantener solo el primero
    if (parts.length > 2) {
      newValue = parts[0] + "." + parts.slice(1).join("")
    } else {
      newValue = cleaned
    }
    
    // Limitar a 2 decimales
    if (parts.length === 2 && parts[1].length > 2) {
      newValue = parts[0] + "." + parts[1].substring(0, 2)
    }
    
    isUserTypingRef.current = true
    setInputValue(newValue)
    
    const cents = toCents(newValue)
    // Si hay un máximo, limitar el valor
    const finalCents = maxCents !== undefined ? Math.min(cents, maxCents) : cents
    onChangeCents(finalCents)
    
    // Si se limitó el valor, actualizar el input mostrado
    if (maxCents !== undefined && cents > maxCents) {
      const limitedValue = (finalCents / 100).toFixed(2)
      setInputValue(limitedValue)
    }
  }

  const handleBlur = () => {
    // Al perder el foco, formatear el valor correctamente
    isUserTypingRef.current = false
    const cents = toCents(inputValue)
    const finalCents = maxCents !== undefined ? Math.min(cents, maxCents) : cents
    const formatted = (finalCents / 100).toFixed(2)
    setInputValue(formatted)
    // Asegurar que el valor final sea el correcto
    onChangeCents(finalCents)
  }

  return (
    <Input
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      inputMode="decimal"
      disabled={disabled}
      type="text"
    />
  )
}
