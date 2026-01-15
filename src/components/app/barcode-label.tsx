"use client"

import { useEffect, useRef } from "react"
import JsBarcode from "jsbarcode"

interface BarcodeLabelProps {
  productName: string
  sku: string | null
  reference: string | null
  priceCents: number
  onPrintComplete?: () => void
}

export function BarcodeLabel({ productName, sku, reference, priceCents, onPrintComplete }: BarcodeLabelProps) {
  const barcodeRefPreview = useRef<SVGSVGElement>(null)
  const barcodeRefPrint = useRef<SVGSVGElement>(null)

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

  const handlePrint = () => {
    window.print()
    if (onPrintComplete) {
      setTimeout(onPrintComplete, 100)
    }
  }

  useEffect(() => {
    const handleAfterPrint = () => {
      if (onPrintComplete) {
        onPrintComplete()
      }
    }

    window.addEventListener("afterprint", handleAfterPrint)
    return () => window.removeEventListener("afterprint", handleAfterPrint)
  }, [onPrintComplete])

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
            size: 4in 2in;
            margin: 0.2in;
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
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Imprimir
            </button>
          </div>
        </div>
      </div>
      <div className="barcode-label-print hidden print:block print:p-4 print:max-w-[4in] print:mx-auto">
        <div className="print:border print:border-gray-300 print:p-2 print:rounded">
          <div className="print:text-center print:mb-2">
            <div className="print:text-xs print:font-semibold print:mb-1">{productName}</div>
            {reference && (
              <div className="print:text-xs print:text-gray-600 print:mb-1">Ref: {reference}</div>
            )}
            {sku && (
              <div className="print:flex print:justify-center print:my-2">
                <svg ref={barcodeRefPrint} className="print:max-w-full print:h-auto" />
              </div>
            )}
            {!sku && (
              <div className="print:text-xs print:text-gray-500 print:py-4">Sin código de barras</div>
            )}
            <div className="print:text-sm print:font-bold print:mt-1">{formatPrice(priceCents)}</div>
          </div>
        </div>
      </div>
    </>
  )
}

