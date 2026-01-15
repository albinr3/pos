"use server"

import { openai } from "@/lib/openai"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

// Tipos para los datos extraídos del OCR
export type ExtractedProduct = {
  sku: string | null
  reference: string | null
  description: string
  quantity: number
  unitPrice: number // en centavos
  // Datos de coincidencia con productos existentes
  matchedProductId: string | null
  matchedProductName: string | null
  isNewProduct: boolean
  included: boolean // Para la revisión manual
}

export type ExtractedInvoiceData = {
  supplierName: string | null
  invoiceDate: string | null
  products: ExtractedProduct[]
  rawText?: string // Texto crudo para debug
}

// Prompt para extraer datos de la factura
const EXTRACTION_PROMPT = `Analiza esta imagen de una factura de compra/proveedor y extrae los datos en formato JSON.

Extrae:
1. Nombre del proveedor (supplierName)
2. Fecha de la factura (invoiceDate) en formato YYYY-MM-DD
3. Lista de productos con:
   - sku: código del producto del proveedor (puede ser "código", "cód", "art", "artículo", etc.)
   - reference: referencia adicional si existe
   - description: descripción/nombre del producto
   - quantity: cantidad comprada (número entero)
   - unitPrice: precio unitario en pesos dominicanos (número con decimales)

Responde SOLO con JSON válido en este formato exacto:
{
  "supplierName": "Nombre del Proveedor",
  "invoiceDate": "2026-01-13",
  "products": [
    {
      "sku": "ABC123",
      "reference": "REF-001",
      "description": "Nombre del producto",
      "quantity": 10,
      "unitPrice": 150.50
    }
  ]
}

Si no puedes leer algún dato, usa null. Si no hay productos, usa un array vacío.
Los precios deben ser números (no strings). Las cantidades deben ser enteros.`

export async function processInvoiceImage(base64Image: string): Promise<ExtractedInvoiceData> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY no está configurada. Agrega tu API key en el archivo .env")
  }

  try {
    // Llamar a OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: base64Image.startsWith("data:") ? base64Image : `data:image/jpeg;base64,${base64Image}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_completion_tokens: 4096,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("No se recibió respuesta de OpenAI")
    }

    // Extraer JSON de la respuesta (puede venir con markdown)
    let jsonStr = content
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }

    // Parsear JSON
    let parsedData: {
      supplierName: string | null
      invoiceDate: string | null
      products: Array<{
        sku: string | null
        reference: string | null
        description: string
        quantity: number
        unitPrice: number
      }>
    }

    try {
      parsedData = JSON.parse(jsonStr.trim())
    } catch {
      throw new Error("Error al procesar la respuesta. La imagen puede no ser una factura válida.")
    }

    // Buscar productos existentes por SKU o referencia
    const productsWithMatches: ExtractedProduct[] = await Promise.all(
      (parsedData.products || []).map(async (p) => {
        let matchedProduct = null

        // Buscar por SKU
        if (p.sku) {
          matchedProduct = await prisma.product.findFirst({
            where: {
              isActive: true,
              sku: { equals: p.sku, mode: "insensitive" },
            },
            select: { id: true, name: true },
          })
        }

        // Si no encontró por SKU, buscar por referencia
        if (!matchedProduct && p.reference) {
          matchedProduct = await prisma.product.findFirst({
            where: {
              isActive: true,
              reference: { equals: p.reference, mode: "insensitive" },
            },
            select: { id: true, name: true },
          })
        }

        // Convertir precio a centavos
        const unitPriceCents = Math.round((p.unitPrice || 0) * 100)

        return {
          sku: p.sku || null,
          reference: p.reference || null,
          description: p.description || "Producto sin descripción",
          quantity: Math.max(1, Math.round(p.quantity || 1)),
          unitPrice: unitPriceCents,
          matchedProductId: matchedProduct?.id || null,
          matchedProductName: matchedProduct?.name || null,
          isNewProduct: !matchedProduct,
          included: true, // Por defecto incluido
        }
      })
    )

    return {
      supplierName: parsedData.supplierName || null,
      invoiceDate: parsedData.invoiceDate || null,
      products: productsWithMatches,
      rawText: content,
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error("Error al procesar la imagen con OCR")
  }
}

// Función para crear productos nuevos y la compra
export async function createPurchaseFromOCR(input: {
  supplierId?: string | null
  supplierName: string | null
  products: Array<{
    productId: string | null // null si es nuevo
    sku: string | null
    reference: string | null
    description: string
    quantity: number
    unitCostCents: number
    discountPercentBp?: number
    netCostCents?: number
    // Para productos nuevos
    createNew: boolean
    sellPriceCents?: number // Precio de venta para productos nuevos
  }>
  username: string
  updateProductCost?: boolean
}) {
  if (!input.products.length) throw new Error("La compra no tiene productos")

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { username: input.username } })
    if (!user) throw new Error("Usuario inválido")

    // Obtener el proveedor si se proporcionó supplierId
    let supplier = null
    if (input.supplierId) {
      supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } })
    }

    // Calcular costo neto: (costo - descuento) * 1.18 (ITBIS)
    function calculateNetCost(unitCostCents: number, discountPercentBp: number): number {
      const discountRate = discountPercentBp / 10000
      const costAfterDiscount = unitCostCents * (1 - discountRate)
      const itbisRate = 0.18
      const netCost = costAfterDiscount * (1 + itbisRate)
      return Math.round(netCost)
    }

    // Crear productos nuevos primero
    const productIds: string[] = []
    const items: { productId: string; qty: number; unitCostCents: number; discountPercentBp: number; netCostCents: number }[] = []

    for (const p of input.products) {
      let productId = p.productId
      const discountBp = p.discountPercentBp ?? (supplier as typeof supplier & { discountPercentBp?: number })?.discountPercentBp ?? 0
      const netCostCents = p.netCostCents ?? calculateNetCost(p.unitCostCents, discountBp)

      // Si es producto nuevo y se debe crear
      if (!productId && p.createNew) {
        const newProduct = await tx.product.create({
          data: {
            name: p.description,
            sku: p.sku || null,
            reference: p.reference || null,
            priceCents: p.sellPriceCents || Math.round(netCostCents * 1.3), // Margen del 30% por defecto
            costCents: netCostCents, // Usar costo neto
            stock: 0, // Se actualizará con la compra
          },
          select: { id: true },
        })
        productId = newProduct.id
      }

      if (productId) {
        productIds.push(productId)
        items.push({
          productId,
          qty: p.quantity,
          unitCostCents: p.unitCostCents,
          discountPercentBp: discountBp,
          netCostCents: netCostCents,
        })
      }
    }

    if (!items.length) throw new Error("No hay productos válidos para la compra")

    // Calcular total usando costo neto
    const totalCents = items.reduce((s, i) => s + i.qty * i.netCostCents, 0)

    // Crear la compra
    const purchase = await tx.purchase.create({
      data: {
        supplierName: input.supplierName?.trim() || supplier?.name || null,
        userId: user.id,
        totalCents,
        items: {
          create: items.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            unitCostCents: i.unitCostCents,
            discountPercentBp: i.discountPercentBp,
            netCostCents: i.netCostCents,
            lineTotalCents: i.qty * i.netCostCents,
          })),
        },
      },
      select: { id: true },
    })

    // Actualizar stock y costo de productos (usar costo neto)
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.qty },
          ...(input.updateProductCost ? { costCents: item.netCostCents } : {}),
        },
      })
    }

    revalidatePath("/purchases")
    revalidatePath("/purchases/list")
    revalidatePath("/products")
    revalidatePath("/dashboard")

    return purchase
  })
}

// Función para buscar producto por SKU o referencia (para matching manual)
export async function findProductByCode(code: string) {
  if (!code.trim()) return null

  return prisma.product.findFirst({
    where: {
      isActive: true,
      OR: [
        { sku: { equals: code, mode: "insensitive" } },
        { reference: { equals: code, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, sku: true, reference: true, costCents: true },
  })
}










