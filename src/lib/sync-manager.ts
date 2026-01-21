"use client"

import { toast } from "@/hooks/use-toast"
import {
  getPendingSales,
  getPendingPayments,
  deletePendingSale,
  deletePendingPayment,
} from "./indexed-db"
import { createSale } from "@/app/(app)/sales/actions"
import { addPayment } from "@/app/(app)/ar/actions"

let isSyncing = false
let syncListeners: Array<(syncing: boolean) => void> = []

export function onSyncStatusChange(listener: (syncing: boolean) => void) {
  syncListeners.push(listener)
  return () => {
    syncListeners = syncListeners.filter((l) => l !== listener)
  }
}

function notifySyncStatus(syncing: boolean) {
  syncListeners.forEach((listener) => listener(syncing))
}

export async function syncPendingData() {
  if (isSyncing) {
    console.log("Sync ya en progreso, ignorando...")
    return
  }

  if (typeof window === "undefined" || !navigator.onLine) {
    console.log("Sin conexión, no se puede sincronizar")
    return
  }

  isSyncing = true
  notifySyncStatus(true)

  try {
    // Primero sincronizar ventas
    const pendingSales = await getPendingSales()
    let salesSynced = 0
    let salesErrors = 0

    for (const sale of pendingSales) {
      try {
        // Convertir la venta offline al formato esperado por createSale
        await createSale({
          customerId: sale.customerId,
          type: sale.type,
          paymentMethod: sale.paymentMethod || undefined,
          paymentSplits: sale.paymentSplits,
          items: sale.items,
          shippingCents: sale.shippingCents || 0,
          username: sale.username,
        })

        // Eliminar de IndexedDB solo si se sincronizó exitosamente
        await deletePendingSale(sale.tempId)
        salesSynced++
      } catch (error) {
        console.error("Error sincronizando venta:", error)
        salesErrors++
        // Continuar con las demás ventas
      }
    }

    // Luego sincronizar pagos
    const pendingPayments = await getPendingPayments()
    let paymentsSynced = 0
    let paymentsErrors = 0

    for (const payment of pendingPayments) {
      try {
        await addPayment({
          arId: payment.arId,
          amountCents: payment.amountCents,
          method: payment.method as any,
          note: payment.note || undefined,
        })

        // Eliminar de IndexedDB solo si se sincronizó exitosamente
        await deletePendingPayment(payment.tempId)
        paymentsSynced++
      } catch (error) {
        console.error("Error sincronizando pago:", error)
        paymentsErrors++
        // Continuar con los demás pagos
      }
    }

    // Mostrar notificaciones
    if (salesSynced > 0 || paymentsSynced > 0) {
      toast({
        title: "Sincronización completada",
        description: `${salesSynced} venta(s) y ${paymentsSynced} pago(s) sincronizados`,
      })
    }

    if (salesErrors > 0 || paymentsErrors > 0) {
      toast({
        title: "Algunos elementos no se pudieron sincronizar",
        description: `${salesErrors} venta(s) y ${paymentsErrors} pago(s) con errores`,
        variant: "destructive",
      })
    }

    if (salesSynced === 0 && paymentsSynced === 0 && salesErrors === 0 && paymentsErrors === 0) {
      // No había nada que sincronizar
      console.log("No hay datos pendientes para sincronizar")
    }
  } catch (error) {
    console.error("Error en sincronización:", error)
    toast({
      title: "Error al sincronizar",
      description: error instanceof Error ? error.message : "Error desconocido",
      variant: "destructive",
    })
  } finally {
    isSyncing = false
    notifySyncStatus(false)
  }
}

// Auto-sincronizar cuando vuelve la conexión
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("Conexión restaurada, iniciando sincronización...")
    syncPendingData()
  })
}
