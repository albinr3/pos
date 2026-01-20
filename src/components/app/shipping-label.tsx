"use client"

import { useEffect } from "react"
import { useBluetoothPrint } from "@/hooks/use-bluetooth-print"
import { Bluetooth, Printer } from "lucide-react"

interface ShippingLabelProps {
  customerName: string
  customerAddress: string | null
  customerPhone: string | null
  customerProvince: string | null
  senderName: string
  packageCount: number
  labelSize?: string // "4x6", "4x4", "6x4"
  onPrintComplete?: () => void
}

// Map label size strings to CSS page sizes
const SHIPPING_LABEL_SIZES: Record<string, { width: string; height: string }> = {
  "4x6": { width: "4in", height: "6in" },
  "4x4": { width: "4in", height: "4in" },
  "6x4": { width: "6in", height: "4in" },
}

export function ShippingLabel({
  customerName,
  customerAddress,
  customerPhone,
  customerProvince,
  senderName,
  packageCount,
  labelSize = "4x6",
  onPrintComplete,
}: ShippingLabelProps) {
  const { handlePrint, isPrinting, isConnecting, isBluetoothSupported } = useBluetoothPrint({
    onPrintComplete,
  })

  const size = SHIPPING_LABEL_SIZES[labelSize] || SHIPPING_LABEL_SIZES["4x6"]
  const isCompact = labelSize === "4x4"
  const isHorizontal = labelSize === "6x4"

  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .shipping-label-print,
          .shipping-label-print * {
            visibility: visible;
          }
          .shipping-label-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            size: ${size.width} ${size.height};
            margin: 0.2in;
          }
        }
      `}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:hidden">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">Vista previa de etiqueta de envío</h3>
          <div className="border border-gray-300 p-4 rounded mb-4 bg-white">
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500 uppercase mb-1">Destinatario</div>
                <div className="font-semibold text-base">{customerName}</div>
              </div>
              {customerAddress && (
                <div>
                  <div className="text-xs text-gray-500 uppercase mb-1">Dirección</div>
                  <div className="text-sm">{customerAddress}</div>
                </div>
              )}
              {customerProvince && (
                <div>
                  <div className="text-xs text-gray-500 uppercase mb-1">Provincia</div>
                  <div className="text-sm">{customerProvince}</div>
                </div>
              )}
              {customerPhone && (
                <div>
                  <div className="text-xs text-gray-500 uppercase mb-1">Teléfono</div>
                  <div className="text-sm">{customerPhone}</div>
                </div>
              )}
              <div className="border-t pt-3 mt-3">
                <div className="text-xs text-gray-500 uppercase mb-1">Remitente</div>
                <div className="font-semibold text-sm">{senderName}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase mb-1">Cantidad de bultos</div>
                <div className="font-semibold text-base">{packageCount}</div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => onPrintComplete?.()}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            >
              Cancelar
            </button>
            {isBluetoothSupported ? (
              <button
                onClick={() => handlePrint(true)}
                disabled={isPrinting || isConnecting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="Imprimir a impresora Bluetooth"
              >
                <Bluetooth className="h-3 w-3" />
                {isConnecting ? "Conectando..." : isPrinting ? "Imprimiendo..." : "Bluetooth"}
              </button>
            ) : null}
            <button
              onClick={() => handlePrint(false)}
              disabled={isPrinting || isConnecting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              title="Imprimir (método estándar)"
            >
              <Printer className="h-3 w-3" />
              {isPrinting ? "Imprimiendo..." : "Imprimir"}
            </button>
          </div>
        </div>
      </div>
      <div className={`shipping-label-print hidden print:block print:p-3 print:mx-auto`} style={{ maxWidth: size.width }}>
        <div className={`print:border print:border-gray-800 print:rounded ${isCompact || isHorizontal ? "print:p-2" : "print:p-4"}`}>
          <div className={`${isCompact || isHorizontal ? "print:space-y-2" : "print:space-y-3"}`}>
            <div>
              <div className="print:text-xs print:text-gray-600 print:uppercase print:mb-1">Destinatario</div>
              <div className="print:font-bold print:text-lg print:border-b print:border-gray-300 print:pb-1">{customerName}</div>
            </div>
            {customerAddress && (
              <div>
                <div className="print:text-xs print:text-gray-600 print:uppercase print:mb-1">Dirección</div>
                <div className="print:text-sm print:font-medium">{customerAddress}</div>
              </div>
            )}
            {customerProvince && (
              <div>
                <div className="print:text-xs print:text-gray-600 print:uppercase print:mb-1">Provincia</div>
                <div className="print:text-sm print:font-medium">{customerProvince}</div>
              </div>
            )}
            {customerPhone && (
              <div>
                <div className="print:text-xs print:text-gray-600 print:uppercase print:mb-1">Teléfono</div>
                <div className="print:text-sm print:font-medium">{customerPhone}</div>
              </div>
            )}
            <div className="print:border-t print:border-gray-400 print:pt-3 print:mt-3">
              <div className="print:text-xs print:text-gray-600 print:uppercase print:mb-1">Remitente</div>
              <div className="print:font-semibold print:text-base">{senderName}</div>
            </div>
            <div>
              <div className="print:text-xs print:text-gray-600 print:uppercase print:mb-1">Cantidad de bultos</div>
              <div className="print:font-bold print:text-xl print:border print:border-gray-400 print:inline-block print:px-3 print:py-1 print:rounded">
                {packageCount}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

