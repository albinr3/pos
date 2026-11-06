"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useClerk } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useOnlineStatus } from "@/hooks/use-online-status"
import { getPendingCounts } from "@/lib/indexed-db"
import { clearAccountLocalData, notifyAccountDeletion } from "@/lib/account-deletion-client"

export function DeleteAccountForm() {
  const { signOut } = useClerk()
  const isOnline = useOnlineStatus()
  const [pin, setPin] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [pendingCount, setPendingCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const submission = useRef(false)

  useEffect(() => {
    getPendingCounts().then(counts => setPendingCount(counts.sales + counts.payments)).catch(() => {})
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submission.current || !isOnline) return
    submission.current = true
    setSubmitting(true)
    setError("")
    try {
      const response = await fetch("/api/account", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, confirmation }),
      })
      const result = await response.json()
      if (!response.ok || result.success !== true) {
        setError(result.error || "No se pudo registrar la eliminación.")
        submission.current = false
        setSubmitting(false)
        return
      }
      setPin("")
      const status = result.status === "completed" ? "completada" : "procesando"
      notifyAccountDeletion(status)
      // Una falla de almacenamiento o cierre de Clerk no puede devolver al usuario a la cuenta borrada.
      await clearAccountLocalData().catch(() => {})
      try { await signOut({ redirectUrl: `/cuenta-eliminada?estado=${status}` }) } catch { /* Clerk puede haber eliminado ya esta sesión. */ }
      window.location.replace(`/cuenta-eliminada?estado=${status}`)
    } catch {
      setError("No se recibió la confirmación. Comprueba tu conexión y vuelve a intentarlo.")
      submission.current = false
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center p-4 py-12">
      <Card className="w-full border-destructive/40">
        <CardHeader><CardTitle className="text-2xl">Eliminar mi cuenta</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <p>Se eliminarán tu cuenta, todos los subusuarios y los datos de tu negocio: ventas, compras, inventario, clientes, proveedores y registros de caja.</p>
          <p className="font-medium text-destructive">La eliminación es definitiva. Perderás el acceso en todos los dispositivos y no podrás recuperar tus datos.</p>
          <p className="text-sm text-muted-foreground">Se cancelará la renovación de tu suscripción, si tienes una. Las copias que hayas descargado en otros dispositivos no se borran.</p>
          {pendingCount > 0 && <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">Tienes {pendingCount} operaciones pendientes de sincronizar en este dispositivo. También se eliminarán.</p>}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deletion-pin">Tu PIN actual</Label>
              <Input id="deletion-pin" type="password" autoComplete="current-password" maxLength={128} value={pin} onChange={event => setPin(event.target.value)} disabled={submitting} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deletion-confirmation">Escribe ELIMINAR para confirmar</Label>
              <Input id="deletion-confirmation" autoComplete="off" spellCheck={false} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={submitting} required />
            </div>
            {!isOnline && <p role="status" className="text-sm text-destructive">Necesitas conexión a internet para eliminar tu cuenta.</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="destructive" disabled={!isOnline || submitting || !pin || confirmation !== "ELIMINAR"}>{submitting ? "Eliminando cuenta…" : "Eliminar definitivamente"}</Button>
              {!submitting && <Button type="button" variant="outline" asChild><Link href="/billing">Volver</Link></Button>}
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
