"use client"

import { toast } from "@/hooks/use-toast"
import {
  getPendingSales,
  getPendingPayments,
  getPendingBatchPayments,
  deletePendingSale,
  deletePendingPayment,
  deletePendingBatchPayment,
  deletePendingPaymentsByArId,
  deletePendingBatchPaymentsByArId,
} from "./indexed-db"
import { createSale } from "@/app/(app)/sales/actions"
import { addBatchPayment, addPayment } from "@/app/(app)/ar/actions"

let isSyncing = false
let syncListeners: Array<(syncing: boolean) => void> = []

function isAlreadyPaidError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes("ya está pagada") || message.includes("ya esta pagada")
}

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
          transferBankName: sale.transferBankName || undefined,
          treasuryAccountId: sale.treasuryAccountId || undefined,
          paymentSplits: sale.paymentSplits,
          items: (sale.items ?? []).map((item: any) => ({
            productId: String(item.productId || ""),
            qty: Number(item.qty ?? 0),
            unitPriceCents: Number(item.unitPriceCents ?? 0),
            wasPriceOverridden: Boolean(item.wasPriceOverridden),
            recipeAdjustments: Array.isArray(item.recipeAdjustments)
              ? item.recipeAdjustments
                  .map((adjustment: any) => ({
                    ingredientId: String(adjustment.ingredientId || ""),
                    adjustmentType: String(adjustment.adjustmentType || "").toUpperCase() as "SIN" | "EXTRA",
                  }))
                  .filter(
                    (adjustment: { ingredientId: string; adjustmentType: string }) =>
                      adjustment.ingredientId.length > 0 &&
                      (adjustment.adjustmentType === "SIN" || adjustment.adjustmentType === "EXTRA")
                  )
              : [],
          })),
          shippingCents: sale.shippingCents || 0,
          discountMode: sale.discountMode === "MANUAL" ? "MANUAL" : sale.discountMode === "AUTO" ? "AUTO" : undefined,
          manualDiscountPercentBp:
            typeof sale.manualDiscountPercentBp === "number" ? sale.manualDiscountPercentBp : undefined,
          salePricesIncludeItbis:
            typeof sale.salePricesIncludeItbis === "boolean" ? sale.salePricesIncludeItbis : undefined,
          applyLegalTip:
            typeof sale.applyLegalTip === "boolean" ? sale.applyLegalTip : undefined,
          soldAt: sale.createdAt,
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

    // Luego sincronizar pagos batch (para conservar un solo recibo por lote)
    const pendingBatchPayments = await getPendingBatchPayments()
    let paymentsSynced = 0
    let paymentsErrors = 0
    let paymentsDiscardedAlreadyPaid = 0

    for (const batchPayment of pendingBatchPayments) {
      try {
        const arIds = Array.isArray(batchPayment.arIds)
          ? batchPayment.arIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
          : []
        if (arIds.length === 0) {
          throw new Error("Pago batch inválido: sin facturas")
        }

        await addBatchPayment({
          arIds,
          amountCents: Number(batchPayment.amountCents ?? 0),
          method: batchPayment.method as any,
          transferBankName: batchPayment.transferBankName || undefined,
          treasuryAccountId: batchPayment.treasuryAccountId || undefined,
          note: batchPayment.note || undefined,
        })

        await deletePendingBatchPayment(batchPayment.tempId)
        paymentsSynced++
      } catch (error) {
        console.error("Error sincronizando pago batch:", error)
        if (isAlreadyPaidError(error)) {
          await deletePendingBatchPayment(batchPayment.tempId)
          const arIds = Array.isArray(batchPayment.arIds)
            ? batchPayment.arIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
            : []
          for (const arId of arIds) {
            await deletePendingPaymentsByArId(arId)
            await deletePendingBatchPaymentsByArId(arId)
          }
          paymentsDiscardedAlreadyPaid++
          continue
        }
        paymentsErrors++
        // Continuar con los demás pagos batch
      }
    }

    // Luego sincronizar pagos individuales
    const pendingPayments = await getPendingPayments()

    for (const payment of pendingPayments) {
      try {
        await addPayment({
          arId: payment.arId,
          amountCents: payment.amountCents,
          method: payment.method as any,
          transferBankName: payment.transferBankName || undefined,
          treasuryAccountId: payment.treasuryAccountId || undefined,
          note: payment.note || undefined,
        })

        // Eliminar de IndexedDB solo si se sincronizó exitosamente
        await deletePendingPayment(payment.tempId)
        paymentsSynced++
      } catch (error) {
        console.error("Error sincronizando pago:", error)
        if (isAlreadyPaidError(error)) {
          await deletePendingPayment(payment.tempId)
          if (typeof payment.arId === "string" && payment.arId.length > 0) {
            await deletePendingPaymentsByArId(payment.arId)
            await deletePendingBatchPaymentsByArId(payment.arId)
          }
          paymentsDiscardedAlreadyPaid++
          continue
        }
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

    if (paymentsDiscardedAlreadyPaid > 0) {
      toast({
        title: "Pagos descartados por factura ya pagada",
        description: `Se limpiaron ${paymentsDiscardedAlreadyPaid} pago(s) pendientes para evitar reintentos repetidos.`,
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
