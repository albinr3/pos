// Prepara una base de pruebas local aislada para los escenarios de la línea base fiscal (Etapa 0).
// Seguridad: solo opera sobre bases locales desechables cuyo nombre contenga 'cash_test'.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import bcrypt from "bcryptjs"
import { PrismaClient } from "@prisma/client"

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error("Define TEST_DATABASE_URL; DATABASE_URL nunca se usa como alternativa")
const parsed = new URL(url)
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !/cash_test/.test(parsed.pathname) || ![null, "public"].includes(parsed.searchParams.get("schema"))) {
  throw new Error("Se requiere una base local desechable cash_test en el esquema public")
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const db = new PrismaClient({ datasources: { db: { url } } })

try {
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`
  if (tables.length) throw new Error("La base de pruebas debe estar vacía. No se borra ninguna tabla existente")
} finally {
  await db.$disconnect()
}

// Empujar esquema Prisma completo actual
function runPrisma(args) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/prisma/build/index.js"), ...args],
    { cwd: root, windowsHide: true, stdio: "inherit", env: { ...process.env, DATABASE_URL: url } }
  )
  if (result.error) throw result.error
  if (result.status) throw new Error("No se pudo aplicar el esquema en la base de pruebas")
}

// La opción de migraciones conserva triggers y restricciones; nunca se usa sobre una base no vacía.
if (process.env.FISCAL_TEST_MIGRATE_FULL === "1") runPrisma(["migrate", "deploy", "--schema", path.join(root, "prisma/schema.prisma")])
else runPrisma(["db", "push", "--schema", path.join(root, "prisma/schema.prisma"), "--skip-generate"])

// Crear fixtures para los 3 perfiles de empresa requeridos en la Etapa 0:
// 1. Empresa ordinaria dominicana (sin perfil fiscal, ITBIS 18% incluido, flujo comercial estándar).
// 2. Empresa internacional / otro país (sin ITBIS, moneda/contexto internacional, precios sin impuesto).
// 3. Empresa de preparación DO (República Dominicana, con propina legal, preparada para perfil DO_ECF posterior).
const seedDb = new PrismaClient({ datasources: { db: { url } } })

try {
  const pinHash = bcrypt.hashSync("1234", 10)

  // --- 1. Empresa Ordinaria Dominicana ---
  const accountRD = await seedDb.account.create({
    data: {
      id: "baseline-account-rd",
      name: "Empresa Ordinaria RD",
      clerkUserId: "user_baseline_rd_owner",
    },
  })

  await seedDb.companySettings.create({
    data: {
      accountId: accountRD.id,
      name: "Comercial Dominicana Sin Fiscal",
      phone: "8095550101",
      address: "Av. Winston Churchill 100, Santo Domingo, DN",
      itbisRateBp: 1800,
      salePricesIncludeItbis: true,
      legalTipEnabled: false,
      salePrintFormat: "80mm",
    },
  })

  const ownerRD = await seedDb.user.create({
    data: {
      id: "user-rd-owner",
      accountId: accountRD.id,
      name: "Dueño RD",
      username: "dueno_rd",
      passwordHash: pinHash,
      isOwner: true,
      role: "ADMIN",
      canAccessSales: true,
      canOperateCashShifts: true,
      canManageCashShifts: true,
      canViewAllCashShifts: true,
      canAccessAccountsPayable: true,
      canRegisterSupplierPayments: true,
      canCancelSupplierPayments: true,
      canManageExpenses: true,
      canCreateTreasuryTransfers: true,
    },
  })

  const cashierRD = await seedDb.user.create({
    data: {
      id: "user-rd-cashier",
      accountId: accountRD.id,
      name: "Cajero RD",
      username: "cajero_rd",
      passwordHash: pinHash,
      isOwner: false,
      role: "CAJERO",
      canAccessSales: true,
      canOperateCashShifts: true,
      canManageCashShifts: false,
      canViewAllCashShifts: false,
      canAccessAccountsPayable: false,
      canRegisterSupplierPayments: false,
      canCancelSupplierPayments: false,
      canManageExpenses: false,
      canCreateTreasuryTransfers: false,
    },
  })

  const boxRD = await seedDb.treasuryAccount.create({
    data: {
      id: "treasury-rd-caja",
      accountId: accountRD.id,
      name: "Caja Principal RD",
      type: "CAJA",
      createdByUserId: ownerRD.id,
    },
  })

  const bankRD = await seedDb.treasuryAccount.create({
    data: {
      id: "treasury-rd-banco",
      accountId: accountRD.id,
      name: "Banco Popular RD",
      type: "BANCO",
      createdByUserId: ownerRD.id,
    },
  })

  await seedDb.treasuryOpeningBalance.createMany({
    data: [
      { accountId: accountRD.id, treasuryAccountId: boxRD.id, amountCents: 500000, effectiveAt: new Date() },
      { accountId: accountRD.id, treasuryAccountId: bankRD.id, amountCents: 2000000, effectiveAt: new Date() },
    ],
  })

  const prodRD1 = await seedDb.product.create({
    data: {
      id: "prod-rd-gravado",
      accountId: accountRD.id,
      productId: 1,
      name: "Producto Gravado 18%",
      sku: "PROD-RD-18",
      priceCents: 10000, // 100.00 DOP con ITBIS
      costCents: 6000,
      itbisRateBp: 1800,
      stock: 100,
      isActive: true,
      isAvailableForSale: true,
    },
  })

  const prodRD2 = await seedDb.product.create({
    data: {
      id: "prod-rd-exento",
      accountId: accountRD.id,
      productId: 2,
      name: "Producto Exento 0%",
      sku: "PROD-RD-EX",
      priceCents: 5000, // 50.00 DOP sin ITBIS
      costCents: 3000,
      itbisRateBp: 0,
      stock: 50,
      isActive: true,
      isAvailableForSale: true,
    },
  })

  await seedDb.productSequence.create({
    data: { accountId: accountRD.id, lastNumber: 2 },
  })

  const custRDGeneric = await seedDb.customer.create({
    data: {
      id: "cust-rd-generic",
      accountId: accountRD.id,
      visualId: 1,
      name: "Cliente General",
      isGeneric: true,
      creditEnabled: false,
    },
  })

  const custRDCredit = await seedDb.customer.create({
    data: {
      id: "cust-rd-credit",
      accountId: accountRD.id,
      visualId: 2,
      name: "Cliente a Crédito RD",
      cedula: "001-0000000-1",
      phone: "8095551234",
      isGeneric: false,
      creditEnabled: true,
      creditDays: 30,
    },
  })

  await seedDb.customerSequence.create({
    data: { accountId: accountRD.id, lastNumber: 2 },
  })

  const suppRD = await seedDb.supplier.create({
    data: {
      id: "supp-rd-local",
      accountId: accountRD.id,
      name: "Distribuidora Nacional SRL",
      creditDays: 30,
    },
  })

  // --- 2. Empresa Internacional / Otro País ---
  const accountIntl = await seedDb.account.create({
    data: {
      id: "baseline-account-intl",
      name: "Empresa Internacional",
      clerkUserId: "user_baseline_intl_owner",
    },
  })

  await seedDb.companySettings.create({
    data: {
      accountId: accountIntl.id,
      name: "International Retail LLC",
      phone: "+13055550199",
      address: "100 Biscayne Blvd, Miami, FL 33132, USA",
      itbisRateBp: 0, // Sin ITBIS dominicano
      salePricesIncludeItbis: false, // Precios netos
      legalTipEnabled: false,
      salePrintFormat: "80mm",
    },
  })

  const ownerIntl = await seedDb.user.create({
    data: {
      id: "user-intl-owner",
      accountId: accountIntl.id,
      name: "John Owner",
      username: "owner_intl",
      passwordHash: pinHash,
      isOwner: true,
      role: "ADMIN",
      canAccessSales: true,
      canOperateCashShifts: true,
      canManageCashShifts: true,
      canViewAllCashShifts: true,
      canAccessAccountsPayable: true,
      canRegisterSupplierPayments: true,
      canCancelSupplierPayments: true,
      canManageExpenses: true,
      canCreateTreasuryTransfers: true,
    },
  })

  const cashierIntl = await seedDb.user.create({
    data: {
      id: "user-intl-cashier",
      accountId: accountIntl.id,
      name: "Jane Cashier",
      username: "cashier_intl",
      passwordHash: pinHash,
      isOwner: false,
      role: "CAJERO",
      canAccessSales: true,
      canOperateCashShifts: true,
      canManageCashShifts: false,
      canViewAllCashShifts: false,
      canAccessAccountsPayable: false,
      canRegisterSupplierPayments: false,
      canCancelSupplierPayments: false,
      canManageExpenses: false,
      canCreateTreasuryTransfers: false,
    },
  })

  const boxIntl = await seedDb.treasuryAccount.create({
    data: {
      id: "treasury-intl-cash",
      accountId: accountIntl.id,
      name: "Main Cash Drawer",
      type: "CAJA",
      createdByUserId: ownerIntl.id,
    },
  })

  const prodIntl = await seedDb.product.create({
    data: {
      id: "prod-intl-standard",
      accountId: accountIntl.id,
      productId: 1,
      name: "Global Widget",
      sku: "WIDGET-01",
      priceCents: 2500, // 25.00
      costCents: 1200,
      itbisRateBp: 0,
      stock: 80,
      isActive: true,
      isAvailableForSale: true,
    },
  })

  await seedDb.productSequence.create({
    data: { accountId: accountIntl.id, lastNumber: 1 },
  })

  const custIntl = await seedDb.customer.create({
    data: {
      id: "cust-intl-generic",
      accountId: accountIntl.id,
      visualId: 1,
      name: "Walk-in Guest",
      isGeneric: true,
      creditEnabled: false,
    },
  })

  await seedDb.customerSequence.create({
    data: { accountId: accountIntl.id, lastNumber: 1 },
  })

  const suppIntl = await seedDb.supplier.create({
    data: {
      id: "supp-intl-global",
      accountId: accountIntl.id,
      name: "Global Supplies Inc",
      creditDays: 45,
    },
  })

  // --- 3. Empresa Preparación DO ---
  const accountDOPrep = await seedDb.account.create({
    data: {
      id: "baseline-account-doprep",
      name: "Empresa Preparación DO",
      clerkUserId: "user_baseline_doprep_owner",
    },
  })

  await seedDb.companySettings.create({
    data: {
      accountId: accountDOPrep.id,
      name: "Distribuidora Santiago Preparación",
      phone: "8095800000",
      address: "Av. 27 de Febrero 50, Santiago, República Dominicana",
      itbisRateBp: 1800,
      salePricesIncludeItbis: true,
      legalTipEnabled: true, // Con propina legal del 10%
      salePrintFormat: "CARTA",
    },
  })

  const ownerDOPrep = await seedDb.user.create({
    data: {
      id: "user-doprep-owner",
      accountId: accountDOPrep.id,
      name: "Dueño Preparación DO",
      username: "dueno_doprep",
      passwordHash: pinHash,
      isOwner: true,
      role: "ADMIN",
      canAccessSales: true,
      canOperateCashShifts: true,
      canManageCashShifts: true,
      canViewAllCashShifts: true,
      canAccessAccountsPayable: true,
      canRegisterSupplierPayments: true,
      canCancelSupplierPayments: true,
      canManageExpenses: true,
      canCreateTreasuryTransfers: true,
    },
  })

  const cashierDOPrep = await seedDb.user.create({
    data: {
      id: "user-doprep-cashier",
      accountId: accountDOPrep.id,
      name: "Cajero Preparación DO",
      username: "cajero_doprep",
      passwordHash: pinHash,
      isOwner: false,
      role: "CAJERO",
      canAccessSales: true,
      canOperateCashShifts: true,
      canManageCashShifts: false,
      canViewAllCashShifts: false,
      canAccessAccountsPayable: false,
      canRegisterSupplierPayments: false,
      canCancelSupplierPayments: false,
      canManageExpenses: false,
      canCreateTreasuryTransfers: false,
    },
  })

  const boxDOPrep = await seedDb.treasuryAccount.create({
    data: {
      id: "treasury-doprep-caja",
      accountId: accountDOPrep.id,
      name: "Caja Mostrador Santiago",
      type: "CAJA",
      createdByUserId: ownerDOPrep.id,
    },
  })

  const prodDOPrep = await seedDb.product.create({
    data: {
      id: "prod-doprep-item",
      accountId: accountDOPrep.id,
      productId: 1,
      name: "Servicio / Bien Especial DO",
      sku: "DO-PREP-01",
      priceCents: 15000,
      costCents: 7500,
      itbisRateBp: 1800,
      stock: 120,
      isActive: true,
      isAvailableForSale: true,
    },
  })

  await seedDb.productSequence.create({
    data: { accountId: accountDOPrep.id, lastNumber: 1 },
  })

  const custDOPrep = await seedDb.customer.create({
    data: {
      id: "cust-doprep-general",
      accountId: accountDOPrep.id,
      visualId: 1,
      name: "Consumidor Final Local",
      isGeneric: true,
      creditEnabled: false,
    },
  })

  await seedDb.customerSequence.create({
    data: { accountId: accountDOPrep.id, lastNumber: 1 },
  })

  const suppDOPrep = await seedDb.supplier.create({
    data: {
      id: "supp-doprep-local",
      accountId: accountDOPrep.id,
      name: "Suplidora del Cibao SAS",
      creditDays: 15,
    },
  })

  console.log("Base de prueba de línea base creada con éxito con las 3 empresas de prueba y fixtures comerciales")
} finally {
  await seedDb.$disconnect()
}
