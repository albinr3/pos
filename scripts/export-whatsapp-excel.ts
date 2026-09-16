import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"
import { config as loadEnv } from "dotenv"
import * as path from "path"

loadEnv()

const prodUrl = process.env.DATABASE_URL_PROD?.trim()
if (!prodUrl) {
  throw new Error("DATABASE_URL_PROD no está configurado")
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: prodUrl,
    },
  },
})

// Función para limpiar caracteres Unicode extraños (direccionales, invisibles, etc.)
function cleanString(str: string | null | undefined): string {
  if (!str) return ""
  return str
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u00A0]/g, " ")
    .replace(/±/g, "+")
    .trim()
}

// Normalizar número de teléfono para enlace de WhatsApp
function normalizeWhatsApp(phoneRaw: string): { cleanPhone: string; waLink: string; isValid: boolean } {
  const cleaned = cleanString(phoneRaw)
  
  // Si contiene múltiples números (por ejemplo separados por / o coma)
  const firstPart = cleaned.split(/[\/,;]/)[0].trim()
  
  // Extraer solo dígitos
  let digits = firstPart.replace(/\D/g, "")

  if (!digits || digits.length < 7) {
    return { cleanPhone: cleaned, waLink: "", isValid: false }
  }

  // Descartar números falsos evidentes (ej. 111111111111, 4444444444, 900000000)
  const isRepeating = /^(\d)\1+$/.test(digits)
  if (isRepeating && digits.length > 5) {
    return { cleanPhone: cleaned, waLink: "", isValid: false }
  }

  // Reglas por país comunes en los datos:
  // República Dominicana: 809, 829, 849 (10 dígitos) -> agregar código de país 1
  if (digits.length === 10 && (digits.startsWith("809") || digits.startsWith("829") || digits.startsWith("849") || digits.startsWith("839"))) {
    digits = "1" + digits
  }

  // Si ya tiene 11 dígitos y empieza por 1 y luego 809/829/849/347...
  // Ej: 18098970988 -> queda igual

  // Venezuela (longitud 10 que empieza con 412, 414, 424, 416, 426) -> agregar 58
  if (digits.length === 10 && (digits.startsWith("412") || digits.startsWith("414") || digits.startsWith("424") || digits.startsWith("416") || digits.startsWith("426") || digits.startsWith("422"))) {
    digits = "58" + digits
  }

  // Cuba: 8 dígitos empezando por 5 (ej. 53566034 o 53462653) -> agregar 53
  if (digits.length === 8 && digits.startsWith("5")) {
    digits = "53" + digits
  }

  // México: 10 dígitos (ej. 5511414227 o 6866067206) -> agregar 52
  if (digits.length === 10 && (digits.startsWith("55") || digits.startsWith("686"))) {
    digits = "52" + digits
  }

  // Colombia: 10 dígitos empezando por 3 (ej. 3505453939) -> agregar 57
  if (digits.length === 10 && digits.startsWith("3")) {
    digits = "57" + digits
  }

  const waLink = `https://wa.me/${digits}`
  return { cleanPhone: `+${digits}`, waLink, isValid: true }
}

function formatDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0")
  const day = pad(d.getDate())
  const month = pad(d.getMonth() + 1)
  const year = d.getFullYear()
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

async function exportToExcel() {
  console.log("Extrayendo datos de Supabase...")

  const accounts = await prisma.account.findMany({
    include: {
      companySettings: true,
      billingProfile: true,
      users: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  console.log(`Total de cuentas procesadas: ${accounts.length}`)

  // 1. Datos para la pestaña principal: Con WhatsApp
  const conWhatsAppRows: any[] = []
  
  // 2. Datos para la pestaña completa: Todos los usuarios
  const todosRows: any[] = []

  let indexConWhatsapp = 1
  let indexTodos = 1

  for (const acc of accounts) {
    const owner = acc.users.find(u => u.isOwner) || acc.users[0]
    const rawPhone = cleanString(acc.companySettings?.phone || acc.billingProfile?.phone || owner?.whatsappNumber || "")
    const hasPhone = Boolean(rawPhone)
    
    const ownerName = owner?.name && owner.name !== "ADMIN" && owner.name !== "Administrador" && owner.name !== "admin"
      ? owner.name
      : ""

    // Nombre de la persona o del negocio
    const businessName = cleanString(acc.name)
    const personName = ownerName || cleanString(owner?.name || "")
    const email = cleanString(owner?.email || acc.billingProfile?.email || "")
    const registrationDate = acc.createdAt
    const formattedDate = formatDate(registrationDate)

    const { cleanPhone, waLink, isValid } = normalizeWhatsApp(rawPhone)

    const rowData = {
      "N°": indexTodos++,
      "Nombre del Negocio": businessName,
      "Nombre de la Persona": personName || "No especificado",
      "Email de Registro": email || "Sin email",
      "Teléfono Registrado": rawPhone || "No registrado",
      "WhatsApp Normalizado": isValid ? cleanPhone : (rawPhone || "N/A"),
      "Enlace WhatsApp": isValid ? waLink : "N/A",
      "Fecha de Registro": formattedDate,
      "Tiene Teléfono": hasPhone ? "SÍ" : "NO",
      "ID Cuenta (Supabase)": acc.id,
    }

    todosRows.push(rowData)

    if (hasPhone) {
      conWhatsAppRows.push({
        "N°": indexConWhatsapp++,
        "Nombre del Negocio": businessName,
        "Nombre de la Persona": personName || businessName,
        "Email": email || "Sin email",
        "Teléfono / WhatsApp": rawPhone,
        "WhatsApp Normalizado": isValid ? cleanPhone : rawPhone,
        "Enlace Directo WhatsApp": isValid ? waLink : "Revisar número",
        "Fecha de Registro": formattedDate,
        "ID Cuenta": acc.id,
      })
    }
  }

  // 3. Pestaña de Resumen / Estadísticas
  const resumenRows = [
    { "Métrica": "Total de Cuentas / Negocios Registrados", "Valor": accounts.length },
    { "Métrica": "Usuarios con Número de WhatsApp / Teléfono", "Valor": conWhatsAppRows.length },
    { "Métrica": "Usuarios sin Número Telefónico Registrado", "Valor": accounts.length - conWhatsAppRows.length },
    { "Métrica": "Porcentaje de Cuentas con WhatsApp", "Valor": `${((conWhatsAppRows.length / accounts.length) * 100).toFixed(1)}%` },
    { "Métrica": "Fecha de Extracción", "Valor": formatDate(new Date()) },
    { "Métrica": "Origen de Base de Datos", "Valor": "Supabase (Producción)" },
  ]

  // Crear libro de Excel
  const wb = XLSX.utils.book_new()

  // Hoja 1: Con WhatsApp
  const wsConWhatsApp = XLSX.utils.json_to_sheet(conWhatsAppRows)
  wsConWhatsApp["!cols"] = [
    { wch: 5 },   // N°
    { wch: 35 },  // Negocio
    { wch: 30 },  // Persona
    { wch: 35 },  // Email
    { wch: 25 },  // Teléfono original
    { wch: 22 },  // Teléfono normalizado
    { wch: 35 },  // Enlace WhatsApp
    { wch: 20 },  // Fecha
    { wch: 28 },  // ID Cuenta
  ]
  XLSX.utils.book_append_sheet(wb, wsConWhatsApp, "Usuarios con WhatsApp")

  // Hoja 2: Todos los Usuarios
  const wsTodos = XLSX.utils.json_to_sheet(todosRows)
  wsTodos["!cols"] = [
    { wch: 5 },   // N°
    { wch: 35 },  // Negocio
    { wch: 30 },  // Persona
    { wch: 35 },  // Email
    { wch: 25 },  // Teléfono original
    { wch: 22 },  // Teléfono normalizado
    { wch: 35 },  // Enlace WhatsApp
    { wch: 20 },  // Fecha
    { wch: 15 },  // Tiene Teléfono
    { wch: 28 },  // ID Cuenta
  ]
  XLSX.utils.book_append_sheet(wb, wsTodos, "Todos los Registros")

  // Hoja 3: Resumen
  const wsResumen = XLSX.utils.json_to_sheet(resumenRows)
  wsResumen["!cols"] = [
    { wch: 45 },
    { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen General")

  const outputPath = path.join(process.cwd(), "usuarios_whatsapp_supabase.xlsx")
  XLSX.writeFile(wb, outputPath)

  // Exportar también en formato CSV (con WhatsApp) para herramientas de mensajería masiva o Google Sheets
  const csvOutputPath = path.join(process.cwd(), "usuarios_whatsapp_supabase.csv")
  const csvContent = XLSX.utils.sheet_to_csv(wsConWhatsApp)
  const fs = await import("fs/promises")
  // Incluir BOM UTF-8 para que Excel y otras aplicaciones abran los acentos perfectamente
  await fs.writeFile(csvOutputPath, "\uFEFF" + csvContent, "utf-8")

  console.log(`\n✅ Archivo Excel generado con éxito en:\n${outputPath}`)
  console.log(`✅ Archivo CSV generado con éxito en:\n${csvOutputPath}`)
  console.log(`- Registros con WhatsApp: ${conWhatsAppRows.length}`)
  console.log(`- Total registros: ${todosRows.length}`)
}

exportToExcel()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
