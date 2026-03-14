"use client"

import { FileSpreadsheet } from "lucide-react"
import * as XLSX from "xlsx"

import { Button } from "@/components/ui/button"
import { dateKeyDO } from "@/lib/date-time"

interface ExpenseRow {
  id: string
  expenseDate: string | Date
  description: string
  category: string | null
  amountCents: number
  user: {
    name: string
    username: string | null
  }
}

export function OperatingExpensesExportClient({
  expenses,
  totalCents,
}: {
  expenses: ExpenseRow[]
  totalCents: number
}) {
  function exportToExcel() {
    const excelData = expenses.map((item) => ({
      Fecha: new Date(item.expenseDate).toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo" }),
      Descripcion: item.description,
      Categoria: item.category || "-",
      "Registrado por": item.user.name || item.user.username || "-",
      Monto: item.amountCents / 100,
    }))

    excelData.push({
      Fecha: "",
      Descripcion: "TOTAL",
      Categoria: "-",
      "Registrado por": "-",
      Monto: totalCents / 100,
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)

    ws["!cols"] = [
      { wch: 14 },
      { wch: 40 },
      { wch: 22 },
      { wch: 26 },
      { wch: 14 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, "Gastos")

    const date = dateKeyDO()
    XLSX.writeFile(wb, `gastos_operativos_${date}.xlsx`)
  }

  return (
    <Button onClick={exportToExcel} variant="outline" size="sm">
      <FileSpreadsheet className="mr-2 h-4 w-4" />
      Exportar a Excel
    </Button>
  )
}
