"use client"

import { useMemo, useState } from "react"
import { formatDateDO, formatDateTimeDO } from "@/lib/date-time"
import { Printer, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import type { SuperAdminAccountsReportRow } from "./actions"

type Props = {
  rows: SuperAdminAccountsReportRow[]
}

export function SuperAdminReportsClient({ rows }: Props) {
  const [search, setSearch] = useState("")
  const generatedAt = useMemo(() => new Date(), [])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows

    return rows.filter((row) => {
      return (
        row.accountName.toLowerCase().includes(query) ||
        row.accountId.toLowerCase().includes(query) ||
        (row.ownerName || "").toLowerCase().includes(query) ||
        (row.ownerEmail || "").toLowerCase().includes(query) ||
        (row.billingEmail || "").toLowerCase().includes(query) ||
        (row.ownerWhatsapp || "").toLowerCase().includes(query)
      )
    })
  }, [rows, search])

  return (
    <div className="space-y-6">
      <div className="print:space-y-1">
        <h1 className="text-3xl font-bold print:text-2xl">Reporte de Cuentas</h1>
        <p className="text-muted-foreground print:text-black">
          Listado general de cuentas con correo, email y telefono de WhatsApp.
        </p>
        <p className="hidden text-xs text-muted-foreground print:block print:text-black">
          Generado: {formatDateTimeDO(generatedAt)}
        </p>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Filtros y acciones</CardTitle>
          <CardDescription>
            Puedes buscar por nombre de cuenta, correo, email, WhatsApp o ID de cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir reporte
          </Button>
        </CardContent>
      </Card>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="print:pb-2">
          <CardTitle>
            Total de cuentas: {filteredRows.length}
          </CardTitle>
          <CardDescription className="print:text-black">
            Incluye numero de cuenta, correos y WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border print:border-none">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead># Cuenta</TableHead>
                  <TableHead>ID / Numero de cuenta</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Correo propietario</TableHead>
                  <TableHead>Email facturacion</TableHead>
                  <TableHead>Telefono WhatsApp</TableHead>
                  <TableHead>Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No hay resultados para los filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell>{row.accountNumber}</TableCell>
                      <TableCell className="font-mono text-xs">{row.accountId}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.accountName}</div>
                        {row.ownerName ? <div className="text-xs text-muted-foreground">{row.ownerName}</div> : null}
                      </TableCell>
                      <TableCell>{row.ownerEmail || "-"}</TableCell>
                      <TableCell>{row.billingEmail || "-"}</TableCell>
                      <TableCell>{row.ownerWhatsapp || "-"}</TableCell>
                      <TableCell>{formatDateDO(row.createdAt, { year: "numeric", month: "2-digit", day: "2-digit" })}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
