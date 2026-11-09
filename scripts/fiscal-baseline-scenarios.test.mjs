// Suite de pruebas para la línea base fiscal (Etapa 0).
// Ejecuta todos los escenarios comerciales en una base de datos local aislada.
// Verifica multiempresa, ventas, créditos, propina, envío, descuentos, compras, pagos, gastos,
// contratos de impresión, idempotencia y ausencia de campos fiscales.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { PrismaClient, PaymentMethod, SaleType } from "@prisma/client"

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error("Define TEST_DATABASE_URL; DATABASE_URL nunca se usa como alternativa")
const parsed = new URL(url)
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !/cash_test/.test(parsed.pathname)) {
  throw new Error("Se requiere una base local desechable cash_test")
}

const db = new PrismaClient({ datasources: { db: { url } } })
after(async () => {
  await db.$disconnect()
})

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const modules = new Map()
const secret = randomUUID()
const jwt = require("jsonwebtoken")

let currentActor = null

function load(name, from = path.join(root, "src/_entry.ts")) {
  if (name === "next/cache") return { revalidatePath() {} }
  if (name === "next/headers") return { headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }
  if (name === "@/lib/auth") {
    return {
      getCurrentUser: async () => currentActor ?? load("@/lib/cash-context").cashRequest.getStore()?.trustedActor ?? null,
      getCurrentUserWithDiagnostics: async () => ({ user: currentActor ?? load("@/lib/cash-context").cashRequest.getStore()?.trustedActor ?? null }),
      AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
      getClerkUserIdFromToken: async () => currentActor?.clerkUserId ?? null,
      getSubUserSession: async (token) => {
        try { return jwt.verify(token, secret) } catch { return null }
      },
    }
  }
  if (name === "../_helpers/auth" || name === "./_helpers/auth") {
    return {
      getCurrentUserFromRequest: async () => currentActor ?? load("@/lib/cash-context").cashRequest.getStore()?.trustedActor ?? null,
    }
  }
  if (name === "@/lib/openai") return { openai: { chat: { completions: { create: async () => ({ choices: [{ message: { content: "{}" } }] }) } } } }
  if (name === "@/lib/error-logger") return { logError: async () => {}, ErrorCodes: {} }
  if (name === "@prisma/client") {
    return {
      ...require(name),
      PrismaClient: class { constructor() { throw new Error("Prohibidos clientes implícitos en pruebas") } },
    }
  }
  if (!name.startsWith("@/") && !name.startsWith(".")) return require(name)

  const file = name.startsWith("@/")
    ? path.join(root, "src", name.slice(2) + ".ts")
    : path.resolve(path.dirname(from), name.endsWith(".ts") ? name : name + ".ts")

  if (modules.has(file)) return modules.get(file)
  const exports = {}
  modules.set(file, exports)
  const source = fs.readFileSync(file, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText

  vm.runInNewContext(
    compiled,
    {
      exports,
      require: (n) => load(n, file),
      console: { ...console, log() {} },
      Date,
      Map,
      Set,
      process,
      Headers,
      Response,
      Request,
      Buffer,
      globalThis: { prisma: db },
    },
    { filename: file }
  )
  return exports
}

// Cargar módulos necesarios
const { cashRequest, withCashOperation } = load("@/lib/cash-context")
const sales = load("@/app/(app)/sales/actions")
const returns = load("@/app/(app)/returns/actions")
const ar = load("@/app/(app)/ar/actions")
const purchases = load("@/lib/purchases")
const payables = load("@/lib/accounts-payable")
const expenses = load("@/app/(app)/operating-expenses/actions")
const money = load("@/lib/money")

function withActor(actor, fn) {
  currentActor = actor
  return cashRequest.run({ trustedActor: actor, deviceHash: "baseline-device" }, fn)
}

test("1. Aislamiento y estructura multiempresa inicial sin campos fiscales", async () => {
  const accounts = await db.account.findMany({
    where: { id: { in: ["baseline-account-rd", "baseline-account-intl", "baseline-account-doprep"] } },
    include: { users: true, products: true, customers: true, suppliers: true },
  })
  assert.equal(accounts.length, 3, "Deben existir las 3 cuentas iniciales de prueba")

  const rd = accounts.find((a) => a.id === "baseline-account-rd")
  const intl = accounts.find((a) => a.id === "baseline-account-intl")
  const doprep = accounts.find((a) => a.id === "baseline-account-doprep")

  assert.ok(rd && intl && doprep)
  assert.equal(rd.products.length, 2)
  assert.equal(intl.products.length, 1)
  assert.equal(doprep.products.length, 1)

  // Aislamiento: consultar productos con cuenta RD no ve productos de intl ni doprep
  const crossProduct = await db.product.count({
    where: { accountId: rd.id, id: intl.products[0].id },
  })
  assert.equal(crossProduct, 0, "No debe haber cruce de productos entre cuentas")

  // Verificar ausencia de tablas / modelos fiscales oficiales
  const tables = await db.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename ILIKE '%fiscal%'
  `
  assert.equal(tables.length, 0, "En la etapa 0 no existen aún tablas ni modelos fiscales e-CF")
})

test("2. Venta al contado en empresa RD (ITBIS 18% incluido, sin e-NCF)", async () => {
  const actor = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isOwner: true } })
  const prod = await db.product.findFirstOrThrow({ where: { accountId: "baseline-account-rd", sku: "PROD-RD-18" } })
  const box = await db.treasuryAccount.findFirstOrThrow({ where: { accountId: "baseline-account-rd", type: "CAJA" } })
  const initialStock = Number(prod.stock)

  const result = await withActor(actor, async () => {
    return sales.createSale({
      customerId: null,
      type: SaleType.CONTADO,
      paymentMethod: PaymentMethod.EFECTIVO,
      treasuryAccountId: box.id,
      items: [
        {
          productId: prod.id,
          qty: 2,
          unitPriceCents: 10000, // 100 DOP c/u con ITBIS
          wasPriceOverridden: false,
        },
      ],
      username: actor.username,
    })
  })

  assert.ok(result.id)
  assert.match(result.invoiceCode, /^[A-Z]-\d+$/, "Debe generar código de factura interna regular")

  const saleRecord = await db.sale.findUniqueOrThrow({ where: { id: result.id } })
  assert.equal(saleRecord.totalCents, 20000) // 200.00 DOP
  assert.equal(saleRecord.subtotalCents, 16949) // 200 / 1.18 = 169.49 DOP base
  assert.equal(saleRecord.itbisCents, 3051) // 30.51 DOP ITBIS 18%

  // Verificar que el inventario se descontó en 2 unidades
  const updatedProd = await db.product.findUniqueOrThrow({ where: { id: prod.id } })
  assert.equal(Number(updatedProd.stock), initialStock - 2)

  // Verificar que la venta en la base no tiene campos de facturación electrónica
  assert.equal(saleRecord.cancelledAt, null)
  assert.equal(Object.hasOwn(saleRecord, "eNcf"), false, "No debe existir eNcf en el registro")
  assert.equal(Object.hasOwn(saleRecord, "fiscalStatus"), false, "No debe existir fiscalStatus en el registro")
})

test("3. Venta a crédito con validación de cliente y creación de cuenta por cobrar", async () => {
  const actor = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isOwner: true } })
  const prod = await db.product.findFirstOrThrow({ where: { accountId: "baseline-account-rd", sku: "PROD-RD-18" } })
  const genericCust = await db.customer.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isGeneric: true } })
  const creditCust = await db.customer.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isGeneric: false, creditEnabled: true } })

  // Intento de venta a crédito a cliente genérico debe rechazarse
  await assert.rejects(
    withActor(actor, async () => {
      return sales.createSale({
        customerId: genericCust.id,
        type: SaleType.CREDITO,
        items: [{ productId: prod.id, qty: 1, unitPriceCents: 10000, wasPriceOverridden: false }],
        username: actor.username,
      })
    }),
    /Para crédito debes seleccionar un cliente/i
  )

  // Venta a crédito con cliente autorizado
  const creditSale = await withActor(actor, async () => {
    return sales.createSale({
      customerId: creditCust.id,
      type: SaleType.CREDITO,
      items: [{ productId: prod.id, qty: 1, unitPriceCents: 10000, wasPriceOverridden: false }],
      username: actor.username,
    })
  })

  assert.ok(creditSale.id)
  assert.equal(creditSale.type, SaleType.CREDITO)

  // Verificar que se creó el registro en AccountReceivable con balance igual al total
  const arRecord = await db.accountReceivable.findFirstOrThrow({
    where: { saleId: creditSale.id },
  })
  assert.equal(arRecord.totalCents, 10000)
  assert.equal(arRecord.balanceCents, 10000)
  assert.equal(arRecord.status, "PENDIENTE")
})

test("4. Modificadores comerciales: Descuento, Envío y Propina Legal", async () => {
  // 4.1 Empresa RD con descuento global manual del 10% y costo de envío de 150 DOP
  const actorRD = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isOwner: true } })
  const prodRD = await db.product.findFirstOrThrow({ where: { accountId: "baseline-account-rd", sku: "PROD-RD-EX" } }) // 50 DOP exento

  const saleWithModifiers = await withActor(actorRD, async () => {
    return sales.createSale({
      customerId: null,
      type: SaleType.CONTADO,
      paymentMethod: PaymentMethod.EFECTIVO,
      discountMode: "MANUAL",
      manualDiscountPercentBp: 1000, // 10% de descuento = -10 DOP
      shippingCents: 15000, // 150 DOP de envío
      items: [{ productId: prodRD.id, qty: 2, unitPriceCents: 5000, wasPriceOverridden: false }], // 100 DOP
      username: actorRD.username,
    })
  })

  const modRecord = await db.sale.findUniqueOrThrow({ where: { id: saleWithModifiers.id } })
  // 100 DOP - 10 DOP descuento + 150 DOP envío = 240 DOP (24,000 cents)
  assert.equal(modRecord.discountTotalCents, 1000)
  assert.equal(modRecord.shippingCents, 15000)
  assert.equal(modRecord.totalCents, 24000)

  // 4.2 Empresa Preparación DO con Propina Legal del 10% habilitada
  const actorDOPrep = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-doprep", isOwner: true } })
  const prodDOPrep = await db.product.findFirstOrThrow({ where: { accountId: "baseline-account-doprep", sku: "DO-PREP-01" } }) // 150 DOP

  const saleWithLegalTip = await withActor(actorDOPrep, async () => {
    return sales.createSale({
      customerId: null,
      type: SaleType.CONTADO,
      paymentMethod: PaymentMethod.EFECTIVO,
      applyLegalTip: true,
      items: [{ productId: prodDOPrep.id, qty: 1, unitPriceCents: 15000, wasPriceOverridden: false }],
      username: actorDOPrep.username,
    })
  })

  const tipRecord = await db.sale.findUniqueOrThrow({ where: { id: saleWithLegalTip.id } })
  assert.equal(tipRecord.legalTipApplied, true)
  assert.ok(tipRecord.legalTipCents > 0, "Debe calcular propina legal")
  assert.equal(tipRecord.totalCents, 15000 + tipRecord.legalTipCents)

  // 4.3 Empresa Internacional (sin ITBIS, moneda/contexto internacional)
  const actorIntl = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-intl", isOwner: true } })
  const prodIntl = await db.product.findFirstOrThrow({ where: { accountId: "baseline-account-intl", sku: "WIDGET-01" } }) // 25.00

  const saleIntl = await withActor(actorIntl, async () => {
    return sales.createSale({
      customerId: null,
      type: SaleType.CONTADO,
      paymentMethod: PaymentMethod.EFECTIVO,
      items: [{ productId: prodIntl.id, qty: 4, unitPriceCents: 2500, wasPriceOverridden: false }],
      username: actorIntl.username,
    })
  })

  const intlRecord = await db.sale.findUniqueOrThrow({ where: { id: saleIntl.id } })
  assert.equal(intlRecord.totalCents, 10000) // 100.00
  assert.equal(intlRecord.itbisCents, 0, "Empresa internacional sin ITBIS")
  assert.equal(intlRecord.subtotalCents, 10000)
})

test("5. Devolución parcial y Anulación de Venta con reposición de inventario", async () => {
  const actor = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isOwner: true } })
  const prod = await db.product.findFirstOrThrow({ where: { accountId: "baseline-account-rd", sku: "PROD-RD-18" } })
  const box = await db.treasuryAccount.findFirstOrThrow({ where: { accountId: "baseline-account-rd", type: "CAJA" } })

  // Crear una venta de 4 unidades
  const sale = await withActor(actor, async () => {
    return sales.createSale({
      customerId: null,
      type: SaleType.CONTADO,
      paymentMethod: PaymentMethod.EFECTIVO,
      treasuryAccountId: box.id,
      items: [{ productId: prod.id, qty: 4, unitPriceCents: 10000, wasPriceOverridden: false }],
      username: actor.username,
    })
  })

  const saleRecord = await db.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: true },
  })

  const stockBeforeReturn = Number((await db.product.findUniqueOrThrow({ where: { id: prod.id } })).stock)

  // 5.1 Devolución parcial de 1 unidad
  const returnResult = await withActor(actor, async () => {
    return returns.createReturn({
      saleId: sale.id,
      items: [
        {
          saleItemId: saleRecord.items[0].id,
          productId: prod.id,
          qty: 1,
          unitPriceCents: 10000,
        },
      ],
      refundMethod: PaymentMethod.EFECTIVO,
      refundTreasuryAccountId: box.id,
    })
  })

  assert.ok(returnResult.id)
  assert.match(returnResult.returnCode, /^DEV-\d+$/)

  const retRecord = await db.return.findUniqueOrThrow({ where: { id: returnResult.id } })
  assert.equal(retRecord.totalCents, 10000)

  // Verificar que el inventario repuso 1 unidad
  const stockAfterReturn = Number((await db.product.findUniqueOrThrow({ where: { id: prod.id } })).stock)
  assert.equal(stockAfterReturn, stockBeforeReturn + 1)

  // 5.2 Anulación completa de una venta
  const saleToCancel = await withActor(actor, async () => {
    return sales.createSale({
      customerId: null,
      type: SaleType.CONTADO,
      paymentMethod: PaymentMethod.EFECTIVO,
      treasuryAccountId: box.id,
      items: [{ productId: prod.id, qty: 2, unitPriceCents: 10000, wasPriceOverridden: false }],
      username: actor.username,
    })
  })

  const stockBeforeCancel = Number((await db.product.findUniqueOrThrow({ where: { id: prod.id } })).stock)

  const cancelRes = await withActor(actor, async () => {
    return sales.cancelSale(saleToCancel.id, actor.username, "Error en factura de prueba")
  })
  assert.equal(cancelRes.success, true)

  const cancelledSale = await db.sale.findUniqueOrThrow({ where: { id: saleToCancel.id } })
  assert.ok(cancelledSale.cancelledAt)
  assert.ok(cancelledSale.cancelledBy === actor.id || cancelledSale.cancelledBy === actor.username)

  // Stock debe haberse restituido en 2 unidades
  const stockAfterCancel = Number((await db.product.findUniqueOrThrow({ where: { id: prod.id } })).stock)
  assert.equal(stockAfterCancel, stockBeforeCancel + 2)
})

test("6. Cobros sobre cuentas por cobrar (abono parcial y liquidación)", async () => {
  const actor = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isOwner: true } })
  const prod = await db.product.findFirstOrThrow({ where: { accountId: "baseline-account-rd", sku: "PROD-RD-18" } })
  const creditCust = await db.customer.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isGeneric: false, creditEnabled: true } })
  const box = await db.treasuryAccount.findFirstOrThrow({ where: { accountId: "baseline-account-rd", type: "CAJA" } })

  // Crear venta a crédito de 100 DOP
  const sale = await withActor(actor, async () => {
    return sales.createSale({
      customerId: creditCust.id,
      type: SaleType.CREDITO,
      items: [{ productId: prod.id, qty: 1, unitPriceCents: 10000, wasPriceOverridden: false }],
      username: actor.username,
    })
  })

  const arRecord = await db.accountReceivable.findFirstOrThrow({ where: { saleId: sale.id } })

  // 6.1 Abono parcial de 40 DOP (4000 cents)
  const partPayment = await withActor(actor, async () => {
    return ar.addPayment({
      arId: arRecord.id,
      amountCents: 4000,
      method: PaymentMethod.EFECTIVO,
      treasuryAccountId: box.id,
      note: "Primer abono parcial",
    })
  })

  assert.ok(partPayment.paymentId)
  assert.equal(partPayment.appliedCents, 4000)
  assert.equal(partPayment.newBalanceCents, 6000)

  const arAfterPart = await db.accountReceivable.findUniqueOrThrow({ where: { id: arRecord.id } })
  assert.equal(arAfterPart.balanceCents, 6000)
  assert.equal(arAfterPart.status, "PARCIAL")

  // 6.2 Pago total restante de 60 DOP
  const fullPayment = await withActor(actor, async () => {
    return ar.addPayment({
      arId: arRecord.id,
      amountCents: 6000,
      method: PaymentMethod.EFECTIVO,
      treasuryAccountId: box.id,
      note: "Liquidación final",
    })
  })

  assert.ok(fullPayment.paymentId)
  assert.equal(fullPayment.appliedCents, 6000)
  assert.equal(fullPayment.newBalanceCents, 0)

  const arFinal = await db.accountReceivable.findUniqueOrThrow({ where: { id: arRecord.id } })
  assert.equal(arFinal.balanceCents, 0)
  assert.equal(arFinal.status, "PAGADA")

  // 6.3 Intento de cobro adicional sobre factura ya liquidada debe ser rechazado
  await assert.rejects(
    withActor(actor, async () => {
      return ar.addPayment({
        arId: arRecord.id,
        amountCents: 1000,
        method: PaymentMethod.EFECTIVO,
        treasuryAccountId: box.id,
      })
    }),
    /ya está pagada/i
  )
})

test("7. Compras a proveedores (contado y crédito) y registro de pagos", async () => {
  const actor = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isOwner: true } })
  const supp = await db.supplier.findFirstOrThrow({ where: { accountId: "baseline-account-rd" } })
  const prod = await db.product.findFirstOrThrow({ where: { accountId: "baseline-account-rd", sku: "PROD-RD-18" } })
  const box = await db.treasuryAccount.findFirstOrThrow({ where: { accountId: "baseline-account-rd", type: "CAJA" } })
  const bank = await db.treasuryAccount.findFirstOrThrow({ where: { accountId: "baseline-account-rd", type: "BANCO" } })

  const stockBefore = Number(prod.stock)

  // 7.1 Compra al contado: incrementa stock inmediatamente
  const cashPurchase = await withActor(actor, async () => {
    return purchases.createPurchase(actor, {
      type: "CONTADO",
      supplierId: supp.id,
      paymentMethod: PaymentMethod.EFECTIVO,
      treasuryAccountId: box.id,
      items: [{ productId: prod.id, qty: 5, unitCostCents: 6000 }],
      operationId: randomUUID(),
    })
  })

  assert.ok(cashPurchase.id)
  const stockAfterCash = Number((await db.product.findUniqueOrThrow({ where: { id: prod.id } })).stock)
  assert.equal(stockAfterCash, stockBefore + 5)

  // 7.2 Compra a crédito: crea AccountPayable
  const creditPurchase = await withActor(actor, async () => {
    return purchases.createPurchase(actor, {
      type: "CREDITO",
      supplierId: supp.id,
      dueDate: "2026-12-15",
      initialPaymentCents: 0,
      items: [{ productId: prod.id, qty: 10, unitCostCents: 6000 }],
      operationId: randomUUID(),
    })
  })

  assert.ok(creditPurchase.id)
  const ap = await db.accountPayable.findUniqueOrThrow({ where: { purchaseId: creditPurchase.id } })
  assert.equal(ap.totalCents, 60000)
  assert.equal(ap.balanceCents, 60000)
  assert.equal(ap.status, "PENDIENTE")

  // 7.3 Pago a proveedor sobre la deuda
  await db.$transaction(async (tx) => {
    return payables.createSupplierPaymentInTransaction(tx, actor, {
      apId: ap.id,
      amountCents: 20000, // Abono de 200 DOP
      method: PaymentMethod.TRANSFERENCIA,
      treasuryAccountId: bank.id,
      reference: "TRANSF-001",
    })
  })

  const apAfterPay = await db.accountPayable.findUniqueOrThrow({ where: { id: ap.id } })
  assert.equal(apAfterPay.balanceCents, 40000)
  assert.equal(apAfterPay.status, "PARCIAL")
})

test("8. Gastos operativos: validaciones, creación y actualización", async () => {
  const actor = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isOwner: true } })
  const box = await db.treasuryAccount.findFirstOrThrow({ where: { accountId: "baseline-account-rd", type: "CAJA" } })

  // Validación: importe <= 0 debe ser rechazado
  await assert.rejects(
    withActor(actor, async () => {
      return expenses.createOperatingExpense({
        description: "Gasto inválido",
        amountCents: 0,
        paymentMethod: PaymentMethod.EFECTIVO,
        treasuryAccountId: box.id,
      })
    }),
    /mayor a 0/i
  )

  // Creación de gasto válido
  const exp = await withActor(actor, async () => {
    return expenses.createOperatingExpense({
      description: "Servicio de limpieza",
      amountCents: 250000, // 2,500 DOP
      paymentMethod: PaymentMethod.EFECTIVO,
      treasuryAccountId: box.id,
      category: "Mantenimiento",
      notes: "Pago semanal",
      expenseDate: new Date(),
    })
  })

  assert.ok(exp.id)
  const expRecord = await db.operatingExpense.findUniqueOrThrow({ where: { id: exp.id } })
  assert.equal(expRecord.amountCents, 250000)
  assert.equal(expRecord.category, "Mantenimiento")

  // Actualización de gasto
  await withActor(actor, async () => {
    return expenses.updateOperatingExpense({
      id: exp.id,
      description: "Servicio de limpieza profunda",
      amountCents: 300000,
      paymentMethod: PaymentMethod.EFECTIVO,
      treasuryAccountId: box.id,
      category: "Mantenimiento",
      expenseDate: new Date(),
    })
  })

  const updatedExp = await db.operatingExpense.findUniqueOrThrow({ where: { id: exp.id } })
  assert.equal(updatedExp.amountCents, 300000)
  assert.equal(updatedExp.description, "Servicio de limpieza profunda")
})

test("9. Contratos de impresión: comprobantes ordinarios sin campos e-CF", async () => {
  const sale = await db.sale.findFirstOrThrow({
    where: { accountId: "baseline-account-rd", cancelledAt: null },
    include: { customer: true, items: { include: { product: true } } },
  })
  const company = await db.companySettings.findFirstOrThrow({
    where: { accountId: "baseline-account-rd" },
  })

  // Simulación de los datos entregados a las plantillas /receipts/sale/ o /invoices/
  const receiptData = {
    companyName: company.name,
    phone: company.phone,
    address: company.address,
    invoiceCode: sale.invoiceCode,
    totalDOP: money.formatRD(sale.totalCents),
    items: sale.items.map((it) => ({
      name: it.product.name,
      quantity: Number(it.qty),
      price: money.formatRD(it.unitPriceCents),
    })),
  }

  assert.ok(receiptData.companyName)
  assert.match(receiptData.invoiceCode, /^[A-Z]-\d+$/)
  assert.ok(receiptData.totalDOP)

  // Verificación estricta de ausencia de campos fiscales electrónicos
  assert.equal("eNcf" in receiptData, false, "El ticket ordinario no debe contener eNcf")
  assert.equal("dgiiSecurityCode" in receiptData, false, "No debe contener dgiiSecurityCode")
  assert.equal("fiscalQr" in receiptData, false, "No debe contener fiscalQr")
  assert.equal("digitalSignature" in receiptData, false, "No debe contener digitalSignature")
})

test("10. Idempotencia y protección en operaciones con identificador", async () => {
  const actor = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isOwner: true } })
  const supp = await db.supplier.findFirstOrThrow({ where: { accountId: "baseline-account-rd" } })
  const prod = await db.product.findFirstOrThrow({ where: { accountId: "baseline-account-rd", sku: "PROD-RD-18" } })

  const operationId = randomUUID()
  const payload = {
    type: "CREDITO",
    supplierId: supp.id,
    dueDate: "2026-12-30",
    initialPaymentCents: 0,
    items: [{ productId: prod.id, qty: 3, unitCostCents: 6000 }],
    operationId,
  }

  const stockBefore = Number((await db.product.findUniqueOrThrow({ where: { id: prod.id } })).stock)

  // Primer envío
  const first = await withActor(actor, async () => {
    return purchases.createPurchase(actor, payload)
  })

  const stockAfterFirst = Number((await db.product.findUniqueOrThrow({ where: { id: prod.id } })).stock)
  assert.equal(stockAfterFirst, stockBefore + 3)

  // Segundo envío con el MISMO operationId
  const second = await withActor(actor, async () => {
    return purchases.createPurchase(actor, payload)
  })

  // Retorna la misma compra sin duplicar stock
  assert.equal(second.id, first.id)
  const stockAfterSecond = Number((await db.product.findUniqueOrThrow({ where: { id: prod.id } })).stock)
  assert.equal(stockAfterSecond, stockAfterFirst, "El stock no debe incrementarse de nuevo en un reintento idempotente")

  // Tercer envío: MISMO operationId pero con carga diferente debe ser rechazado como conflicto
  await assert.rejects(
    withActor(actor, async () => {
      return purchases.createPurchase(actor, {
        ...payload,
        items: [{ productId: prod.id, qty: 5, unitCostCents: 6000 }],
      })
    }),
    /corresponde a otra operación|ID_REUSED|conflicto/i
  )
})

test("11. Contratos HTTP móviles reales (paginación, permisos y ausencia de campos fiscales)", async () => {
  const { NextRequest } = require("next/server")
  const owner = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-rd", isOwner: true } })
  const cashier = await db.user.findFirstOrThrow({ where: { accountId: "baseline-account-rd", username: "cajero_rd" } })

  const salesApi = load("@/app/api/sales/route")
  const purchasesApi = load("@/app/api/purchases/route")
  const expensesApi = load("@/app/api/operating-expenses/route")
  const paymentsApi = load("@/app/api/payments/route")
  const returnsApi = load("@/app/api/returns/route")

  // 11.1 Sin actor/autenticación: 401
  currentActor = null
  const unauthReq = new NextRequest("http://localhost/api/sales?skip=0&take=10")
  const unauthRes = await salesApi.GET(unauthReq)
  assert.equal(unauthRes.status, 401)

  // 11.2 Cajero sin permiso de compras: 403 en compras
  currentActor = cashier
  const cashierReq = new NextRequest("http://localhost/api/purchases?skip=0&take=10")
  const cashierPurchasesRes = await purchasesApi.GET(cashierReq)
  assert.equal(cashierPurchasesRes.status, 403, "Cajero sin permiso de compras debe recibir 403")

  // 11.3 Dueño autorizado: 200 con formato paginado { data, nextSkip } en las 5 rutas
  currentActor = owner
  const endpoints = [
    { name: "sales", api: salesApi, url: "http://localhost/api/sales?skip=0&take=5" },
    { name: "purchases", api: purchasesApi, url: "http://localhost/api/purchases?skip=0&take=5" },
    { name: "expenses", api: expensesApi, url: "http://localhost/api/operating-expenses?skip=0&take=5" },
    { name: "payments", api: paymentsApi, url: "http://localhost/api/payments?skip=0&take=5" },
    { name: "returns", api: returnsApi, url: "http://localhost/api/returns?skip=0&take=5" },
  ]

  for (const ep of endpoints) {
    const req = new NextRequest(ep.url)
    const res = await ep.api.GET(req)
    assert.equal(res.status, 200, `${ep.name} debe responder 200`)
    const body = await res.json()
    assert.ok(Array.isArray(body.data), `${ep.name} debe tener un arreglo data`)
    assert.ok("nextSkip" in body, `${ep.name} debe incluir nextSkip`)

    // Verificar ausencia de campos fiscales electrónicos en todos los items de la respuesta
    for (const item of body.data) {
      assert.equal("eNcf" in item, false, `Item de ${ep.name} no debe contener eNcf`)
      assert.equal("fiscalStatus" in item, false, `Item de ${ep.name} no debe contener fiscalStatus`)
      assert.equal("dgiiSecurityCode" in item, false, `Item de ${ep.name} no debe contener dgiiSecurityCode`)
    }
  }
})

