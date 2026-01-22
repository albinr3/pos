"use client"

import { useEffect, useState } from "react"

export function useOnlineStatus() {
  // Para desarrollo: verificar parámetro de URL para forzar offline
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window === "undefined") return true
    
    // Verificar si hay ?offline=true en la URL para desarrollo
    // Este parámetro tiene prioridad sobre navigator.onLine
    const params = new URLSearchParams(window.location.search)
    if (params.get("offline") === "true") {
      return false
    }
    
    return navigator.onLine
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    let pingInFlight = false
    // Ping al health-check para detectar conectividad real.
    const HEALTH_CHECK_URL = "/api/health-check"
    const PING_INTERVAL_MS = 3000
    const PING_TIMEOUT_MS = 2000

    const hasOfflineParam = () => {
      const params = new URLSearchParams(window.location.search)
      return params.get("offline") === "true"
    }

    const setOffline = () => {
      setIsOnline((prev) => (prev ? false : prev))
    }

    const setOnline = () => {
      setIsOnline((prev) => (prev ? prev : true))
    }

    // Funcion para verificar el estado real
    const checkStatus = () => {
      // Si hay ?offline=true en la URL, SIEMPRE forzar offline (prioridad absoluta)
      if (hasOfflineParam()) {
        setOffline()
        return // No hacer nada mas si esta forzado
      }

      // Si no hay parametro, usar navigator.onLine para detectar offline inmediato
      if (!navigator.onLine) {
        setOffline()
      }
    }

    const verifyOnline = async () => {
      if (pingInFlight) return
      if (hasOfflineParam()) return
      if (!navigator.onLine) {
        setOffline()
        return
      }

      pingInFlight = true
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), PING_TIMEOUT_MS)

      try {
        const response = await fetch(HEALTH_CHECK_URL, {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        })
        if (response && response.ok) {
          setOnline()
        } else {
          setOffline()
        }
      } catch {
        setOffline()
      } finally {
        clearTimeout(timeout)
        pingInFlight = false
      }
    }

    const handleOnline = () => {
      // IGNORAR evento online si hay ?offline=true en la URL
      if (hasOfflineParam()) {
        console.log("[useOnlineStatus] Ignorando evento 'online' porque ?offline=true esta activo")
        return
      }
      console.log("[useOnlineStatus] Evento 'online' recibido")
      verifyOnline()
    }

    const handleOffline = () => {
      // IGNORAR evento offline si hay ?offline=true en la URL (ya esta offline)
      if (hasOfflineParam()) {
        console.log("[useOnlineStatus] Ignorando evento 'offline' porque ?offline=true ya esta activo")
        return
      }
      console.log("[useOnlineStatus] Evento 'offline' recibido")
      setOffline()
    }

    // Verificar inmediatamente
    checkStatus()
    verifyOnline()

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    // Verificar periodicamente (cada 500ms) para detectar cambios en la URL
    const interval = setInterval(checkStatus, 500)
    const pingInterval = setInterval(verifyOnline, PING_INTERVAL_MS)

    // Tambien escuchar cambios en la URL (cuando se navega sin recargar)
    const handlePopState = () => {
      console.log("[useOnlineStatus] PopState detectado, verificando estado")
      checkStatus()
    }
    window.addEventListener("popstate", handlePopState)

    // Escuchar cambios en la URL usando MutationObserver (para Next.js router)
    const observer = new MutationObserver(() => {
      checkStatus()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("popstate", handlePopState)
      clearInterval(interval)
      clearInterval(pingInterval)
      observer.disconnect()
    }
  }, [])

  // Debug en desarrollo
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null
      console.log("[useOnlineStatus] isOnline:", isOnline, "navigator.onLine:", typeof window !== "undefined" ? navigator.onLine : "N/A", "?offline=", params?.get("offline"))
    }
  }, [isOnline])

  return isOnline
}
