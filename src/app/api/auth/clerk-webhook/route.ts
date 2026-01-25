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
  const { renderWelcomeOwnerEmail } = await import("@/lib/resend/templates")
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

  if (eventType === "user.created") {
    try {
      const name = `${first_name || ""} ${last_name || ""}`.trim() || "Mi Negocio"

      // Extraer el email primario del usuario
      const primaryEmail = email_addresses?.find(
        (e: { id: string; email_address: string }) => e.email_address
      )?.email_address as string | undefined

      let account = await prisma.account.findUnique({
        where: { clerkUserId: id },
      })

      if (!account) {
        account = await prisma.account.create({
          data: {
            name,
            clerkUserId: id,
          },
        })

        // Enviar correo de bienvenida al nuevo owner
        if (primaryEmail) {
          try {
            const { subject, html } = await renderWelcomeOwnerEmail({ name })
            const emailSent = await sendResendEmail({
              to: primaryEmail,
              subject,
              html,
            })

            if (!emailSent) {
              console.warn("No se pudo enviar el correo de bienvenida a", primaryEmail)
            }
          } catch (emailError) {
            console.error("Error enviando correo de bienvenida:", emailError)
          }
        }
      }
    } catch (error) {
      console.error("Error procesando webhook de Clerk:", error)
      return NextResponse.json(
        { error: "Error procesando webhook" },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ received: true })
}
