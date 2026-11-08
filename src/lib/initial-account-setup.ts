import { ProductKind, UnitType } from "@prisma/client"
import { ALL_PERMISSION_KEYS } from "@/lib/permissions"
import { createBillingSubscription } from "@/lib/billing"
import { accountIdentityHash, withAccountIdentityLock } from "@/lib/account-deletion-guard"
import { logAuditEvent } from "@/lib/audit-log"

export class SetupError extends Error {
  constructor(public code: "deleted" | "configured") { super(code) }
}

export async function setupInitialAccount({ clerkUserId, account, businessName, whatsappPhone, email }: {
  clerkUserId: string; account: { id: string }; businessName: string; whatsappPhone: string; email: string | null
}) {
  const bcrypt = await import("bcryptjs")
  const passwordHash = await bcrypt.hash("1234", 10)
  const ownerPermissions = Object.fromEntries(ALL_PERMISSION_KEYS.map((key) => [key, true]))
  const result = await withAccountIdentityLock(clerkUserId, async (tx) => {
      const deletion = await tx.accountDeletion.findUnique({ where: { clerkUserHash: accountIdentityHash(clerkUserId) } })
      const currentAccount = await tx.account.findUnique({ where: { id: account.id } })
      if (deletion || !currentAccount || currentAccount.deletionRequestedAt || currentAccount.clerkUserId !== clerkUserId) throw new SetupError("deleted")
      const [userCount, onboarding] = await Promise.all([
        tx.user.count({ where: { accountId: account.id } }),
        tx.accountOnboarding.findUnique({ where: { accountId: account.id } }),
      ])
      // Contar también usuarios inactivos evita recrear el administrador en una cuenta existente.
      if (userCount > 0 || onboarding?.initialSetupCompletedAt) throw new SetupError("configured")

      await tx.account.update({
        where: { id: account.id },
        data: { name: businessName, ownerEmail: email },
      })
      await tx.companySettings.upsert({
        where: { accountId: account.id },
        update: { name: businessName, phone: whatsappPhone },
        create: {
          accountId: account.id,
          name: businessName,
          phone: whatsappPhone,
          address: "",
          allowNegativeStock: false,
          itbisRateBp: 1800,
          salePricesIncludeItbis: true,
          legalTipEnabled: false,
        },
      })
      await tx.invoiceSequence.upsert({
        where: { accountId_series: { accountId: account.id, series: "A" } },
        update: {},
        create: { accountId: account.id, series: "A", lastNumber: 0 },
      })
      await tx.returnSequence.upsert({
        where: { accountId: account.id }, update: {}, create: { accountId: account.id, lastNumber: 0 },
      })
      await tx.quoteSequence.upsert({
        where: { accountId: account.id }, update: {}, create: { accountId: account.id, lastNumber: 0 },
      })

      const owner = await tx.user.create({
        data: {
          accountId: account.id,
          name: "Administrador",
          username: "admin",
          passwordHash,
          email,
          role: "ADMIN",
          isOwner: true,
          hasTemporaryPin: true,
          ...ownerPermissions,
        },
      })
      // Se reservan tres IDs en una sola operación para que recargas o altas simultáneas
      // no puedan duplicar los productos de práctica de una cuenta nueva.
      const demoSequence = await tx.productSequence.upsert({
        where: { accountId: account.id },
        update: { lastNumber: { increment: 3 } },
        create: { accountId: account.id, lastNumber: 3 },
      })
      const demoProducts = [
        { name: "Café Americano", priceCents: 10000, costCents: 5000 },
        { name: "Botella de Agua", priceCents: 5000, costCents: 2500 },
        { name: "Snack", priceCents: 7500, costCents: 3750 },
      ]
      await tx.product.createMany({
        data: demoProducts.map((product, index) => ({
          accountId: account.id,
          productId: demoSequence.lastNumber - 2 + index,
          ...product,
          stock: 10,
          minStock: 0,
          productKind: ProductKind.BASIC,
          unit: UnitType.UNIDAD,
          isAvailableForSale: true,
          isOnboardingDemo: true,
        })),
      })
      const existingSubscription = await tx.billingSubscription.findUnique({ where: { accountId: account.id } })
      const subscription = existingSubscription ?? await createBillingSubscription({ accountId: account.id, client: tx })
      await tx.accountOnboarding.upsert({
        where: { accountId: account.id },
        create: {
          accountId: account.id,
          initialSetupStartedAt: new Date(),
          initialSetupCompletedAt: new Date(),
          demoProductsSeededAt: new Date(),
          mobileAutoStartEligible: true,
        },
        update: { initialSetupCompletedAt: new Date(), demoProductsSeededAt: new Date(), mobileAutoStartEligible: true },
      })
      return { owner, subscription, created: true }
  })
  // Ambos efectos suceden únicamente después de confirmar la transacción.
  try {
    const { notifyNewAccountRegistered } = await import("@/lib/super-admin-notifications")
    await notifyNewAccountRegistered({ accountId: account.id, accountName: businessName, ownerEmail: email })
  } catch (error) { console.error("[Initial activation] Notificación fallida", error) }
  try {
    await logAuditEvent({ accountId: account.id, userId: result.owner.id, userEmail: result.owner.email,
      userUsername: result.owner.username, action: "USER_CREATED", resourceType: "User",
      resourceId: result.owner.id, details: { username: "admin", isOwner: true, source: "initial_activation" } })
  } catch (error) { console.error("[Initial activation] Auditoría fallida", error) }
  return result
}
