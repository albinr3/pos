"use client"

import { useEffect, useState } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { clearAccountLocalData, isAccountCleanupPending } from "@/lib/account-deletion-client"
import { Button } from "@/components/ui/button"

export function DeletedAccountCleanup({ allowCleanup }: { allowCleanup: boolean }) {
  const { signOut } = useClerk()
  const { isSignedIn } = useAuth()
  const [failed, setFailed] = useState(false)
  async function clean() {
    try { await clearAccountLocalData(); setFailed(false) } catch { setFailed(true) }
  }
  useEffect(() => {
    // Visitar una URL pública no autoriza borrar pendientes ni cerrar una cuenta distinta.
    if (!allowCleanup && !isAccountCleanupPending()) return
    void (async () => {
      try { await clearAccountLocalData(); setFailed(false) } catch { setFailed(true) }
      // Esperar la limpieza antes de que el cierre de Clerk navegue fuera de esta página.
      await fetch("/api/auth/logout-subuser", { method: "POST" }).catch(() => {})
      if (isSignedIn) await signOut({ redirectUrl: window.location.href }).catch(() => {})
    })()
  }, [allowCleanup, isSignedIn, signOut])
  return failed ? <div role="alert" className="space-y-2 text-sm"><p>No se pudieron limpiar los datos locales de este navegador.</p><Button variant="outline" onClick={() => void clean()}>Reintentar limpieza</Button></div> : null
}
