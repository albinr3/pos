import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { sanitizePhone, sanitizeString } from "@/lib/sanitize"
import { ensurePermission } from "@/lib/permission-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type CompanySettingsRecord = {
  name: string
  logoUrl: string | null
  address: string
  phone: string
  defaultViewMode: string
  showItbisOnReceipts: boolean
  salePricesIncludeItbis: boolean
  defaultProfitMarginBp: number
}

function toCompanyPayload(company: CompanySettingsRecord | null) {
  const companyInfo = {
    logo: company?.logoUrl ?? null,
    nombre: company?.name || "",
    telefono: company?.phone || "",
    direccion: company?.address || "",
  }

  return {
    company: companyInfo,
    salesSettings: {
      defaultViewMode: company?.defaultViewMode ?? "list",
      showItbisOnReceipts: company?.showItbisOnReceipts ?? true,
      salePricesIncludeItbis: company?.salePricesIncludeItbis ?? true,
      defaultProfitMarginBp: company?.defaultProfitMarginBp ?? 3000,
    },
    // Compatibilidad con consumidores existentes
    name: company?.name || "",
    logoUrl: company?.logoUrl ?? null,
    address: company?.address || "",
    phone: company?.phone || "",
    defaultViewMode: company?.defaultViewMode ?? "list",
    showItbisOnReceipts: company?.showItbisOnReceipts ?? true,
    salePricesIncludeItbis: company?.salePricesIncludeItbis ?? true,
    defaultProfitMarginBp: company?.defaultProfitMarginBp ?? 3000,
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

async function readBody(request: NextRequest) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  // Lazy import de Prisma para evitar inicialización durante el build
  const { prisma } = await import("@/lib/db")
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      )
    }

    const company = await prisma.companySettings.findFirst({
      where: { accountId: user.accountId } 
    })

    return NextResponse.json(toCompanyPayload(company))
  } catch {
    return NextResponse.json(
      { error: "Error al obtener configuración de empresa" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const { prisma } = await import("@/lib/db")
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    await ensurePermission(user, "canManageSettings", {
      allowAdminBypass: false,
      message: "No tienes permiso para modificar ajustes",
      resourceType: "CompanySettings",
    })

    const body = await readBody(request)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }

    const rawName = readString((body as Record<string, unknown>).nombre) ?? readString((body as Record<string, unknown>).name) ?? ""
    const rawPhone = readString((body as Record<string, unknown>).telefono) ?? readString((body as Record<string, unknown>).phone) ?? ""
    const rawAddress = readString((body as Record<string, unknown>).direccion) ?? readString((body as Record<string, unknown>).address) ?? ""
    const rawLogo = (body as Record<string, unknown>).logo ?? (body as Record<string, unknown>).logoUrl
    const rawDefaultViewMode =
      readString((body as Record<string, unknown>).defaultViewMode) ??
      readString((body as Record<string, unknown>).modoVistaPorDefecto)
    const rawShowItbisOnReceipts =
      readBoolean((body as Record<string, unknown>).showItbisOnReceipts) ??
      readBoolean((body as Record<string, unknown>).desglosarItbisEnRecibos)
    const rawSalePricesIncludeItbis =
      readBoolean((body as Record<string, unknown>).salePricesIncludeItbis) ??
      readBoolean((body as Record<string, unknown>).preciosIncluyenItbis) ??
      readBoolean((body as Record<string, unknown>).precioVentaIncluyeItbis)

    const name = sanitizeString(rawName)
    if (!name) {
      return NextResponse.json({ error: "El nombre de la empresa es requerido" }, { status: 400 })
    }

    const phone = sanitizePhone(rawPhone)
    const address = sanitizeString(rawAddress)
    const logoUrl = typeof rawLogo === "string" ? rawLogo.trim() || null : null
    const defaultViewMode = rawDefaultViewMode === "grid" ? "grid" : "list"
    const showItbisOnReceipts = rawShowItbisOnReceipts ?? true
    const salePricesIncludeItbis = rawSalePricesIncludeItbis ?? true

    const created = await prisma.companySettings.upsert({
      where: { accountId: user.accountId },
      update: {
        name,
        phone,
        address,
        logoUrl,
        defaultViewMode,
        showItbisOnReceipts,
        salePricesIncludeItbis,
      },
      create: {
        accountId: user.accountId,
        name,
        phone,
        address,
        logoUrl,
        defaultViewMode,
        showItbisOnReceipts,
        salePricesIncludeItbis,
        defaultProfitMarginBp: 3000,
      },
    })

    return NextResponse.json(toCompanyPayload(created), { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message.includes("No tienes permiso")) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: "Error al crear configuración de empresa" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const { prisma } = await import("@/lib/db")
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    await ensurePermission(user, "canManageSettings", {
      allowAdminBypass: false,
      message: "No tienes permiso para modificar ajustes",
      resourceType: "CompanySettings",
    })

    const body = await readBody(request)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }

    const current = await prisma.companySettings.findFirst({
      where: { accountId: user.accountId },
    })

    const bodyObj = body as Record<string, unknown>
    const rawName = readString(bodyObj.nombre) ?? readString(bodyObj.name)
    const rawPhone = readString(bodyObj.telefono) ?? readString(bodyObj.phone)
    const rawAddress = readString(bodyObj.direccion) ?? readString(bodyObj.address)
    const rawLogo = bodyObj.logo ?? bodyObj.logoUrl
    const rawDefaultViewMode = readString(bodyObj.defaultViewMode) ?? readString(bodyObj.modoVistaPorDefecto)
    const rawShowItbisOnReceipts = readBoolean(bodyObj.showItbisOnReceipts) ?? readBoolean(bodyObj.desglosarItbisEnRecibos)
    const rawSalePricesIncludeItbis =
      readBoolean(bodyObj.salePricesIncludeItbis) ??
      readBoolean(bodyObj.preciosIncluyenItbis) ??
      readBoolean(bodyObj.precioVentaIncluyeItbis)

    const name = rawName !== null ? sanitizeString(rawName) : current?.name ?? "Mi Negocio"
    if (!name) {
      return NextResponse.json({ error: "El nombre de la empresa es requerido" }, { status: 400 })
    }

    const phone = rawPhone !== null ? sanitizePhone(rawPhone) : current?.phone ?? ""
    const address = rawAddress !== null ? sanitizeString(rawAddress) : current?.address ?? ""
    const defaultViewMode = rawDefaultViewMode !== null
      ? (rawDefaultViewMode === "grid" ? "grid" : "list")
      : (current?.defaultViewMode ?? "list")
    const showItbisOnReceipts = rawShowItbisOnReceipts ?? (current?.showItbisOnReceipts ?? true)
    const salePricesIncludeItbis = rawSalePricesIncludeItbis ?? (current?.salePricesIncludeItbis ?? true)

    let logoUrl = current?.logoUrl ?? null
    if (rawLogo === null) {
      logoUrl = null
    } else if (typeof rawLogo === "string") {
      logoUrl = rawLogo.trim() || null
    }

    const updated = await prisma.companySettings.upsert({
      where: { accountId: user.accountId },
      update: {
        name,
        phone,
        address,
        logoUrl,
        defaultViewMode,
        showItbisOnReceipts,
        salePricesIncludeItbis,
      },
      create: {
        accountId: user.accountId,
        name,
        phone,
        address,
        logoUrl,
        defaultViewMode,
        showItbisOnReceipts,
        salePricesIncludeItbis,
        defaultProfitMarginBp: 3000,
      },
    })

    return NextResponse.json(toCompanyPayload(updated))
  } catch (error) {
    if (error instanceof Error && error.message.includes("No tienes permiso")) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: "Error al actualizar configuración de empresa" },
      { status: 500 }
    )
  }
}





