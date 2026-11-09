import { verifyToken } from "@clerk/nextjs/server"

/** Valida un token móvil sin confiar en el contenido decodificado ni registrar secretos. */
export async function verifyClerkBearer(bearer: string | null): Promise<string | null> {
  if (!bearer) return null
  // Algunas versiones móviles antiguas envían el JWT sin el prefijo Bearer.
  const token = /^Bearer\s+\S+$/i.test(bearer)
    ? bearer.replace(/^Bearer\s+/i, "")
    : /^[^\s.]+\.[^\s.]+\.[^\s.]+$/.test(bearer) ? bearer : null
  if (!token) return null
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      jwtKey: process.env.CLERK_JWT_KEY,
      authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES?.split(",").map(value => value.trim()).filter(Boolean),
    })
    // Ni un JWT manipulado ni una sesión vencida pueden conceder acceso entre empresas.
    return typeof payload.sid === "string" && payload.sid.length > 0 && typeof payload.sub === "string" && payload.sub.length > 0 && typeof payload.exp === "number" && payload.exp * 1000 > Date.now()
      ? payload.sub : null
  } catch { return null }
}
