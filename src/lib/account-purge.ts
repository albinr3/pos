import type { Prisma } from "@prisma/client"

/** Solo invocar desde una transacción autorizada, bajo maintenance y con Account bloqueado. */
export async function purgeAccountData(tx: Prisma.TransactionClient, accountId: string) {
  await tx.cashSourceLink.deleteMany({ where: { accountId } })
  await tx.cashOperation.deleteMany({ where: { accountId } })
  await tx.cashMovement.deleteMany({ where: { accountId } })
  await tx.cashShift.deleteMany({ where: { accountId } })
  await tx.cashControl.deleteMany({ where: { accountId } })
  // Primero los reversos: la autorrelación RESTRICT impide borrar el asiento original antes.
  await tx.treasuryTransfer.deleteMany({ where: { accountId, reversesTransferId: { not: null } } })
  await tx.treasuryTransfer.deleteMany({ where: { accountId } })
  await tx.return.deleteMany({ where: { accountId } })
  await tx.payment.deleteMany({ where: { ar: { sale: { accountId } } } })
  // Los pagos y la deuda restringen la compra/proveedor; Cascade de Account no resuelve ese orden.
  await tx.supplierPayment.deleteMany({ where: { accountId } })
  await tx.accountPayable.deleteMany({ where: { accountId } })
  await tx.purchase.deleteMany({ where: { accountId } })
  await tx.operatingExpense.deleteMany({ where: { accountId } })
  await tx.quote.deleteMany({ where: { accountId } })
  await tx.sale.deleteMany({ where: { accountId } })
  await tx.productRecipeItem.deleteMany({ where: { OR: [{ product: { accountId } }, { ingredient: { accountId } }] } })

  // Estas tablas guardan IDs sin FK: hay que limpiarlas antes de perder los usuarios del negocio.
  const users = await tx.user.findMany({ where: { accountId }, select: { id: true } })
  const userIds = users.map(user => user.id)
  const errors = await tx.errorLog.findMany({ where: { OR: [{ accountId }, { userId: { in: userIds } }] }, select: { id: true } })
  await tx.whatsappOtp.deleteMany({ where: { userId: { in: userIds } } })
  await tx.errorLog.deleteMany({ where: { OR: [{ accountId }, { userId: { in: userIds } }] } })
  await tx.superAdminAuditLog.deleteMany({ where: { targetAccountId: accountId } })
  await tx.superAdminNotification.deleteMany({ where: { OR: [
    { sourceId: { in: errors.map(error => error.id) } },
    { metadata: { path: ["accountId"], equals: accountId } },
    { href: `/super-admin/accounts/${accountId}` },
  ] } })
  await tx.user.deleteMany({ where: { accountId } })
  await tx.account.deleteMany({ where: { id: accountId } })
}
