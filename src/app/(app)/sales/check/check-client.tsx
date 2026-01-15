"use client"

import { useState, useTransition } from "react"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatRD } from "@/lib/money"
import { checkSaleExists, getAllSalesForDiagnosis } from "../check-sale"
import { diagnoseDatabase } from "../diagnose-db"

export function CheckSaleClient() {
  const [invoiceCode, setInvoiceCode] = useState("")
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkSaleExists>> | null>(null)
  const [allSales, setAllSales] = useState<Awaited<ReturnType<typeof getAllSalesForDiagnosis>>>([])
  const [diagnosis, setDiagnosis] = useState<Awaited<ReturnType<typeof diagnoseDatabase>> | null>(null)
  const [isLoading, startLoading] = useTransition()
  const [showAll, setShowAll] = useState(false)
  const [showDiagnosis, setShowDiagnosis] = useState(false)

  async function handleSearch() {
    if (!invoiceCode.trim()) return
    startLoading(async () => {
      try {
        const r = await checkSaleExists(invoiceCode.trim())
        setResult(r)
      } catch (e) {
        setResult({ exists: false, similarCodes: [] })
      }
    })
  }

  async function handleShowAll() {
    startLoading(async () => {
      try {
        const sales = await getAllSalesForDiagnosis()
        setAllSales(sales)
        setShowAll(true)
      } catch {
        setAllSales([])
      }
    })
  }

  async function handleDiagnose() {
    startLoading(async () => {
      try {
        const result = await diagnoseDatabase()
        setDiagnosis(result)
        setShowDiagnosis(true)
      } catch {
        setDiagnosis({ success: false, error: "Error al diagnosticar" })
      }
    })
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Buscar Factura</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Código de Factura (ej: A-00001)</Label>
            <div className="flex gap-2">
              <Input
                value={invoiceCode}
                onChange={(e) => setInvoiceCode(e.target.value)}
                placeholder="A-00001"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch()
                }}
              />
              <Button onClick={handleSearch} disabled={isLoading || !invoiceCode.trim()}>
                <Search className="mr-2 h-4 w-4" />
                Buscar
              </Button>
            </div>
          </div>

          {result && (
            <div className="rounded-md border p-4">
              {result.exists ? (
                <div className="space-y-2">
                  <div className="font-semibold text-green-600">✓ Factura encontrada</div>
                  <div className="grid gap-1 text-sm">
                    <div>
                      <span className="font-medium">Código:</span> {result.sale.invoiceCode}
                    </div>
                    <div>
                      <span className="font-medium">Fecha:</span> {new Date(result.sale.soldAt).toLocaleDateString("es-DO")}
                    </div>
                    <div>
                      <span className="font-medium">Cliente:</span> {result.sale.customer}
                    </div>
                    <div>
                      <span className="font-medium">Total:</span> {formatRD(result.sale.totalCents)}
                    </div>
                    {result.sale.cancelledAt && (
                      <div className="font-semibold text-red-600">
                        ⚠ Esta factura está CANCELADA (fecha: {new Date(result.sale.cancelledAt).toLocaleDateString("es-DO")})
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="font-semibold text-red-600">✗ Factura NO encontrada</div>
                  {result.similarCodes.length > 0 && (
                    <div className="text-sm">
                      <div className="font-medium">Códigos similares encontrados:</div>
                      <ul className="list-disc list-inside mt-1">
                        {result.similarCodes.map((code) => (
                          <li key={code}>{code}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico de Base de Datos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex gap-2">
            <Button onClick={handleDiagnose} disabled={isLoading} variant="outline">
              {showDiagnosis ? "Ocultar" : "Mostrar"} Diagnóstico Completo
            </Button>
            <Button onClick={handleShowAll} disabled={isLoading} variant="outline">
              {showAll ? "Ocultar" : "Mostrar"} últimas 100 facturas
            </Button>
          </div>

          {showDiagnosis && diagnosis && (
            <div className="rounded-md border p-4 space-y-4">
              {diagnosis.success ? (
                <>
                  <div>
                    <div className="font-semibold">Estado de la Base de Datos:</div>
                    <div className="text-sm mt-1">
                      <div>Total de facturas: <span className="font-medium">{diagnosis.totalSales}</span></div>
                      <div>Columnas de cancelación encontradas: {diagnosis.saleColumns.length}/2</div>
                    </div>
                  </div>

                  {diagnosis.saleColumns.length < 2 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                      <div className="font-semibold text-yellow-800">⚠️ Advertencia</div>
                      <div className="text-sm text-yellow-700 mt-1">
                        Las columnas de cancelación no existen en la base de datos. 
                        Necesitas ejecutar la migración de cancelación.
                      </div>
                    </div>
                  )}

                  {diagnosis.lastSales.length > 0 && (
                    <div>
                      <div className="font-semibold mb-2">Últimas 10 facturas:</div>
                      <div className="space-y-1 text-sm">
                        {diagnosis.lastSales.map((s) => (
                          <div key={s.id} className="flex justify-between">
                            <span>{s.invoiceCode} - {new Date(s.soldAt).toLocaleDateString("es-DO")}</span>
                            <span>{formatRD(s.totalCents)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-red-600">Error: {diagnosis.error}</div>
              )}
            </div>
          )}

          {showAll && allSales.length > 0 && (
            <div className="rounded-md border">
              <div className="p-4 text-sm font-medium border-b">Total: {allSales.length} facturas</div>
              <div className="max-h-96 overflow-y-auto">
                <div className="divide-y">
                  {allSales.map((s) => (
                    <div key={s.id} className="p-3 text-sm hover:bg-muted">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-medium">{s.invoiceCode}</span>
                          <span className="text-muted-foreground ml-2">
                            {new Date(s.soldAt).toLocaleDateString("es-DO")} - {formatRD(s.totalCents)}
                          </span>
                          {s.cancelledAt && (
                            <span className="ml-2 text-xs text-red-600 font-semibold">[CANCELADA]</span>
                          )}
                        </div>
                        <div className="text-muted-foreground">{s.customer?.name || "Cliente Genérico"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

