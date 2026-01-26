import { NextRequest, NextResponse } from "next/server"
import { Webhook } from "svix"
import { headers } from "next/headers"

// Marcar como dinámica para evitar ejecución durante el build
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  // Lazy import de Prisma para evitar inicialización durante el build
  const { prisma } = await import("@/lib/db")
  const { sendResendEmail } = await import("@/lib/resend")
  const { renderWelcomeOwnerEmail, renderNewUserSignupNotification } = await import("@/lib/resend/templates")
  const { logError, ErrorCodes } = await import("@/lib/error-logger")
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    console.error("CLERK_WEBHOOK_SECRET no está configurado")
    return NextResponse.json(
      { error: "Configuración del webhook faltante" },
      { status: 500 }
    )
  }

  const headerPayload = await headers()
  const svix_id = headerPayload.get("svix-id")
  const svix_timestamp = headerPayload.get("svix-timestamp")
  const svix_signature = headerPayload.get("svix-signature")

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: "Error de autorización" },
      { status: 400 }
    )
  }

  const payload = await request.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: any

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    })
  } catch (err) {
    console.error("Error verificando webhook:", err)
    return NextResponse.json(
      { error: "Error de verificación" },
      { status: 400 }
    )
  }

  const eventType = evt.type
  const { id, first_name, last_name, email_addresses } = evt.data

  console.log("[Clerk Webhook] Event type:", eventType)
  console.log("[Clerk Webhook] User ID:", id)
  console.log("[Clerk Webhook] Email addresses:", JSON.stringify(email_addresses))

  if (eventType === "user.created") {
    try {
      const name = `${first_name || ""} ${last_name || ""}`.trim() || "Mi Negocio"

      // Extraer el email primario del usuario
      const primaryEmail = email_addresses?.find(
        (e: { id: string; email_address: string }) => e.email_address
      )?.email_address as string | undefined

      console.log("[Clerk Webhook] Extracted primary email:", primaryEmail)
      console.log("[Clerk Webhook] User name:", name)

      let account = await prisma.account.findUnique({
        where: { clerkUserId: id },
      })

      console.log("[Clerk Webhook] Existing account:", account ? account.id : "none")

      if (!account) {
        account = await prisma.account.create({
          data: {
            name,
            clerkUserId: id,
          },
        })
        console.log("[Clerk Webhook] Created new account:", account.id)

        // Enviar correo de bienvenida al nuevo owner
        if (primaryEmail) {
          console.log("[Clerk Webhook] Attempting to send welcome email to:", primaryEmail)
          try {
            const { subject, html } = await renderWelcomeOwnerEmail({ name })
            console.log("[Clerk Webhook] Email rendered, subject:", subject)
            
            const emailSent = await sendResendEmail({
              to: primaryEmail,
              subject,
              html,
              accountId: account.id,
            })

            if (emailSent) {
              console.log("[Clerk Webhook] Welcome email sent successfully to:", primaryEmail)
            } else {
              console.warn("[Clerk Webhook] No se pudo enviar el correo de bienvenida a", primaryEmail)
              await logError(new Error("Welcome email failed to send - sendResendEmail returned false"), {
                code: ErrorCodes.EXTERNAL_EMAIL_ERROR,
                severity: "MEDIUM",
                accountId: account.id,
                endpoint: "/api/auth/clerk-webhook",
                method: "POST",
                metadata: { 
                  to: primaryEmail, 
                  subject,
                  step: "welcome_email",
                  clerkUserId: id,
                },
              })
            }
          } catch (emailError) {
            console.error("[Clerk Webhook] Error enviando correo de bienvenida:", emailError)
            await logError(emailError as Error, {
              code: ErrorCodes.EXTERNAL_EMAIL_ERROR,
              severity: "MEDIUM",
              accountId: account.id,
              endpoint: "/api/auth/clerk-webhook",
              method: "POST",
              metadata: { 
                to: primaryEmail,
                step: "welcome_email_exception",
                clerkUserId: id,
              },
            })
          }

          // Enviar notificación al equipo de soporte
          console.log("[Clerk Webhook] Attempting to send notification to support team")
          try {
            const registrationDate = new Date().toLocaleString("es-DO", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Santo_Domingo",
            })

            const { subject: supportSubject, html: supportHtml } = await renderNewUserSignupNotification({
              accountName: name,
              userEmail: primaryEmail,
              clerkUserId: id,
              registrationDate,
            })

            const supportEmailSent = await sendResendEmail({
              to: "soporte@movopos.com",
              subject: supportSubject,
              html: supportHtml,
              accountId: account.id,
            })

            if (supportEmailSent) {
              console.log("[Clerk Webhook] Support notification email sent successfully")
            } else {
              console.warn("[Clerk Webhook] No se pudo enviar la notificación a soporte")
            }
          } catch (supportEmailError) {
            console.error("[Clerk Webhook] Error enviando notificación a soporte:", supportEmailError)
            // No registramos como error crítico ya que es solo una notificación interna
          }
        } else {
          console.warn("[Clerk Webhook] No primary email found, skipping welcome email")
          await logError(new Error("No primary email found in Clerk webhook data"), {
            code: ErrorCodes.EXTERNAL_EMAIL_ERROR,
            severity: "LOW",
            accountId: account.id,
            endpoint: "/api/auth/clerk-webhook",
            method: "POST",
            metadata: { 
              step: "no_email_found",
              clerkUserId: id,
              emailAddressesReceived: JSON.stringify(email_addresses),
            },
          })
        }
      } else {
        console.log("[Clerk Webhook] Account already exists, skipping welcome email")
      }
    } catch (error) {
      console.error("[Clerk Webhook] Error procesando webhook de Clerk:", error)
      return NextResponse.json(
        { error: "Error procesando webhook" },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ received: true })
}
