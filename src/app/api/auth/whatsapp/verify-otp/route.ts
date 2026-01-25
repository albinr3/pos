import { NextRequest, NextResponse } from "next/server"
import { normalizePhoneNumber } from "@/lib/whatsapp"
import { createSession, setSessionCookie } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit-log"
import { checkRateLimit, getClientIdentifier, RateLimitError } from "@/lib/rate-limit"
import { logError, ErrorCodes } from "@/lib/error-logger"

// Marcar como dinámica para evitar ejecución durante el build
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  // Lazy import de Prisma para evitar inicialización durante el build
  const { prisma } = await import("@/lib/db")
  try {
    // 🔐 RATE LIMITING - proteger brute-force/dos en verificacion de OTP
    const clientIp = getClientIdentifier(request)
    try {
      checkRateLimit(`otp-verify:ip:${clientIp}`, {
        windowMs: 60 * 1000, // 1 min
        maxRequests: 20,
        // Sin bloqueo largo: solo limitar por ventana para no romper redes compartidas.
      })
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: `Demasiados intentos. Intenta de nuevo en ${error.retryAfter} segundos.` },
          {
            status: 429,
            headers: { "Retry-After": String(error.retryAfter) },
          }
        )
      }
    }

    const body = await request.json()
    const { phoneNumber, code } = body

    if (!phoneNumber || typeof phoneNumber !== "string") {
      return NextResponse.json(
        { error: "Número de teléfono requerido" },
        { status: 400 }
      )
    }

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { error: "Código inválido. Debe tener 6 dígitos." },
        { status: 400 }
      )
    }

    // Normalizar número de teléfono
    const normalizedPhone = normalizePhoneNumber(phoneNumber)
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Número de teléfono inválido" },
        { status: 400 }
      )
    }

    // Rate limit adicional por numero para evitar adivinacion de codigos a un objetivo especifico
    try {
      checkRateLimit(`otp-verify:phone:${normalizedPhone}`, {
        windowMs: 10 * 60 * 1000, // 10 min
        maxRequests: 10,
        blockDurationMs: 10 * 60 * 1000,
      })
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: `Demasiados intentos. Intenta de nuevo en ${error.retryAfter} segundos.` },
          {
            status: 429,
            headers: { "Retry-After": String(error.retryAfter) },
          }
        )
      }
    }

    // Buscar OTP válido
    const otp = await prisma.whatsappOtp.findFirst({
      where: {
        phoneNumber: normalizedPhone,
        code,
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    })

    if (!otp) {
      // Incrementar intentos si existe un OTP pero está expirado o ya fue usado
      const recentOtp = await prisma.whatsappOtp.findFirst({
        where: {
          phoneNumber: normalizedPhone,
          code,
        },
        orderBy: { createdAt: "desc" },
      })

      if (recentOtp) {
        await prisma.whatsappOtp.update({
          where: { id: recentOtp.id },
          data: { attempts: { increment: 1 } },
        })
      }

      const existingUser = await prisma.user.findFirst({
        where: { whatsappNumber: normalizedPhone },
        select: { id: true, accountId: true },
      })
      await logAuditEvent({
        accountId: existingUser?.accountId || "unknown",
        userId: existingUser?.id,
        action: "LOGIN_FAILED",
        resourceType: "User",
        resourceId: existingUser?.id,
        details: { reason: "invalid_or_expired_code", whatsappNumber: normalizedPhone },
      })

      return NextResponse.json(
        { error: "Código inválido o expirado" },
        { status: 400 }
      )
    }

    // Verificar intentos (máximo 5)
    if (otp.attempts >= 5) {
      await prisma.whatsappOtp.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      })
      const existingUser = await prisma.user.findFirst({
        where: { whatsappNumber: normalizedPhone },
        select: { id: true, accountId: true },
      })
      await logAuditEvent({
        accountId: existingUser?.accountId || "unknown",
        userId: existingUser?.id,
        action: "LOGIN_FAILED",
        resourceType: "User",
        resourceId: existingUser?.id,
        details: { reason: "too_many_attempts", whatsappNumber: normalizedPhone },
      })
      return NextResponse.json(
        { error: "Demasiados intentos fallidos. Solicite un nuevo código." },
        { status: 400 }
      )
    }

    // Marcar OTP como consumido
    await prisma.whatsappOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    })

    // Buscar o crear usuario
    let user = await prisma.user.findFirst({
      where: { whatsappNumber: normalizedPhone },
    })
    let createdUserId: string | null = null

    if (!user) {
      // Crear nuevo usuario si no existe
      if (otp.purpose !== "signup") {
        return NextResponse.json(
          { error: "Usuario no encontrado. Use 'signup' para registrarse." },
          { status: 404 }
        )
      }

      // Generar username único basado en el número
      const baseUsername = `user_${normalizedPhone.replace(/[^0-9]/g, "")}`
      let username = baseUsername
      let counter = 1

      while (await prisma.user.findFirst({ where: { username } })) {
        username = `${baseUsername}_${counter}`
        counter++
      }

      // Obtener o crear account default para usuarios de WhatsApp
      let account = await prisma.account.findFirst({
        where: { id: "default_account" },
      })

      if (!account) {
        account = await prisma.account.create({
          data: {
            id: "default_account",
            name: "Mi Negocio",
            clerkUserId: "whatsapp_users",
          },
        })
      }

      user = await prisma.user.create({
        data: {
          accountId: account.id,
          name: `Usuario ${normalizedPhone.slice(-4)}`, // Últimos 4 dígitos
          username,
          whatsappNumber: normalizedPhone,
          whatsappVerifiedAt: new Date(),
          role: "CAJERO", // Rol por defecto
          passwordHash: "$2b$10$placeholder", // Usuarios de WhatsApp no usan passwordHash local
        },
      })
      createdUserId = user.id
    } else {
      // Actualizar fecha de verificación
      await prisma.user.update({
        where: { id: user.id },
        data: { whatsappVerifiedAt: new Date() },
      })
    }

    // Crear sesión
    const sessionToken = await createSession(user.id)
    await setSessionCookie(sessionToken)

    if (createdUserId) {
      await logAuditEvent({
        accountId: user.accountId,
        userId: user.id,
        userEmail: user.email ?? null,
        userUsername: user.username ?? null,
        action: "USER_CREATED",
        resourceType: "User",
        resourceId: createdUserId,
        details: {
          username: user.username,
          name: user.name,
          role: user.role,
          source: "whatsapp_signup",
        },
      })
    }

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      action: "LOGIN_SUCCESS",
      resourceType: "User",
      resourceId: user.id,
      details: { method: "whatsapp" },
    })

    // Limpiar OTPs expirados para este número
    await prisma.whatsappOtp.deleteMany({
      where: {
        phoneNumber: normalizedPhone,
        OR: [
          { expiresAt: { lt: new Date() } },
          { consumedAt: { not: null } },
        ],
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    })
  } catch (error) {
    console.error("Error in verify-otp:", error)
    await logError(error as Error, {
      code: ErrorCodes.AUTH_FAILED,
      severity: "HIGH",
      endpoint: "/api/auth/whatsapp/verify-otp",
      method: "POST",
      metadata: { step: "verify_otp" },
    })
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
