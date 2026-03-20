"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CreditCard,
  Landmark,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { NotificationType } from "@/lib/super-admin-notifications"

type NotificationItem = {
  id: string
  createdAt: string
  type: NotificationType
  title: string
  message: string
  href: string
  isRead: boolean
}

const POLLING_MS = 25000

function getTypeIcon(type: NotificationType) {
  switch (type) {
    case "TRANSFER_PENDING_REVIEW":
      return <Landmark className="h-4 w-4 text-yellow-600" />
    case "CARD_PAYMENT_SUCCESS":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />
    case "CARD_PAYMENT_FAILED":
      return <CreditCard className="h-4 w-4 text-red-600" />
    case "ERROR_HIGH":
      return <AlertTriangle className="h-4 w-4 text-orange-600" />
    case "ERROR_CRITICAL":
      return <AlertTriangle className="h-4 w-4 text-red-600" />
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />
  }
}

export function SuperAdminNotificationsDropdown() {
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])

  const loadNotifications = async () => {
    try {
      const res = await fetch("/api/super-admin/notifications?limit=20", {
        method: "GET",
        cache: "no-store",
      })
      if (!res.ok) return
      const data = await res.json()
      if (!data?.success) return
      setUnreadCount(Number(data.unreadCount || 0))
      setItems(Array.isArray(data.notifications) ? data.notifications : [])
    } catch {
      // Silencioso: no romper header
    } finally {
      setLoading(false)
    }
  }

  const markAllAsRead = async () => {
    try {
      const res = await fetch("/api/super-admin/notifications/read-all", {
        method: "POST",
      })
      if (res.ok) {
        setUnreadCount(0)
        setItems((prev) => prev.map((item) => ({ ...item, isRead: true })))
      }
    } catch {
      // Silencioso: no romper header
    }
  }

  useEffect(() => {
    void loadNotifications()
    const interval = setInterval(() => {
      void loadNotifications()
    }, POLLING_MS)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!open) return
    void loadNotifications()
    if (unreadCount > 0) {
      void markAllAsRead()
    }
  }, [open, unreadCount])

  const unreadBadge = useMemo(() => {
    if (unreadCount <= 0) return null
    const label = unreadCount > 99 ? "99+" : String(unreadCount)
    return (
      <Badge className="absolute -right-1 -top-1 h-5 min-w-[20px] rounded-full px-1 text-[10px] leading-none bg-red-600 text-white">
        {label}
      </Badge>
    )
  }, [unreadCount])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="h-5 w-5" />
          {unreadBadge}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificaciones</span>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-xs text-muted-foreground">
              {unreadCount} sin leer
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No hay notificaciones.
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {items.map((item) => (
              <DropdownMenuItem key={item.id} asChild className="cursor-pointer p-0">
                <Link href={item.href} className="block w-full px-3 py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getTypeIcon(item.type)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{item.message}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(item.createdAt), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </p>
                    </div>
                    {!item.isRead && <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />}
                  </div>
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
