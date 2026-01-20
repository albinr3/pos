import { NextRequest, NextResponse } from "next/server"
import { Webhook } from "svix"
import { headers } from "next/headers"
import { prisma } from "@/lib/db"

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

if (!WEBHOOK_SECRET) {
  throw new Error("CLERK_WEBHOOK_SECRET no está configurado")
}

export async function POST(request: NextRequest) {
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

      // Buscar usuario existente por clerkUserId o email
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { clerkUserId: id },
            ...(email ? [{ email }] : []),
          ],
        },
      })

      if (user) {
        // Actualizar usuario existente
        await prisma.user.update({
          where: { id: user.id },
          data: {
            clerkUserId: id,
            email: email || user.email,
            name,
            // No sobrescribir campos importantes si ya existen
            ...(user.passwordHash === null ? {} : {}),
          },
        })
      } else {
        // Crear nuevo usuario
        // Generar username único
        const baseUsername = email
          ? email.split("@")[0]
          : `user_${id.slice(0, 8)}`
        let username = baseUsername
        let counter = 1

        while (await prisma.user.findUnique({ where: { username } })) {
          username = `${baseUsername}_${counter}`
          counter++
        }

        await prisma.user.create({
          data: {
            name,
            username,
            email: email || null,
            clerkUserId: id,
            passwordHash: null, // Usuarios de Clerk no tienen passwordHash
            role: "CAJERO", // Rol por defecto
          },
        })
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
