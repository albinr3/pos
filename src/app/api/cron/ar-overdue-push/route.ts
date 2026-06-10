import { Prisma } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { isDeviceNotRegistered, sendExpoPushNotifications } from "@/lib/expo-push"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const TIME_ZONE = "America/Caracas"
const NOTIFICATION_TYPE = "AR_OVERDUE"

type OverdueAccountAggregate = {
  accountId: string
  overdueCount: number | bigint
  overdueBalanceCents: number | bigint
}

function getCaracasDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = Number(parts.find((part) => part.type === "year")?.value)
  const month = Number(parts.find((part) => part.type === "month")?.value)
  const day = Number(parts.find((part) => part.type === "day")?.value)

  return { year, month, day }
}

function getStartOfTodayInCaracas() {
  const { year, month, day } = getCaracasDateParts()
  return new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0))
}

function getCaracasDateKey() {
  const { year, month, day } = getCaracasDateParts()
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function normalizeNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : Number(value || 0)
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const startOfToday = getStartOfTodayInCaracas()
  const sentForDate = getCaracasDateKey()
  const startedAt = new Date()

  try {
    const aggregates = await prisma.$queryRaw<OverdueAccountAggregate[]>`
      SELECT
        s."accountId" AS "accountId",
        COUNT(ar.id) AS "overdueCount",
        COALESCE(SUM(ar."balanceCents"), 0) AS "overdueBalanceCents"
      FROM "AccountReceivable" ar
      INNER JOIN "Sale" s ON s.id = ar."saleId"
      WHERE ar.status IN ('PENDIENTE', 'PARCIAL')
        AND ar."balanceCents" > 0
        AND ar."dueDate" IS NOT NULL
        AND ar."dueDate" < ${startOfToday}
      GROUP BY s."accountId"
    `

    let accountsChecked = 0
    let accountsNotified = 0
    let accountsSkippedAlreadySent = 0
    let accountsSkippedWithoutTokens = 0
    let ticketsOk = 0
    let ticketsError = 0
    let disabledTokens = 0

    for (const aggregate of aggregates) {
      accountsChecked += 1
      const accountId = aggregate.accountId
      const overdueCount = normalizeNumber(aggregate.overdueCount)
      const overdueBalanceCents = normalizeNumber(aggregate.overdueBalanceCents)

      const tokens = await prisma.pushDeviceToken.findMany({
        where: {
          accountId,
          enabled: true,
        },
        select: {
          expoPushToken: true,
        },
      })

      if (tokens.length === 0) {
        accountsSkippedWithoutTokens += 1
        continue
      }

      try {
        await prisma.pushNotificationLog.create({
          data: {
            accountId,
            type: NOTIFICATION_TYPE,
            sentForDate,
            sentAt: startedAt,
          },
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          accountsSkippedAlreadySent += 1
          continue
        }
        throw error
      }

      const body = `Tienes ${overdueCount} cuentas vencidas por ${formatCurrency(overdueBalanceCents)}.`
      const results = await sendExpoPushNotifications(
        tokens.map((token) => ({
          to: token.expoPushToken,
          title: "Cuentas por cobrar vencidas",
          body,
          sound: "default",
          channelId: "ar-overdue",
          data: {
            type: NOTIFICATION_TYPE,
            screen: "ARMenu",
            overdueCount,
            overdueBalanceCents,
          },
        }))
      )

      accountsNotified += 1

      const invalidTokens: string[] = []
      for (const result of results) {
        if (result.ticket.status === "ok") {
          ticketsOk += 1
          continue
        }

        ticketsError += 1
        if (isDeviceNotRegistered(result.ticket)) {
          invalidTokens.push(result.token)
        }
      }

      if (invalidTokens.length > 0) {
        const updateResult = await prisma.pushDeviceToken.updateMany({
          where: {
            expoPushToken: { in: invalidTokens },
          },
          data: {
            enabled: false,
          },
        })
        disabledTokens += updateResult.count
      }
    }

    return NextResponse.json({
      success: true,
      sentForDate,
      startOfToday: startOfToday.toISOString(),
      accountsChecked,
      accountsNotified,
      accountsSkippedAlreadySent,
      accountsSkippedWithoutTokens,
      ticketsOk,
      ticketsError,
      disabledTokens,
    })
  } catch (error) {
    console.error("Error en GET /api/cron/ar-overdue-push:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error enviando push de CxC vencidas",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
