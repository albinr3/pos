"use client"

import { useState } from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { FiscalSettingsForm } from "./fiscal-settings-form"

export function FiscalSettingsActivation({ enabled }: { enabled: boolean }) {
  const [showSettings, setShowSettings] = useState(false)

  if (showSettings) return <FiscalSettingsForm />

  if (enabled) return <Button className="mt-4" variant="outline" onClick={() => setShowSettings(true)}>Editar configuración fiscal</Button>

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="mt-4">Activar</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Seguro que quieres activar la facturación electrónica?</AlertDialogTitle>
          <AlertDialogDescription>
            Podrás activar la configuración en ambiente de prueba. Mientras esté activa, las ventas y otras operaciones comerciales protegidas pueden quedar bloqueadas; los pendientes sin conexión se conservarán para revisión. Puedes desactivarla después. La emisión fiscal sigue sin conexión.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => setShowSettings(true)}>Continuar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
