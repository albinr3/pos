"use client"

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { formatRD } from "@/lib/money"

type ChartData = {
  date: string
  label: string
  total: number
  cash: number
  credit: number
}

const COLORS = [
  "#3b82f6", // Azul
  "#10b981", // Verde
  "#f59e0b", // Naranja
  "#ef4444", // Rojo
  "#8b5cf6", // Púrpura
  "#ec4899", // Rosa
  "#06b6d4", // Cian
  "#84cc16", // Lima
]

export function SalesChart({ data }: { data: ChartData[] }) {
  // Calcular totales de contado y crédito
  const totalCash = data.reduce((sum, d) => sum + (Number(d.cash) || 0), 0)
  const totalCredit = data.reduce((sum, d) => sum + (Number(d.credit) || 0), 0)
  const total = totalCash + totalCredit

  const pieData = [
    {
      name: "Contado",
      value: totalCash,
      formatted: formatRD(totalCash),
    },
    {
      name: "Crédito",
      value: totalCredit,
      formatted: formatRD(totalCredit),
    },
  ].filter((item) => item.value > 0) // Solo mostrar segmentos con valor > 0

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : "0"
      
      return (
        <div className="rounded-lg border bg-background p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: data.payload.fill }}
            />
            <div>
              <div className="font-medium">{data.name}</div>
              <div className="text-sm text-muted-foreground">
                {data.payload.formatted} ({percentage}%)
              </div>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  const renderLabel = (entry: any) => {
    if (total === 0) return ""
    const percentage = ((entry.value / total) * 100).toFixed(1)
    return `${entry.name}: ${percentage}%`
  }

  // Si no hay datos, mostrar mensaje
  if (pieData.length === 0 || total === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">No hay datos de ventas en los últimos 7 días</p>
          <p className="text-xs mt-1">El gráfico aparecerá cuando haya ventas registradas</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height: "300px", minHeight: "300px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderLabel}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            formatter={(value, entry: any) => (
              <span style={{ color: entry.color }}>
                {value}: {entry.payload?.formatted || formatRD(0)}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
