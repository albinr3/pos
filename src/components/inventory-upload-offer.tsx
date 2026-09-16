import { MessageCircle, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  buildInventoryUploadWhatsAppUrl,
  INVENTORY_UPLOAD_OFFER,
} from "@/lib/inventory-upload-offer"
import { cn } from "@/lib/utils"

type InventoryUploadOfferProps = {
  className?: string
}

export function InventoryUploadOffer({ className }: InventoryUploadOfferProps) {
  return (
    <Card className={cn("overflow-hidden border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 shadow-sm", className)}>
      <CardContent className="grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
          <Upload className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
            {INVENTORY_UPLOAD_OFFER.eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
            {INVENTORY_UPLOAD_OFFER.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {INVENTORY_UPLOAD_OFFER.description}
          </p>
        </div>
        <Button asChild className="w-full bg-violet-600 hover:bg-violet-700 sm:w-auto">
          <a href={buildInventoryUploadWhatsAppUrl()} target="_blank" rel="noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" />
            {INVENTORY_UPLOAD_OFFER.ctaLabel}
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}
