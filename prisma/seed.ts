import { PrismaClient, SuperAdminRole, UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

async function main() {
  // Create or get default account
  const account = await prisma.account.upsert({
    where: { id: "default_account" },
    update: {
      name: "Mi Negocio",
    },
    create: {
      id: "default_account",
      name: "Mi Negocio",
      clerkUserId: "pending_clerk_setup", // Se actualiza cuando el dueño se conecta
    },
  })

  console.log(`Account created/updated: ${account.id}`)

  // Company settings
  await prisma.companySettings.upsert({
    where: { accountId: account.id },
    update: {
      name: "Mi Negocio",
      phone: "809-000-0000",
      address: "Mi Dirección",
      logoUrl: null,
      allowNegativeStock: false,
      itbisRateBp: 1800,
    },
    create: {
      id: "company",
      accountId: account.id,
      name: "Mi Negocio",
      phone: "809-000-0000",
      address: "Mi Dirección",
      logoUrl: null,
      allowNegativeStock: false,
      itbisRateBp: 1800,
    },
  })

  // Invoice sequence A
  await prisma.invoiceSequence.upsert({
    where: { accountId_series: { accountId: account.id, series: "A" } },
    update: {},
    create: { accountId: account.id, series: "A", lastNumber: 0 },
  })

  // Return sequence
  await prisma.returnSequence.upsert({
    where: { accountId: account.id },
    update: {},
    create: { accountId: account.id, lastNumber: 0 },
  })

  // Quote sequence
  await prisma.quoteSequence.upsert({
    where: { accountId: account.id },
    update: {},
    create: { accountId: account.id, lastNumber: 0 },
  })

  // Generic customer (Cliente general)
  const existingGeneric = await prisma.customer.findFirst({
    where: {
      accountId: account.id,
      isGeneric: true,
    },
  })

  if (!existingGeneric) {
    await prisma.customer.create({
      data: {
        accountId: account.id,
        name: "Cliente general",
        isGeneric: true,
        isActive: true,
      },
    })
  } else {
    // Actualizar nombre si es diferente
    if (existingGeneric.name !== "Cliente general") {
      await prisma.customer.update({
        where: { id: existingGeneric.id },
        data: {
          name: "Cliente general",
          isActive: true,
        },
      })
    }
  }

  // Admin user (username: admin, password: admin)
  // Este usuario es el owner del account
  const adminPasswordHash = await hashPassword("admin")
  
  await prisma.user.upsert({
    where: { accountId_username: { accountId: account.id, username: "admin" } },
    update: {},
    create: {
      accountId: account.id,
      name: "Administrador",
      username: "admin",
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      isOwner: true, // Es el dueño del account
      canOverridePrice: true,
      canCancelSales: true,
      canCancelReturns: true,
      canCancelPayments: true,
      canEditSales: true,
      canEditProducts: true,
      canChangeSaleType: true,
      canSellWithoutStock: true,
      canManageBackups: true,
      isActive: true,
    },
  })

  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "superadmin@movopos.com").toLowerCase()
  const superAdminName = process.env.SUPER_ADMIN_NAME || "Super Admin"
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || "superadmin"
  const superAdminPasswordHash = await hashPassword(superAdminPassword)

  await prisma.superAdmin.upsert({
    where: { email: superAdminEmail },
    update: {
      name: superAdminName,
      passwordHash: superAdminPasswordHash,
      role: SuperAdminRole.OWNER,
      isActive: true,
      canManageAccounts: true,
      canApprovePayments: true,
      canModifyPricing: true,
      canSendEmails: true,
      canDeleteAccounts: true,
      canViewFinancials: true,
    },
    create: {
      email: superAdminEmail,
      name: superAdminName,
      passwordHash: superAdminPasswordHash,
      role: SuperAdminRole.OWNER,
      canManageAccounts: true,
      canApprovePayments: true,
      canModifyPricing: true,
      canSendEmails: true,
      canDeleteAccounts: true,
      canViewFinancials: true,
    },
  })

  console.log("Seed completed successfully!")
  console.log("Default admin user: admin / admin")
  console.log(`Super admin user: ${superAdminEmail} / ${superAdminPassword}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
