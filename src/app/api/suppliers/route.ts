import { NextRequest, NextResponse } from "next/server"
import { hasPermission } from "@/lib/permissions"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { creditDays, PurchaseError } from "@/lib/purchase-credit"
import { sanitizePhone, sanitizeString } from "@/lib/sanitize"
import { hasPermissionOrLog } from "@/lib/permission-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado"
}

function parseTake(value: string | null, defaultValue: number, max: number): number {
  if (value === null) return defaultValue
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return defaultValue
  return Math.min(max, Math.max(1, parsed))
}

// GET /api/suppliers - Listar proveedores activos
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get("query") || "").trim()
    const cursor = searchParams.get("cursor")
    const includeInactive = searchParams.get("includeInactive") === "true"
    if (includeInactive && !hasPermission(user, "canAccessAccountsPayable") && !hasPermission(user, "canManageSuppliers")) return NextResponse.json({ error: "Sin permiso", code: "FORBIDDEN" }, { status: 403 })
    const take = parseTake(searchParams.get("take"), 200, 500)

    const suppliers = await prisma.supplier.findMany({
      where: {
        accountId: user.accountId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { contactName: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: take + 1,
    })

    const hasMore = suppliers.length > take
    const pageItems = hasMore ? suppliers.slice(0, take) : suppliers
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null

    return NextResponse.json({
      data: pageItems.map((s) => ({
        id: s.id,
        name: s.name,
        isActive: s.isActive,
        contactName: s.contactName,
        phone: s.phone,
        creditDays: s.creditDays,
        discountPercentBp: s.discountPercentBp,
        chargesItbis: s.chargesItbis,
        itbisRateBp: s.itbisRateBp,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      nextCursor,
    })
  } catch (error: unknown) {
    if (error instanceof PurchaseError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error("Error en GET /api/suppliers:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al obtener proveedores" },
      { status: 500 }
    )
  }
}

// POST /api/suppliers - Crear proveedor
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const canManageSuppliers = await hasPermissionOrLog(user, "canManageSuppliers", {
      resourceType: "Supplier",
      details: { endpoint: "/api/suppliers", method: "POST" },
    })
    if (!canManageSuppliers) {
      return NextResponse.json({ error: "No tienes permiso para gestionar proveedores" }, { status: 403 })
    }

    const body = await request.json()
    const name = sanitizeString(String(body?.name || ""))
    const contactName =
      typeof body?.contactName === "string" && body.contactName.trim()
        ? sanitizeString(body.contactName)
        : null
    const phone =
      typeof body?.phone === "string" && body.phone.trim()
        ? sanitizePhone(body.phone)
        : null
    const email =
      typeof body?.email === "string" && body.email.trim()
        ? sanitizeString(body.email)
        : null
    const address =
      typeof body?.address === "string" && body.address.trim()
        ? sanitizeString(body.address)
        : null
    const notes =
      typeof body?.notes === "string" && body.notes.trim()
        ? sanitizeString(body.notes)
        : null
    const discountPercentBp = Number.isFinite(Number(body?.discountPercentBp))
      ? Number(body.discountPercentBp)
      : 0
    const days = body.creditDays === undefined ? undefined : creditDays(body.creditDays)
    const chargesItbis = Boolean(body?.chargesItbis)
    const itbisRateBp = chargesItbis
      ? Math.min(10000, Math.max(0, Math.round(Number(body?.itbisRateBp ?? 1800))))
      : null

    if (!name) {
      return NextResponse.json(
        { error: "El nombre es requerido" },
        { status: 400 }
      )
    }

    const existing = await prisma.supplier.findFirst({
      where: {
        accountId: user.accountId,
        isActive: true,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un proveedor con ese nombre" },
        { status: 409 }
      )
    }

    const created = await prisma.supplier.create({
      data: {
        accountId: user.accountId,
        name,
        contactName,
        phone,
        email,
        address,
        notes,
        creditDays: days,
        discountPercentBp,
        chargesItbis,
        itbisRateBp,
      },
    })

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        contactName: created.contactName,
        phone: created.phone,
        email: created.email,
        address: created.address,
        notes: created.notes,
        creditDays: created.creditDays,
        discountPercentBp: created.discountPercentBp,
        chargesItbis: created.chargesItbis,
        itbisRateBp: created.itbisRateBp,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    if (error instanceof PurchaseError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error("Error en POST /api/suppliers:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al crear proveedor" },
      { status: 500 }
    )
  }
}
