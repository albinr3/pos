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

    // Función para verificar el estado real
    const checkStatus = () => {
      const params = new URLSearchParams(window.location.search)
      const hasOfflineParam = params.get("offline") === "true"
      
      // Si hay ?offline=true en la URL, SIEMPRE forzar offline (prioridad absoluta)
      if (hasOfflineParam) {
        setIsOnline((prev) => {
          if (prev) {
            console.log("[useOnlineStatus] Forzando offline por parámetro URL")
            return false
          }
          return prev
        })
        return // No hacer nada más si está forzado
      }
      
      // Si no hay parámetro, usar el estado real de navigator.onLine
      const shouldBeOnline = navigator.onLine
      setIsOnline((prev) => {
        if (prev !== shouldBeOnline) {
          console.log("[useOnlineStatus] Cambiando estado a:", shouldBeOnline, "según navigator.onLine")
          return shouldBeOnline
        }
        return prev
      })
    }

    const handleOnline = () => {
      // IGNORAR evento online si hay ?offline=true en la URL
      const params = new URLSearchParams(window.location.search)
      if (params.get("offline") === "true") {
        console.log("[useOnlineStatus] Ignorando evento 'online' porque ?offline=true está activo")
        return
      }
      console.log("[useOnlineStatus] Evento 'online' recibido")
      setIsOnline(true)
    }
    
    const handleOffline = () => {
      // IGNORAR evento offline si hay ?offline=true en la URL (ya está offline)
      const params = new URLSearchParams(window.location.search)
      if (params.get("offline") === "true") {
        console.log("[useOnlineStatus] Ignorando evento 'offline' porque ?offline=true ya está activo")
        return
      }
      console.log("[useOnlineStatus] Evento 'offline' recibido")
      setIsOnline(false)
    }

    // Verificar inmediatamente
    checkStatus()

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    // Verificar periódicamente (cada 500ms) para detectar cambios en la URL
    const interval = setInterval(checkStatus, 500)

    // También escuchar cambios en la URL (cuando se navega sin recargar)
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
