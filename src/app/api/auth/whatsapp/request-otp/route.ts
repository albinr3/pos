import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { normalizePhoneNumber, generateOtpCode, sendWhatsAppMessage } from "@/lib/whatsapp"

// Rate limiting simple en memoria (en producción usar Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(identifier: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)

  if (!record || now > record.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (record.count >= maxRequests) {
    return false
  }

  record.count++
  return true
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phoneNumber, purpose } = body

    if (!phoneNumber || typeof phoneNumber !== "string") {
      return NextResponse.json(
        { error: "Número de teléfono requerido" },
        { status: 400 }
      )
    }

    if (purpose !== "login" && purpose !== "signup") {
      return NextResponse.json(
        { error: "Propósito debe ser 'login' o 'signup'" },
        { status: 400 }
      )
    }

    // Normalizar número de teléfono
    const normalizedPhone = normalizePhoneNumber(phoneNumber)
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Número de teléfono inválido. Use formato: 8091234567 o +18091234567" },
        { status: 400 }
      )
    }

    // Rate limiting por IP y por número
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"
    const ipKey = `ip:${ip}`
    const phoneKey = `phone:${normalizedPhone}`

    // Máximo 5 solicitudes por hora por IP
    if (!checkRateLimit(ipKey, 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intente más tarde." },
        { status: 429 }
      )
    }

    // Máximo 5 solicitudes por hora por número
    if (!checkRateLimit(phoneKey, 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes para este número. Intente más tarde." },
        { status: 429 }
      )
    }

    // Verificar si el usuario existe (solo para propósito de login)
    if (purpose === "login") {
      const existingUser = await prisma.user.findUnique({
        where: { whatsappNumber: normalizedPhone },
      })

      if (!existingUser) {
        // No revelar si el usuario existe o no (seguridad)
        // Simular el mismo tiempo de respuesta
        await new Promise((resolve) => setTimeout(resolve, 500))
        return NextResponse.json({
          success: true,
          message: "Si el número está registrado, recibirás un código por WhatsApp",
        })
      }
    }

    // Generar código OTP
    const code = generateOtpCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutos

    // Limpiar OTPs expirados anteriores para este número
    await prisma.whatsappOtp.deleteMany({
      where: {
        phoneNumber: normalizedPhone,
        OR: [
          { expiresAt: { lt: new Date() } },
          { consumedAt: { not: null } },
        ],
      },
    })

    // Crear nuevo OTP
    const otp = await prisma.whatsappOtp.create({
      data: {
        phoneNumber: normalizedPhone,
        code,
        expiresAt,
        purpose,
        ipAddress: ip,
        userAgent: request.headers.get("user-agent") || undefined,
      },
    })

    // Enviar mensaje por WhatsApp
    const message = `Tu código de verificación es: ${code}\n\nVálido por 10 minutos.\n\nNo compartas este código con nadie.`
    const sendResult = await sendWhatsAppMessage(normalizedPhone, message)

    if (!sendResult.success) {
      // Eliminar OTP si falla el envío
      await prisma.whatsappOtp.delete({ where: { id: otp.id } })
      return NextResponse.json(
        { error: sendResult.error || "Error al enviar código por WhatsApp" },
        { status: 500 }
      )
    }

    // Respuesta genérica (no revelar si el usuario existe)
    return NextResponse.json({
      success: true,
      message: "Si el número está registrado, recibirás un código por WhatsApp",
    })
  } catch (error) {
    console.error("Error in request-otp:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
