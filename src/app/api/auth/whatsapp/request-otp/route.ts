import { NextRequest, NextResponse } from "next/server"
import { normalizePhoneNumber, generateOtpCode, sendWhatsAppMessage } from "@/lib/whatsapp"
import { checkRateLimit, getClientIdentifier, RateLimitError } from "@/lib/rate-limit"

// Marcar como dinámica para evitar ejecución durante el build
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  // Lazy import de Prisma para evitar inicialización durante el build
  const { prisma } = await import("@/lib/db")
  
  console.log("=== WhatsApp OTP Request Started ===")
  try {
    const body = await request.json()
    console.log("Request body received:", { phoneNumber: body.phoneNumber, purpose: body.purpose })
    const { phoneNumber, purpose } = body

    // 🔐 RATE LIMITING - Por IP y por número
    const clientIp = getClientIdentifier(request)
    
    try {
      // Límite por IP: 5 solicitudes por hora
      checkRateLimit(`otp:ip:${clientIp}`, {
        windowMs: 60 * 60 * 1000,
        maxRequests: 5,
        blockDurationMs: 60 * 60 * 1000
      })

      // Límite por número: 3 solicitudes por hora
      checkRateLimit(`otp:phone:${phoneNumber}`, {
        windowMs: 60 * 60 * 1000,
        maxRequests: 3,
        blockDurationMs: 60 * 60 * 1000
      })
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: `Demasiados intentos. Espera ${error.retryAfter} segundos.` },
          { status: 429 }
        )
      }
    }

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
    console.log("Normalized phone:", normalizedPhone)
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Número de teléfono inválido. Use formato: 8091234567 o +18091234567" },
        { status: 400 }
      )
    }

    // Para login: verificar si el usuario existe, pero SIEMPRE enviar el código
    // (el código de verificación manejará si el usuario existe o no)
    if (purpose === "login") {
      console.log("=== Checking if user exists for login ===")
      const existingUser = await prisma.user.findFirst({
        where: { whatsappNumber: normalizedPhone },
      })
      console.log("Existing user found:", existingUser ? "YES" : "NO")
      
      // Si el usuario no existe, cambiar a signup automáticamente
      // para que el usuario pueda registrarse
      if (!existingUser) {
        console.log("=== User not found, but will send code anyway (will create user on verify) ===")
        // Continuar con el flujo normal para enviar el código
        // El verify-otp manejará la creación del usuario si no existe
      } else {
        console.log("=== User exists, continuing to send OTP ===")
      }
    }

    // Generar código OTP
    console.log("=== Generating OTP code ===")
    const code = generateOtpCode()
    console.log("Generated code:", code)
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
        ipAddress: clientIp,
        userAgent: request.headers.get("user-agent") || undefined,
      },
    })

    // Enviar mensaje por WhatsApp
    const message = `Tu código de verificación es: ${code}\n\nVálido por 10 minutos.\n\nNo compartas este código con nadie.`
    
    console.log("=== About to send WhatsApp message ===")
    console.log("Normalized phone:", normalizedPhone)
    console.log("Code:", code)
    console.log("Message:", message)
    
    const sendResult = await sendWhatsAppMessage(normalizedPhone, message)
    console.log("=== WhatsApp send result ===", sendResult)

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
