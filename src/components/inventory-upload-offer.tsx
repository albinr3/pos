import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { dismissInventoryUploadOffer } from "@/app/(app)/inventory-upload-offer-actions"
import { InventoryUploadOfferClient } from "./inventory-upload-offer-client"

type InventoryUploadOfferProps = {
  className?: string
  variant?: "default" | "compact"
  dismissible?: boolean
}

export async function InventoryUploadOffer({ dismissible = true, ...props }: InventoryUploadOfferProps) {
  const user = await getCurrentUser()
  if (user) {
    const account = await prisma.account.findUnique({
      where: { id: user.accountId },
      select: { inventoryUploadOfferDismissed: true },
    })
    // La preferencia pertenece a la cuenta y se respeta en todas las ubicaciones del aviso.
    if (!account || account.inventoryUploadOfferDismissed) return null
  }

  return (
    <InventoryUploadOfferClient
      key={user?.accountId ?? "public"}
      {...props}
      dismissible={dismissible && Boolean(user)}
      onDismiss={user ? dismissInventoryUploadOffer : undefined}
    />
  )
}
