import * as XLSX from "xlsx"
import { config as loadEnv } from "dotenv"
import * as path from "path"
import * as fs from "fs/promises"
import { PrismaClient } from "@prisma/client"

loadEnv()

// Función para formatear fechas
function formatDate(timestamp: number | string | Date | null | undefined): string {
  if (!timestamp) return "Nunca"
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return "Fecha inválida"
  const pad = (n: number) => n.toString().padStart(2, "0")
  const day = pad(d.getDate())
  const month = pad(d.getMonth() + 1)
  const year = d.getFullYear()
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

// Normalizar número de teléfono para enlace de WhatsApp
function normalizeWhatsApp(phoneRaw: string): { cleanPhone: string; waLink: string; isValid: boolean } {
  if (!phoneRaw) return { cleanPhone: "", waLink: "", isValid: false }
  
  const cleaned = phoneRaw
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u00A0]/g, " ")
    .replace(/±/g, "+")
    .trim()
  
  const firstPart = cleaned.split(/[\/,;]/)[0].trim()
  let digits = firstPart.replace(/\D/g, "")

  if (!digits || digits.length < 7) {
    return { cleanPhone: cleaned, waLink: "", isValid: false }
  }

  // República Dominicana
  if (digits.length === 10 && (digits.startsWith("809") || digits.startsWith("829") || digits.startsWith("849") || digits.startsWith("839"))) {
    digits = "1" + digits
  }

  // Venezuela
  if (digits.length === 10 && (digits.startsWith("412") || digits.startsWith("414") || digits.startsWith("424") || digits.startsWith("416") || digits.startsWith("426"))) {
    digits = "58" + digits
  }

  // México
  if (digits.length === 10 && (digits.startsWith("55") || digits.startsWith("686"))) {
    digits = "52" + digits
  }

  // Colombia
  if (digits.length === 10 && digits.startsWith("3")) {
    digits = "57" + digits
  }

  const waLink = `https://wa.me/${digits}`
  return { cleanPhone: `+${digits}`, waLink, isValid: true }
}

async function fetchAllClerkUsers(secretKey: string) {
  let allUsers: any[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const res = await fetch(`https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}&order_by=-created_at`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Error al consultar la API de Clerk (${res.status}): ${errorText}`)
    }

    const batch = await res.json()
    if (!Array.isArray(batch) || batch.length === 0) {
      break
    }

    allUsers = allUsers.concat(batch)
    offset += limit

    if (batch.length < limit) {
      break
    }
  }

  return allUsers
}

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim()
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY no está configurado en las variables de entorno (.env)")
  }

  console.log("📥 Consultando usuarios desde la API de Clerk...")
  const clerkUsers = await fetchAllClerkUsers(secretKey)
  console.log(`✅ Se encontraron ${clerkUsers.length} cuentas en Clerk.`)

  // Intentar conectar con la base de datos de producción o local para cruzar información
  const dbUrl = process.env.DATABASE_URL_PROD?.trim() || process.env.DATABASE_URL?.trim()
  let accountMap = new Map<string, any>()

  if (dbUrl) {
    try {
      console.log("🔗 Verificando vinculación con base de datos...")
      const prisma = new PrismaClient({
        datasources: { db: { url: dbUrl } },
      })
      // NOTA / REGLA: Usar select explícito en lugar de findMany({ include: ... }) previene errores cuando
      // existen columnas en schema.prisma (ej. `ownerEmail`) que aún no han sido migradas en la base de datos de producción.
      const clerkIds = clerkUsers.map((u) => u.id)
      const accounts = await prisma.account.findMany({
        where: {
          clerkUserId: {
            in: clerkIds,
          },
        },
        select: {
          id: true,
          name: true,
          clerkUserId: true,
          // NOTA / REGLA: En CompanySettings el campo de teléfono es `phone` y `address`, no existe `rnc` en este modelo.
          companySettings: {
            select: {
              phone: true,
              address: true,
            },
          },
          // NOTA / REGLA: En el modelo User el campo se llama `whatsappNumber`, no `phone` (en CompanySettings sí es `phone`).
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              whatsappNumber: true,
              role: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      })
      for (const acc of accounts) {
        if (acc.clerkUserId) {
          accountMap.set(acc.clerkUserId, acc)
        }
      }
      console.log(`✅ Se cruzaron ${accountMap.size} cuentas de Clerk con registros de negocio en la BD.`)
      await prisma.$disconnect()
    } catch (e: any) {
      console.warn("⚠️ No se pudo cruzar con la BD (se continuará solo con datos de Clerk):", e.message)
    }
  }

  // Procesar filas para Excel
  const rows = clerkUsers.map((u, index) => {
    const primaryEmailObj = u.email_addresses?.find((e: any) => e.id === u.primary_email_address_id) || u.email_addresses?.[0]
    const primaryEmail = primaryEmailObj?.email_address || "N/A"
    const emailVerified = primaryEmailObj?.verification?.status === "verified" ? "Verificado" : "Pendiente"
    const allEmails = u.email_addresses?.map((e: any) => e.email_address).join(", ") || ""

    const primaryPhone = u.phone_numbers?.[0]?.phone_number || "N/A"

    const providers: string[] = []
    if (u.password_enabled) providers.push("Email/Contraseña")
    if (u.external_accounts && u.external_accounts.length > 0) {
      u.external_accounts.forEach((ea: any) => {
        const providerName = ea.provider.replace("oauth_", "").toUpperCase()
        if (!providers.includes(providerName)) providers.push(providerName)
      })
    }
    const authMethod = providers.join(", ") || "Email"

    const device = u.unsafe_metadata?.registration_device || u.unsafe_metadata?.device || "No especificado"
    const userAgent = u.unsafe_metadata?.registration_user_agent || "N/A"

    const firstName = u.first_name || ""
    const lastName = u.last_name || ""
    const fullName = `${firstName} ${lastName}`.trim() || "(Sin nombre)"

    const status = u.banned ? "Baneado" : u.locked ? "Bloqueado" : "Activo"

    // Cruce con BD
    const dbAccount = accountMap.get(u.id)
    const dbBusinessName = dbAccount?.name || "Sin negocio registrado"
    const dbPhoneRaw = dbAccount?.companySettings?.phone || dbAccount?.users?.[0]?.whatsappNumber || ""
    const dbNormalized = normalizeWhatsApp(dbPhoneRaw)

    return {
      "N°": index + 1,
      "Nombre Completo": fullName,
      "Nombre": firstName,
      "Apellido": lastName,
      "Email Principal": primaryEmail,
      "Estado Email": emailVerified,
      "Todos los Emails": allEmails,
      "Teléfono Clerk": primaryPhone,
      "Método de Autenticación": authMethod,
      "Negocio en BD": dbBusinessName,
      "Teléfono en BD": dbNormalized.cleanPhone || dbPhoneRaw || "N/A",
      "WhatsApp Enlace": dbNormalized.waLink || "N/A",
      "Dispositivo Registro": device,
      "Fecha de Registro": formatDate(u.created_at),
      "Último Acceso": formatDate(u.last_sign_in_at),
      "Última Actividad": formatDate(u.last_active_at),
      "Estado Cuenta": status,
      "ID Clerk": u.id,
      "ID Cuenta BD": dbAccount?.id || "N/A",
      "Navegador Registro": userAgent,
    }
  })

  // Crear libro de Excel
  const wb = XLSX.utils.book_new()

  // Hoja 1: Cuentas de Clerk
  const wsUsers = XLSX.utils.json_to_sheet(rows)
  wsUsers["!cols"] = [
    { wch: 5 },   // N°
    { wch: 30 },  // Nombre Completo
    { wch: 18 },  // Nombre
    { wch: 20 },  // Apellido
    { wch: 32 },  // Email Principal
    { wch: 15 },  // Estado Email
    { wch: 35 },  // Todos los Emails
    { wch: 18 },  // Teléfono Clerk
    { wch: 24 },  // Método Autenticación
    { wch: 28 },  // Negocio en BD
    { wch: 20 },  // Teléfono en BD
    { wch: 32 },  // WhatsApp Enlace
    { wch: 22 },  // Dispositivo Registro
    { wch: 20 },  // Fecha de Registro
    { wch: 20 },  // Último Acceso
    { wch: 20 },  // Última Actividad
    { wch: 14 },  // Estado Cuenta
    { wch: 34 },  // ID Clerk
    { wch: 30 },  // ID Cuenta BD
    { wch: 50 },  // Navegador Registro
  ]
  XLSX.utils.book_append_sheet(wb, wsUsers, "Cuentas Clerk")

  // Hoja 2: Resumen
  const verifiedCount = rows.filter((r) => r["Estado Email"] === "Verificado").length
  const withDbAccount = rows.filter((r) => r["Negocio en BD"] !== "Sin negocio registrado").length
  const withWhatsApp = rows.filter((r) => r["WhatsApp Enlace"] !== "N/A").length

  const summaryRows = [
    { "Métrica": "Total de Cuentas en Clerk", "Valor": clerkUsers.length },
    { "Métrica": "Cuentas con Email Verificado", "Valor": verifiedCount },
    { "Métrica": "Cuentas con Negocio Vinculado en BD", "Valor": withDbAccount },
    { "Métrica": "Cuentas con WhatsApp Identificado", "Valor": withWhatsApp },
    { "Métrica": "Fecha de Generación del Reporte", "Valor": formatDate(new Date()) },
  ]
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  wsSummary["!cols"] = [{ wch: 40 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen")

  // Guardar archivo XLSX con manejo de bloqueo EBUSY (por si el usuario lo tiene abierto en Excel)
  let outputPath = path.join(process.cwd(), "usuarios_clerk.xlsx")
  try {
    XLSX.writeFile(wb, outputPath)
  } catch (err: any) {
    // NOTA / REGLA: Si el archivo ya está abierto en Excel en Windows, el SO bloquea el descriptor (EBUSY).
    // Para evitar que el script falle, guardamos automáticamente con un timestamp/sufijo alternativo.
    if (err.code === "EBUSY") {
      const altName = `usuarios_clerk_${Date.now()}.xlsx`
      outputPath = path.join(process.cwd(), altName)
      XLSX.writeFile(wb, outputPath)
      console.warn(`⚠️ 'usuarios_clerk.xlsx' está actualmente abierto en Excel. Se guardó copia en '${altName}'.`)
    } else {
      throw err
    }
  }

  // Guardar también siempre una copia fija en usuarios_clerk_produccion.xlsx
  const prodExcelPath = path.join(process.cwd(), "usuarios_clerk_produccion.xlsx")
  try {
    XLSX.writeFile(wb, prodExcelPath)
  } catch (e: any) {
    // Si también estuviera abierto, se ignora silenciosamente
  }

  // Guardar también archivo CSV con UTF-8 BOM
  let csvOutputPath = path.join(process.cwd(), "usuarios_clerk.csv")
  try {
    const csvContent = XLSX.utils.sheet_to_csv(wsUsers)
    await fs.writeFile(csvOutputPath, "\uFEFF" + csvContent, "utf-8")
  } catch (err: any) {
    if (err.code === "EBUSY") {
      const altCsvName = `usuarios_clerk_${Date.now()}.csv`
      csvOutputPath = path.join(process.cwd(), altCsvName)
      const csvContent = XLSX.utils.sheet_to_csv(wsUsers)
      await fs.writeFile(csvOutputPath, "\uFEFF" + csvContent, "utf-8")
      console.warn(`⚠️ 'usuarios_clerk.csv' estaba abierto. Se guardó como '${altCsvName}'.`)
    } else {
      throw err
    }
  }

  console.log(`\n🎉 Archivo Excel (.xlsx) generado exitosamente:`)
  console.log(`📄 ${outputPath}`)
  console.log(`\n📄 Archivo CSV alternativo generado en:`)
  console.log(`📄 ${csvOutputPath}`)
}

main().catch((err) => {
  console.error("❌ Error en la exportación:", err)
  process.exit(1)
})
