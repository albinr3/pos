import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatRD } from "@/lib/money"

import { getDailyClose } from "./actions"

import { DateRangeFilter } from "./filter-client"
import { requireModuleAccess } from "@/lib/module-access"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function DailyClosePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireModuleAccess("canAccessDailyClose")

  const sp = await searchParams
  const data = await getDailyClose({ from: sp.from, to: sp.to })

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cuadre diario</h1>
          <p className="text-sm text-muted-foreground">Resumen de lo vendido, cobrado y lo que debe haber en caja.</p>
        </div>
        <DateRangeFilter basePath="/daily-close" />
      </div>

      {/* ─── SECCIÓN 1: VENTAS DEL DÍA ──────────────────── */}
      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">🧾 Ventas del día</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Ventas en efectivo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatRD(data.sales.cashEfectivoCents)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Ventas con tarjeta / transferencia</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatRD(data.sales.cashTarjetaCents + data.sales.cashTransferenciaCents)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Ventas a crédito</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatRD(data.sales.creditCents)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{data.sales.creditCount} facturas</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Total de ventas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatRD(data.sales.totalCents)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{data.sales.totalCount} facturas</div>
            </CardContent>
          </Card>

          {data.sales.returnsCents > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Devoluciones contado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-red-600">-{formatRD(data.sales.returnsCents)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Neto: {formatRD(data.sales.netCents)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Detalle de ventas contado por método */}
        {data.sales.byMethod.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Ventas al contado por método de pago</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {data.sales.byMethod.map((item) => (
                <div key={item.method} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">{item.label}</span>
                    <span className="font-semibold">{formatRD(item.totalCents)}</span>
                  </div>

                  {item.method === "TRANSFERENCIA" && item.banks.length > 0 ? (
                    <div className="mt-3 grid gap-2 border-t pt-3">
                      {item.banks.map((bank) => (
                        <div key={bank.bankName} className="flex items-center justify-between gap-4 text-muted-foreground">
                          <span>{bank.bankName}</span>
                          <span className="font-medium text-foreground">{formatRD(bank.totalCents)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ─── SECCIÓN 2: COBROS DEL DÍA ──────────────────── */}
      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">💰 Cobros del día</h2>
        <p className="text-sm text-muted-foreground -mt-2">Lo que realmente entra a caja</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Efectivo recibido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatRD(data.collections.arEfectivoCents)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Pagos con tarjeta</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatRD(data.collections.arTarjetaCents)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Transferencias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatRD(data.collections.arTransferenciaCents)}</div>
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-primary">Total cobrado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatRD(data.collections.totalCents)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {data.collections.arPaymentsCount} abonos recibidos
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detalle de cobros de créditos anteriores por método */}
        {data.collections.arByMethod.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Recibos por método de pago</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {data.collections.arByMethod.map((item) => (
                <div key={item.method} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">{item.label}</span>
                    <span className="font-semibold">{formatRD(item.totalCents)}</span>
                  </div>

                  {item.method === "TRANSFERENCIA" && item.banks.length > 0 ? (
                    <div className="mt-3 grid gap-2 border-t pt-3">
                      {item.banks.map((bank) => (
                        <div key={bank.bankName} className="flex items-center justify-between gap-4 text-muted-foreground">
                          <span>{bank.bankName}</span>
                          <span className="font-medium text-foreground">{formatRD(bank.totalCents)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ─── SECCIÓN 3: TOTAL EN CAJA ──────────────────── */}
      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">🏦 Efectivo en caja</h2>
        <p className="text-sm text-muted-foreground -mt-2">
          Dinero físico ingresado (efectivo de ventas al contado + efectivo de cobros)
        </p>

        <Card className="border-2 border-green-600/30 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span>Efectivo de ventas contado</span>
                <span className="font-semibold">{formatRD(data.cashRegister.cashFromSalesCents)}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span>Efectivo de abonos (créditos)</span>
                <span className="font-semibold">{formatRD(data.cashRegister.cashFromArCents)}</span>
              </div>

              <div className="flex items-center justify-between gap-4 border-t-2 border-green-600/30 pt-3">
                <span className="text-lg font-bold text-green-700 dark:text-green-400">= Efectivo total ingresado</span>
                <span className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {formatRD(data.cashRegister.totalCashInCents)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info adicional para recordatorio: Devoluciones y Gastos */}
        {(data.cashRegister.returnsCents > 0 || data.cashRegister.expensesCents > 0) && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Información referencial: Salidas del día</CardTitle>
              <div className="text-xs text-muted-foreground mt-1">
                Gastos y devoluciones no se restan automáticamente del efectivo en caja porque podrían involucrar transacciones bancarias en vez de billetes físicos. Si se pagó con billetes físicos, desconectar del número de arriba manualmente al contar la caja.
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {data.cashRegister.returnsCents > 0 && (
                <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <span className="text-muted-foreground">Devoluciones totales</span>
                  <span className="font-semibold text-red-600">-{formatRD(data.cashRegister.returnsCents)}</span>
                </div>
              )}
              {data.cashRegister.expenses.map((expense, i) => (
                <div key={i} className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <span className="text-muted-foreground">Gasto: {expense.description}</span>
                  <span className="font-semibold text-red-600">-{formatRD(expense.amountCents)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
