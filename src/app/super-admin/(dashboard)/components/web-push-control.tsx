"use client"

import { useEffect, useState } from "react"
import { BellOff, BellRing, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

function urlBase64ToUint8Array(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const rawData = window.atob(base64 + padding)
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0))
}

export function WebPushControl() {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void fetch("/api/super-admin/push-subscription", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return
        const data = await response.json()
        setEnabled(Boolean(data.enabled))
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  const activate = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      toast({ title: "No compatible", description: "Este navegador no admite notificaciones web.", variant: "destructive" })
      return
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) {
      toast({ title: "Configuración pendiente", description: "Falta configurar la clave pública VAPID.", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        toast({ title: "Permiso no concedido", description: "Activa las notificaciones para este sitio en tu navegador.", variant: "destructive" })
        return
      }

      // Registramos aquí también para que la activación no dependa del orden de carga del layout.
      const registration = await navigator.serviceWorker.register("/sw.js")
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const response = await fetch("/api/super-admin/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "No se pudo guardar la suscripción.")

      setEnabled(true)
      toast({ title: "Alertas activadas", description: "Este celular recibirá los nuevos registros." })
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo activar la alerta push."
      toast({ title: "No se pudo activar", description: message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async () => {
    setSaving(true)
    try {
      const registration = await navigator.serviceWorker?.getRegistration("/sw.js")
      const subscription = await registration?.pushManager.getSubscription()
      await subscription?.unsubscribe()

      const response = await fetch("/api/super-admin/push-subscription", { method: "DELETE" })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "No se pudo desactivar la suscripción.")

      setEnabled(false)
      toast({ title: "Alertas desactivadas", description: "Este celular ya no recibirá nuevos registros." })
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo desactivar la alerta push."
      toast({ title: "No se pudo desactivar", description: message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />

  return enabled ? (
    <Button variant="ghost" size="icon" onClick={deactivate} disabled={saving} aria-label="Desactivar alertas push" title="Desactivar alertas en este celular">
      {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <BellRing className="h-5 w-5 text-green-600" />}
    </Button>
  ) : (
    <Button variant="ghost" size="icon" onClick={activate} disabled={saving} aria-label="Activar alertas push" title="Activar alertas en este celular">
      {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <BellOff className="h-5 w-5" />}
    </Button>
  )
}
