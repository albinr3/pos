"use client"

import { MessageCircle, Upload } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  buildInventoryUploadWhatsAppUrl,
  INVENTORY_UPLOAD_OFFER,
} from "@/lib/inventory-upload-offer"
import { cn } from "@/lib/utils"

type InventoryUploadOfferProps = {
  className?: string
  variant?: "default" | "compact"
  dismissible?: boolean
}

export function InventoryUploadOffer({ className, variant = "default", dismissible = false }: InventoryUploadOfferProps) {
  const isCompact = variant === "compact"
  const [isDismissed, setIsDismissed] = useState(false)

  if (isDismissed) return null

  return (
    <Card
      className={cn(
        "overflow-hidden shadow-sm",
        isCompact
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
          : "border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50",
        className
      )}
    >
      <CardContent
        className={cn(
          "grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center",
          isCompact ? "gap-3 p-3 sm:px-4" : "gap-5 p-5 md:p-6"
        )}
      >
        <div className={cn(
          "flex shrink-0 items-center justify-center text-white shadow-sm",
          isCompact ? "h-10 w-10 rounded-lg bg-emerald-600" : "h-12 w-12 rounded-xl bg-violet-600"
        )}>
          <Upload className={isCompact ? "h-5 w-5" : "h-6 w-6"} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className={cn(
            "font-semibold uppercase tracking-[0.16em]",
            isCompact ? "text-[10px] text-emerald-700 dark:text-emerald-300" : "text-xs text-violet-700"
          )}>
            {INVENTORY_UPLOAD_OFFER.eyebrow}
          </p>
          <h2 className={cn(
            "mt-1 font-semibold tracking-tight text-slate-950 dark:text-slate-50",
            isCompact ? "text-sm sm:text-base" : "text-lg"
          )}>
            {INVENTORY_UPLOAD_OFFER.title}
          </h2>
          {!isCompact ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {INVENTORY_UPLOAD_OFFER.description}
            </p>
          ) : null}
        </div>
        <div className={cn("flex shrink-0 gap-2", dismissible ? "flex-col sm:flex-row" : "block")}>
          <Button
            asChild
            size={isCompact ? "sm" : "default"}
            className={cn(
              "w-full md:w-auto",
              isCompact ? "bg-emerald-600 hover:bg-emerald-700" : "bg-violet-600 hover:bg-violet-700"
            )}
          >
            <a href={buildInventoryUploadWhatsAppUrl()} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              {INVENTORY_UPLOAD_OFFER.ctaLabel}
            </a>
          </Button>
          {dismissible ? (
            <Button
              type="button"
              variant="ghost"
              size={isCompact ? "sm" : "default"}
              className="w-full text-muted-foreground hover:text-foreground md:w-auto"
              onClick={() => setIsDismissed(true)}
            >
              Descartar
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
