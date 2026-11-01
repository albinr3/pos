"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function NoModuleAccess() {
  const [isChangingUser, setIsChangingUser] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChangeUser() {
    setIsChangingUser(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/logout-subuser", { method: "POST" })
      if (!response.ok) throw new Error("No se pudo cerrar la sesión de subusuario")

      // Navegar solo después de cerrar la sesión evita que /select-user vuelva
      // automáticamente al dashboard con la misma sesión sin módulos habilitados.
      window.location.assign("/select-user")
    } catch {
      setError("No se pudo cambiar de usuario. Intenta de nuevo.")
      setIsChangingUser(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sin acceso a módulos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>No tienes módulos habilitados. Contacta al administrador.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleChangeUser} disabled={isChangingUser}>
          {isChangingUser ? "Cambiando usuario..." : "Cambiar usuario"}
        </Button>
      </CardContent>
    </Card>
  )
}
