

import { cashHash, withCashOperation, type CashOperationInput } from "@/lib/cash-context"


import type { PaymentMethod } from "@prisma/client"


import { openai } from "@/lib/openai"
import { prisma } from "@/lib/db"

import { createPurchase } from "@/lib/purchases"
import { validatePurchaseMetadata, validatePurchaseItems, moneyCents, PurchaseError, lockPurchaseAccount, purchaseOperation, type CreditPurchaseInput, type PurchaseActor } from "@/lib/purchase-credit"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logError, ErrorCodes } from "@/lib/error-logger"
import { INITIAL_STOCK_REASON } from "@/lib/inventory"
import { resolvePurchaseSalePricing } from "@/lib/purchase-pricing"
import { ensurePermission } from "@/lib/permission-guard"

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
  matchedProductItbisRateBp: number
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

export async function processInvoiceImage(actor: PurchaseActor, base64Image: string): Promise<ExtractedInvoiceData> {
  const user = actor
  await ensurePermission(actor, "canManagePurchases", { resourceType: "Purchase" })
  if (!user) throw new Error("No autenticado")

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

    // Buscar productos existentes por SKU o referencia (filtrado por accountId)
    const productsWithMatches: ExtractedProduct[] = await Promise.all(
      (parsedData.products || []).map(async (p) => {
        let matchedProduct = null

        // Buscar por SKU
        if (p.sku) {
          matchedProduct = await prisma.product.findFirst({
            where: {
              accountId: user.accountId,
              isActive: true,
              sku: { equals: p.sku, mode: "insensitive" },
            },
            select: { id: true, name: true, itbisRateBp: true },
          })
        }

        // Si no encontró por SKU, buscar por referencia
        if (!matchedProduct && p.reference) {
          matchedProduct = await prisma.product.findFirst({
            where: {
              accountId: user.accountId,
              isActive: true,
              reference: { equals: p.reference, mode: "insensitive" },
            },
            select: { id: true, name: true, itbisRateBp: true },
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
          matchedProductItbisRateBp: matchedProduct?.itbisRateBp ?? 0,
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
    // Registrar error de OCR
    await logError(error instanceof Error ? error : new Error("Error al procesar la imagen con OCR"), {
      code: ErrorCodes.EXTERNAL_OCR_ERROR,
      severity: "MEDIUM",
      accountId: user.accountId,
      userId: user.id,
      endpoint: "/purchases/ocr-actions/processInvoiceImage",
      metadata: { hasImage: !!base64Image },
    })
    if (error instanceof Error) {
      throw error
    }
    throw new Error("Error al procesar la imagen con OCR")
  }
}

// Función para crear productos nuevos y la compra
export async function createPurchaseFromOCR(actor: PurchaseActor, input: Parameters<typeof createPurchaseFromOCRInternal>[1]) {
  const { cashOperation, ...payload } = input
  return withCashOperation(cashOperation, { kind: "createPurchaseFromOCR", ...payload }, () => createPurchaseFromOCRInternal(actor, input))
}

async function createPurchaseFromOCRInternal(actor: PurchaseActor, input: {
  paymentMethod?: PaymentMethod | null
  treasuryAccountId?: string | null
  supplierId?: string | null
  supplierName: string | null
  notes?: string | null
  products: Array<{
    productId: string | null // null si es nuevo
    sku: string | null
    reference: string | null
    description: string
    quantity: number
    unitCostCents: number
    discountPercentBp?: number
    netCostCents?: number
    saleMarginBp?: number
    // Para productos nuevos
    createNew: boolean
    sellPriceCents?: number // Precio de venta para productos nuevos
  }>
  updateProductCost?: boolean
  updateProductPrice?: boolean
  cashOperation?: CashOperationInput
} & CreditPurchaseInput) {
  const currentUser = actor
  if (!currentUser) throw new Error("No autenticado")
  await ensurePermission(currentUser, "canManagePurchases", {
    message: "No tienes permiso para gestionar compras",
    resourceType: "Purchase",
  })

  validatePurchaseMetadata(input)
  if (!Array.isArray(input.products) || !input.products.length) throw new PurchaseError("INVALID_ITEMS", "La compra no tiene productos")

  if (input.products.some(p => !p || typeof p !== "object" || !Number.isFinite(p.quantity) || p.quantity <= 0 || !Number.isSafeInteger(p.unitCostCents) || p.unitCostCents < 0 || (p.productId != null && typeof p.productId !== "string") || (!p.productId && (p.createNew !== true || typeof p.description !== "string" || !p.description.trim())))) throw new PurchaseError("INVALID_ITEMS", "Revisa los productos de la factura")
  // Validar precisión, límites y duplicados antes de crear productos o consumir su secuencia.
  validatePurchaseItems(input.products.map((p, index) => ({ productId: p.productId || `new:${index}`, qty: p.quantity, unitCostCents: p.unitCostCents, discountPercentBp: p.discountPercentBp, saleMarginBp: p.saleMarginBp, salePriceCents: p.sellPriceCents })))
  return prisma.$transaction(async (tx) => {
    await lockPurchaseAccount(tx, currentUser.accountId)
    const run = async () => {

    // Obtener el proveedor si se proporcionó supplierId (filtrado por accountId)
    let supplier = null
    if (input.supplierId) {
      supplier = await tx.supplier.findFirst({ 
        where: { accountId: currentUser.accountId, id: input.supplierId } 
      })
    }

    const settings = await tx.companySettings.findFirst({
      where: { accountId: currentUser.accountId },
      select: { itbisRateBp: true, defaultProfitMarginBp: true, salePricesIncludeItbis: true },
    })

    const purchaseItbisRateBp = settings?.itbisRateBp ?? 1800
    const defaultProfitMarginBp = settings?.defaultProfitMarginBp ?? 3000
    const salePricesIncludeItbis = settings?.salePricesIncludeItbis ?? true
    const purchaseIncludesItbis = supplier ? (supplier.chargesItbis ?? false) : false
    const supplierPurchaseItbisRateBp = supplier?.chargesItbis
      ? (supplier.itbisRateBp ?? purchaseItbisRateBp)
      : purchaseItbisRateBp

    // Crear productos nuevos primero
    const existingProductIds = input.products
      .map((p) => p.productId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)

    const existingProducts = await tx.product.findMany({
      where: {
        accountId: currentUser.accountId,
        id: { in: existingProductIds },
      },
      select: { id: true, itbisRateBp: true },
    })
    const existingProductById = new Map(existingProducts.map((p) => [p.id, p]))

    const items: {
      productId: string
      qty: number
      unitCostCents: number
      discountPercentBp: number
      netCostCents: number
      salePriceCents: number
      saleMarginBp: number
      purchaseIncludesItbis: boolean
      appliedItbisRateBp: number
    }[] = []

    for (const p of input.products) {
      let productId = p.productId
      const discountBp = p.discountPercentBp ?? (supplier as typeof supplier & { discountPercentBp?: number })?.discountPercentBp ?? 0
      // El precio inicial debe usar la misma tasa de venta que se guardará en el producto nuevo.
      let productItbisRateBp = supplier ? (supplier.chargesItbis ? supplierPurchaseItbisRateBp : 0) : purchaseItbisRateBp

      // Verificar que el producto existente pertenece al account
      if (productId) {
        const existingProduct = existingProductById.get(productId)
        if (!existingProduct) {
          // Nunca convertir un ID ajeno en un producto nuevo ni omitir una línea silenciosamente.
          throw new PurchaseError("INVALID_ITEMS", "Producto no encontrado en este negocio")
        } else {
          productItbisRateBp = existingProduct.itbisRateBp
        }
      }

      const pricing = resolvePurchaseSalePricing({
        unitCostCents: p.unitCostCents,
        discountPercentBp: discountBp,
        purchaseIncludesItbis,
        purchaseItbisRateBp: supplierPurchaseItbisRateBp,
        productItbisRateBp,
        defaultSaleMarginBp: defaultProfitMarginBp,
        saleMarginBp: p.saleMarginBp,
        salePriceCents: p.sellPriceCents,
        salePricesIncludeItbis,
      })
      moneyCents(pricing.netCostCents, true)
      moneyCents(pricing.salePriceCents, true)

      // Si es producto nuevo y se debe crear
      if (!productId && p.createNew) {
        const newProductItbisRateBp = supplier
          ? (supplier.chargesItbis ? supplierPurchaseItbisRateBp : 0)
          : purchaseItbisRateBp
        // Obtener el siguiente productId de la secuencia
        const seq = await tx.productSequence.upsert({
          where: { accountId: currentUser.accountId },
          update: { lastNumber: { increment: 1 } },
          create: { accountId: currentUser.accountId, lastNumber: 1 },
        })

        const newProduct = await tx.product.create({
          data: {
            accountId: currentUser.accountId,
            productId: seq.lastNumber,
            name: p.description,
            sku: p.sku || null,
            reference: p.reference || null,
            priceCents: pricing.salePriceCents,
            costCents: pricing.netCostCents,
            itbisRateBp: newProductItbisRateBp,
            stock: 0, // Se actualizará con la compra
          },
          select: { id: true, createdAt: true },
        })
        try {
          await tx.inventoryAdjustment.create({
            data: {
              accountId: currentUser.accountId,
              productId: newProduct.id,
              userId: currentUser.id,
              qtyDelta: 0,
              reason: INITIAL_STOCK_REASON,
              note: null,
              batchId: null,
              createdAt: newProduct.createdAt,
            },
          })
        } catch (error) {
          const code = (error as { code?: string })?.code
          if (code !== "P2021") {
            console.error("Error creating inventory adjustment:", error)
          }
        }
        productId = newProduct.id
      }

      if (!productId) throw new PurchaseError("INVALID_ITEMS", "Selecciona un producto o indica que se debe crear")
      if (productId) {
        items.push({
          productId,
          qty: p.quantity,
          unitCostCents: p.unitCostCents,
          discountPercentBp: discountBp,
          netCostCents: pricing.netCostCents,
          salePriceCents: pricing.salePriceCents,
          saleMarginBp: pricing.saleMarginBp,
          purchaseIncludesItbis: pricing.purchaseIncludesItbis,
          appliedItbisRateBp: pricing.appliedItbisRateBp,
        })
      }
    }

    if (!items.length) throw new PurchaseError("INVALID_ITEMS", "No hay productos válidos para la compra")

    // Reutilizar el mismo servicio evita reglas distintas para OCR y compras manuales.
    return createPurchase(actor, { ...input, cashOperation: undefined, operationId: input.operationId ? "ocr-" + cashHash(input.operationId) : undefined, items: items.map(i => ({ ...i, salePriceCents: i.salePriceCents })) })
    }
    return input.type === "CREDITO" ? purchaseOperation(tx, actor, "creditPurchaseOCR", input.operationId, input, run) : run()
  }, TRANSACTION_OPTIONS)
}

// Función para buscar producto por SKU o referencia (para matching manual)
export async function findProductByCode(actor: PurchaseActor, code: string) {
  const user = actor
  if (!user) throw new Error("No autenticado")

  if (!code.trim()) return null

  return prisma.product.findFirst({
    where: {
      accountId: user.accountId,
      isActive: true,
      OR: [
        { sku: { equals: code, mode: "insensitive" } },
        { reference: { equals: code, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, sku: true, reference: true, costCents: true },
  })
}







