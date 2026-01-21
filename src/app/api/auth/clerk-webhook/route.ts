import { NextRequest, NextResponse } from "next/server"
import { Webhook } from "svix"
import { headers } from "next/headers"
import { prisma } from "@/lib/db"

// Marcar como dinámica para evitar ejecución durante el build
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
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
  const { id, email_addresses, first_name, last_name, image_url } = evt.data

  if (eventType === "user.created" || eventType === "user.updated") {
    try {
      const email = email_addresses?.[0]?.email_address
      const name = `${first_name || ""} ${last_name || ""}`.trim() || email?.split("@")[0] || "Usuario"

      // Buscar o crear Account basado en clerkUserId
      let account = await prisma.account.findUnique({
        where: { clerkUserId: id },
        include: { users: { where: { isOwner: true }, take: 1 } },
      })

      if (!account) {
        // Crear nuevo Account y usuario owner
        const baseUsername = email ? email.split("@")[0] : `user_${id.slice(0, 8)}`
        let username = baseUsername

        // Crear Account primero
        const newAccount = await prisma.account.create({
          data: {
            name: name || "Mi Negocio",
            clerkUserId: id,
          },
        })

        // Crear usuario owner asociado al account
        await prisma.user.create({
          data: {
            accountId: newAccount.id,
            name,
            username,
            email: email || null,
            passwordHash: "$2b$10$placeholder", // Usuarios de Clerk no usan passwordHash local
            role: "ADMIN",
            isOwner: true,
          },
        })

        // Recargar account con users
        account = await prisma.account.findUnique({
          where: { clerkUserId: id },
          include: { users: { where: { isOwner: true }, take: 1 } },
        })
      } else {
        // Actualizar usuario owner si existe
        const ownerUser = account.users[0]
        if (ownerUser) {
          await prisma.user.update({
            where: { id: ownerUser.id },
            data: {
              email: email || ownerUser.email,
              name,
            },
          })
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
