import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { processLemonPayment } from "@/lib/billing"
import { prisma } from "@/lib/db"
import { checkRateLimit, getClientIdentifier, RateLimitError } from "@/lib/rate-limit"
import { logError, ErrorCodes, getRequestInfo } from "@/lib/error-logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Lemon Squeezy webhook event types we care about
type LemonEvent =
  | "subscription_created"
  | "subscription_updated"
  | "subscription_payment_success"
  | "subscription_payment_failed"
  | "subscription_cancelled"

interface LemonWebhookPayload {
  meta: {
    event_name: LemonEvent
    custom_data?: {
      account_id?: string
    }
  }
  data: {
    id: string
    type: string
    attributes: {
      store_id: number
      customer_id: number
      order_id: number
      product_id: number
      variant_id: number
      product_name: string
      variant_name: string
      user_name: string
      user_email: string
      status: string
      status_formatted: string
      card_brand: string | null
      card_last_four: string | null
      pause: null | object
      cancelled: boolean
      trial_ends_at: string | null
      billing_anchor: number
      first_subscription_item: {
        id: number
        subscription_id: number
        price_id: number
        quantity: number
        created_at: string
        updated_at: string
      } | null
      urls: {
        update_payment_method: string
        customer_portal: string
      }
      renews_at: string
      ends_at: string | null
      created_at: string
      updated_at: string
      test_mode: boolean
    }
    relationships?: {
      store?: { data: { id: string } }
      customer?: { data: { id: string } }
      order?: { data: { id: string } }
      "order-item"?: { data: { id: string } }
      product?: { data: { id: string } }
      variant?: { data: { id: string } }
      "subscription-invoices"?: { data: { id: string }[] }
    }
  }
}

/**
 * Verify Lemon Squeezy webhook signature
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret)
  const digest = hmac.update(payload).digest("hex")
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

export async function POST(request: NextRequest) {
  try {
    // 🔐 RATE LIMITING - proteger el endpoint de picos/abuso (incluye requests con firma invalida)
    const clientIp = getClientIdentifier(request)
    try {
      checkRateLimit(`webhook:lemon:ip:${clientIp}`, {
        windowMs: 60 * 1000, // 1 min
        maxRequests: 300,
      })
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429, headers: { "Retry-After": String(error.retryAfter) } }
        )
      }
    }

    const webhookSecret = process.env.LEMON_WEBHOOK_SECRET

    if (!webhookSecret) {
      console.error("LEMON_WEBHOOK_SECRET not configured")
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      )
    }

    // Get raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get("x-signature")

    if (!signature) {
      console.error("Missing webhook signature")
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 401 }
      )
    }

    // Verify signature
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret)
    if (!isValid) {
      console.error("Invalid webhook signature")
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      )
    }

    // Parse payload
    const payload: LemonWebhookPayload = JSON.parse(rawBody)
    const eventName = payload.meta.event_name
    const accountId = payload.meta.custom_data?.account_id

    console.log(`Lemon Squeezy webhook received: ${eventName}`, {
      accountId,
      subscriptionId: payload.data.id,
    })

    // Handle different event types
    switch (eventName) {
      case "subscription_created":
      case "subscription_updated":
        await handleSubscriptionUpdate(payload, accountId)
        break

      case "subscription_payment_success":
        await handlePaymentSuccess(payload, accountId)
        break

      case "subscription_payment_failed":
        await handlePaymentFailed(payload, accountId)
        break

      case "subscription_cancelled":
        await handleSubscriptionCancelled(payload, accountId)
        break

      default:
        console.log(`Unhandled event type: ${eventName}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Error processing Lemon Squeezy webhook:", error)
    await logError(error as Error, {
      code: ErrorCodes.BILLING_WEBHOOK_ERROR,
      severity: "CRITICAL",
      ...getRequestInfo(request),
      metadata: { webhook: "lemon_squeezy" },
    })
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    )
  }
}

async function handleSubscriptionUpdate(
  payload: LemonWebhookPayload,
  accountId?: string
) {
  if (!accountId) {
    console.error("No account_id in subscription update webhook")
    return
  }

  const { data } = payload
  const lemonSubscriptionId = data.id
  const lemonCustomerId = data.relationships?.customer?.data?.id

  // Update subscription with Lemon IDs
  await prisma.billingSubscription.updateMany({
    where: { accountId },
    data: {
      lemonSubscriptionId,
      lemonCustomerId,
      provider: "LEMON",
      currency: "USD",
    },
  })

  console.log(`Updated subscription for account ${accountId}`)
}

async function handlePaymentSuccess(
  payload: LemonWebhookPayload,
  accountId?: string
) {
  if (!accountId) {
    // Try to find account by Lemon subscription ID
    const lemonSubscriptionId = payload.data.id
    const subscription = await prisma.billingSubscription.findFirst({
      where: { lemonSubscriptionId },
    })
    
    if (subscription) {
      accountId = subscription.accountId
    } else {
      console.error("No account found for payment success webhook")
      return
    }
  }

  const { data } = payload
  const externalId = data.id
  
  // Calculate amount in cents (Lemon sends amounts in smallest unit)
  // For USD subscriptions, we use our configured price
  const subscription = await prisma.billingSubscription.findUnique({
    where: { accountId },
  })

  if (!subscription) {
    console.error(`Subscription not found for account ${accountId}`)
    return
  }

  const amountCents = subscription.priceUsdCents
  const lemonCustomerId = data.relationships?.customer?.data?.id
  const renewsAtRaw = data.attributes.renews_at
  const renewsAt = renewsAtRaw ? new Date(renewsAtRaw) : undefined
  const validRenewsAt = renewsAt && !Number.isNaN(renewsAt.getTime()) ? renewsAt : undefined

  await processLemonPayment(
    accountId,
    externalId,
    amountCents,
    lemonCustomerId,
    data.id,
    validRenewsAt
  )

  console.log(`Processed payment success for account ${accountId}`)
}

async function handlePaymentFailed(
  payload: LemonWebhookPayload,
  accountId?: string
) {
  if (!accountId) {
    const lemonSubscriptionId = payload.data.id
    const subscription = await prisma.billingSubscription.findFirst({
      where: { lemonSubscriptionId },
    })
    
    if (subscription) {
      accountId = subscription.accountId
    } else {
      console.error("No account found for payment failed webhook")
      return
    }
  }

  // Create a failed payment record
  const subscription = await prisma.billingSubscription.findUnique({
    where: { accountId },
  })

  if (!subscription) return

  await prisma.billingPayment.create({
    data: {
      subscriptionId: subscription.id,
      amountCents: subscription.priceUsdCents,
      currency: "USD",
      provider: "LEMON",
      status: "FAILED",
      externalId: payload.data.id,
    },
  })

  console.log(`Recorded failed payment for account ${accountId}`)
}

async function handleSubscriptionCancelled(
  payload: LemonWebhookPayload,
  accountId?: string
) {
  if (!accountId) {
    const lemonSubscriptionId = payload.data.id
    const subscription = await prisma.billingSubscription.findFirst({
      where: { lemonSubscriptionId },
    })
    
    if (subscription) {
      accountId = subscription.accountId
    } else {
      console.error("No account found for subscription cancelled webhook")
      return
    }
  }

  // Mark subscription as cancelled
  await prisma.billingSubscription.updateMany({
    where: { accountId },
    data: {
      status: "CANCELED",
    },
  })

  console.log(`Subscription cancelled for account ${accountId}`)
}
