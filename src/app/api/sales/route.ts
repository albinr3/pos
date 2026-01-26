import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { createSale } from "@/app/(app)/sales/actions"
import { SaleType, PaymentMethod } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/sales - Crear venta
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()

    // Convertir items del formato móvil al formato esperado
    const items = (body.items || []).map((item: any) => ({
      productId: item.productId,
      qty: item.quantity || item.qty,
      unitPriceCents: item.unitPriceCents || Math.round((item.price || 0) * 100),
      wasPriceOverridden: item.wasPriceOverridden || false,
    }))

    // Convertir shipping de pesos a centavos si viene como número decimal
    const shippingCents = body.shippingCents ?? (body.shipping ? Math.round(body.shipping * 100) : 0)

    // Determinar tipo de venta
    const saleType = body.type === "CREDITO" || body.paymentMethod === "CREDITO" 
      ? SaleType.CREDITO 
      : SaleType.CONTADO

    // Convertir paymentMethod al enum
    let paymentMethod: PaymentMethod | null = null
    if (body.paymentMethod && body.paymentMethod !== "CREDITO") {
      const methodMap: Record<string, PaymentMethod> = {
        EFECTIVO: PaymentMethod.EFECTIVO,
        TARJETA: PaymentMethod.TARJETA,
        TRANSFERENCIA: PaymentMethod.TRANSFERENCIA,
        OTRO: PaymentMethod.OTRO,
      }
      paymentMethod = methodMap[body.paymentMethod] || null
    }

    const sale = await createSale({
      customerId: body.customerId || null,
      type: saleType,
      paymentMethod: saleType === SaleType.CONTADO ? paymentMethod : null,
      items,
      shippingCents,
      username: user.username,
      user,
    })

    return NextResponse.json({
      id: sale.id,
      invoiceCode: sale.invoiceCode,
      type: sale.type,
    }, { status: 201 })
  } catch (error: any) {
    console.error("Error en POST /api/sales:", error)
    return NextResponse.json(
      { error: error.message || "Error al crear venta" },
      { status: 500 }
    )
  }
}
