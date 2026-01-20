"use client"

import { useEffect, useRef } from "react"
import JsBarcode from "jsbarcode"
import { useBluetoothPrint } from "@/hooks/use-bluetooth-print"
import { Bluetooth, Printer } from "lucide-react"

interface BarcodeLabelProps {
  productName: string
  sku: string | null
  reference: string | null
  priceCents: number
  labelSize?: string // "4x2", "3x1", "2x1", "2.25x1.25"
  onPrintComplete?: () => void
}

// Map label size strings to CSS page sizes
const BARCODE_LABEL_SIZES: Record<string, { width: string; height: string }> = {
  "4x2": { width: "4in", height: "2in" },
  "3x1": { width: "3in", height: "1in" },
  "2x1": { width: "2in", height: "1in" },
  "2.25x1.25": { width: "2.25in", height: "1.25in" },
}

export function BarcodeLabel({ productName, sku, reference, priceCents, labelSize = "4x2", onPrintComplete }: BarcodeLabelProps) {
  const barcodeRefPreview = useRef<SVGSVGElement>(null)
  const barcodeRefPrint = useRef<SVGSVGElement>(null)
  const { handlePrint, isPrinting, isConnecting, isBluetoothSupported } = useBluetoothPrint({
    onPrintComplete,
  })

  useEffect(() => {
    if (sku) {
      if (barcodeRefPreview.current) {
        try {
          JsBarcode(barcodeRefPreview.current, sku, {
            format: "CODE128",
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 14,
            margin: 10,
          })
        } catch (error) {
          console.error("Error generando código de barras:", error)
        }
      }
      if (barcodeRefPrint.current) {
        try {
          JsBarcode(barcodeRefPrint.current, sku, {
            format: "CODE128",
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 14,
            margin: 10,
          })
        } catch (error) {
          console.error("Error generando código de barras:", error)
        }
      }
    }
  }, [sku])

  const formatPrice = (cents: number) => {
    return `RD$ ${(cents / 100).toFixed(2)}`
  }

  const size = BARCODE_LABEL_SIZES[labelSize] || BARCODE_LABEL_SIZES["4x2"]
  const isSmall = labelSize === "2x1" || labelSize === "2.25x1.25"

  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .barcode-label-print,
          .barcode-label-print * {
            visibility: visible;
          }
          .barcode-label-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            size: ${size.width} ${size.height};
            margin: 0.1in;
          }
        }
      `}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:hidden">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4">Vista previa de etiqueta</h3>
          <div className="border border-gray-300 p-4 rounded mb-4">
            <div className="text-center mb-2">
              <div className="text-sm font-semibold mb-1">{productName}</div>
              {reference && (
                <div className="text-xs text-gray-600 mb-1">Ref: {reference}</div>
              )}
              {sku && (
                <div className="flex justify-center my-2">
                  <svg ref={barcodeRefPreview} className="max-w-full h-auto" />
                </div>
              )}
              {!sku && (
                <div className="text-xs text-gray-500 py-4">Sin código de barras</div>
              )}
              <div className="text-base font-bold mt-1">{formatPrice(priceCents)}</div>
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
      <div className={`barcode-label-print hidden print:block print:p-2 print:mx-auto`} style={{ maxWidth: size.width }}>
        <div className="print:border print:border-gray-300 print:p-1 print:rounded">
          <div className="print:text-center">
            <div className={`print:font-semibold print:mb-0.5 ${isSmall ? "print:text-[8px]" : "print:text-xs"}`}>{productName}</div>
            {reference && !isSmall && (
              <div className="print:text-[8px] print:text-gray-600 print:mb-0.5">Ref: {reference}</div>
            )}
            {sku && (
              <div className="print:flex print:justify-center print:my-1">
                <svg ref={barcodeRefPrint} className="print:max-w-full print:h-auto" />
              </div>
            )}
            {!sku && (
              <div className={`print:text-gray-500 print:py-2 ${isSmall ? "print:text-[8px]" : "print:text-xs"}`}>Sin código de barras</div>
            )}
            <div className={`print:font-bold ${isSmall ? "print:text-[10px]" : "print:text-sm"}`}>{formatPrice(priceCents)}</div>
          </div>
        </div>
      </div>
    </>
  )
}

