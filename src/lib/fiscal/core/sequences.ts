import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { DO_ECF_TYPES } from "../profiles/do-ecf/catalog"

type Actor = PermissionAwareUser & { id: string; accountId: string }
type Tx = Prisma.TransactionClient
type Row = { id: string; accountId: string; regime: string; environment: string; type: string; rangeStart: bigint; rangeEnd: bigint; lastNumber: bigint; expiresOn: Date | null; active: boolean; readyForRollover: boolean; authorizationRef: string | null; notes: string | null; version: number; createdAt: Date; updatedAt: Date }
type Allocation = { id: string; accountId: string; sequenceId: string; documentId: string; environment: string; type: string; number: bigint; eNcf: string; sequenceSnapshot: unknown; actorUserId: string; voidedAt: Date | null; voidedBy: string | null; voidReason: string | null; createdAt: Date }
export class FiscalSequenceError extends Error {
  constructor(public code: string, message: string, public status: number, public fields: string[] = []) { super(message) }
}
const fail = (code: string, message: string, status: number, fields: string[] = []): never => { throw new FiscalSequenceError(code, message, status, fields) }
const manage = (actor: Actor) => { if (!hasPermission(actor, "canManageFiscalSequences")) fail("FORBIDDEN", "Sin permiso para gestionar secuencias fiscales", 403) }
const availabilityPermission = (actor: Actor) => { if (!hasPermission(actor, "canManageFiscalSequences") && !hasPermission(actor, "canPrepareFiscalDocuments")) fail("FORBIDDEN", "Sin permiso para consultar disponibilidad", 403) }
const typeValid = (v: unknown): v is string => typeof v === "string" && (DO_ECF_TYPES as readonly string[]).includes(v)
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
function dateValue(value: unknown, type: string): Date | null {
  if (["E32", "E34"].includes(type)) { if (value !== null) fail("INVALID_INPUT", "Este tipo no admite vencimiento", 400, ["expiresOn"]); return null }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail("INVALID_INPUT", "Indica una fecha de vencimiento válida", 400, ["expiresOn"])
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return fail("INVALID_INPUT", "Fecha inválida", 400, ["expiresOn"])
  return date
}
function textValue(value: unknown, field: string, required = false): string | null {
  if (value === null && !required) return null
  if (typeof value !== "string" || value.trim().length > 500 || /[\u0000-\u001f]/.test(value) || (required && !value.trim())) return fail("INVALID_INPUT", "Texto inválido", 400, [field])
  return value.trim() || null
}
function numberValue(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) return fail("INVALID_INPUT", "Usa una cadena de hasta diez dígitos", 400, [field])
  const n = BigInt(value)
  if (n < BigInt(1)) return fail("INVALID_INPUT", "El número debe ser positivo", 400, [field])
  return n
}
function bodyValue(input: unknown, allowed: string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("INVALID_INPUT", "Se esperaba un objeto", 400)
  const body = input as Record<string, unknown>
  const extra = Object.keys(body).filter(key => !allowed.includes(key))
  if (extra.length) fail("INVALID_INPUT", "Campos no admitidos", 400, extra)
  return body
}
function serialize(row: Row) {
  const currentDay = today(), expiry = row.expiresOn?.toISOString().slice(0, 10) ?? null
  const remaining = row.rangeEnd - row.lastNumber, size = row.rangeEnd - row.rangeStart + BigInt(1)
  const days = expiry ? Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${currentDay}T00:00:00Z`)) / 86400000) : null
  return { ...row, rangeStart: row.rangeStart.toString(), rangeEnd: row.rangeEnd.toString(), lastNumber: row.lastNumber.toString(), expiresOn: expiry, remaining: remaining.toString(), expired: days !== null && days < 0, exhausted: remaining === BigInt(0), lowRemaining: remaining * BigInt(10) <= size, expiringSoon: days !== null && days >= 0 && days <= 30, usable: row.active && remaining > BigInt(0) && (days === null || days >= 0) }
}
async function lock(tx: Tx, accountId: string) {
  // Mantener el mismo orden para política, mantenimiento y reserva evita carreras entre cajeros.
  const accounts = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Account" WHERE id = ${accountId} FOR NO KEY UPDATE`
  if (!accounts.length) fail("NOT_FOUND", "Empresa no encontrada", 404)
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${accountId}, 517))::text AS locked`
}
async function profile(tx: Tx, actor: Actor) {
  const rows = await tx.$queryRaw<Array<{ regime: string; jurisdiction: string; environment: string }>>`SELECT regime, jurisdiction, environment FROM "FiscalSettings" WHERE "accountId" = ${actor.accountId}`
  if (!rows.length || rows[0].regime !== "DO_ECF" || rows[0].jurisdiction !== "DO" || rows[0].environment !== "TEST") fail("PROFILE_UNAVAILABLE", "Configura el perfil DO_ECF en ambiente de prueba", 409)
}
async function getRow(tx: Tx, actor: Actor, id: string) {
  const rows = await tx.$queryRaw<Row[]>`SELECT * FROM "FiscalSequence" WHERE "accountId" = ${actor.accountId} AND id = ${id}`
  if (!rows.length) return fail("NOT_FOUND", "Secuencia no encontrada", 404)
  return rows[0]
}
async function event(tx: Tx, actor: Actor, id: string, action: string, reason: string, details: unknown) {
  const json = JSON.stringify(details)
  await tx.$executeRaw`INSERT INTO "FiscalSequenceEvent" (id,"accountId","sequenceId","actorUserId",action,reason,details) VALUES (${crypto.randomUUID()},${actor.accountId},${id},${actor.id},${action},${reason},${json}::jsonb)`
}
export async function listSequences(actor: Actor, take = 50, cursor?: string, type?: string) {
  manage(actor)
  if (!Number.isInteger(take) || take < 1 || take > 200 || (type && !typeValid(type))) fail("INVALID_INPUT", "Filtro inválido", 400)
  if (cursor) await getRow(prisma, actor, cursor)
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM "FiscalSequence" WHERE "accountId" = ${actor.accountId} AND (${type ?? null}::text IS NULL OR type = ${type ?? null}) AND (${cursor ?? null}::text IS NULL OR (type, "rangeStart", id) > (SELECT type, "rangeStart", id FROM "FiscalSequence" WHERE "accountId" = ${actor.accountId} AND id = ${cursor ?? null})) ORDER BY type, "rangeStart", id LIMIT ${take + 1}`
  const items = rows.slice(0, take)
  return { data: items.map(serialize), nextCursor: rows.length > take ? items[items.length - 1].id : null }
}
export async function getSequence(actor: Actor, id: string) { manage(actor); return serialize(await getRow(prisma, actor, id)) }
export async function getSequenceHistory(actor: Actor, id: string, take = 50, cursor?: string) {
  manage(actor); await getRow(prisma, actor, id)
  if (!Number.isInteger(take) || take < 1 || take > 200) fail("INVALID_INPUT", "Paginación inválida", 400)
  if (cursor) { const found = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "FiscalSequenceEvent" WHERE id=${cursor} AND "accountId"=${actor.accountId} AND "sequenceId"=${id}`; if (!found.length) fail("NOT_FOUND", "Cursor no encontrado", 404) }
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT * FROM "FiscalSequenceEvent" WHERE "accountId"=${actor.accountId} AND "sequenceId"=${id} AND (${cursor ?? null}::text IS NULL OR ("createdAt", id) > (SELECT "createdAt", id FROM "FiscalSequenceEvent" WHERE id=${cursor ?? null} AND "accountId"=${actor.accountId} AND "sequenceId"=${id})) ORDER BY "createdAt", id LIMIT ${take + 1}`
  const data = rows.slice(0, take); return { data, nextCursor: rows.length > take ? data[data.length - 1].id : null }
}
export async function availability(actor: Actor, type?: string) {
  availabilityPermission(actor)
  if (type && !typeValid(type)) fail("INVALID_INPUT", "Tipo inválido", 400, ["type"])
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM "FiscalSequence" WHERE "accountId"=${actor.accountId} AND regime='DO_ECF' AND environment='TEST' AND active=true AND (${type ?? null}::text IS NULL OR type=${type ?? null}) ORDER BY type`
  // La consulta para preparar comprobantes no debe revelar observaciones ni soportes administrativos.
  return { data: rows.map(row => { const { type, environment, remaining, expiresOn, expired, exhausted, lowRemaining, expiringSoon, usable } = serialize(row); return { type, environment, remaining, expiresOn, expired, exhausted, lowRemaining, expiringSoon, usable } }), informational: true }
}
export async function createSequence(actor: Actor, input: unknown) {
  manage(actor)
  const body = bodyValue(input, ["type", "environment", "rangeStart", "rangeEnd", "expiresOn", "active", "readyForRollover", "authorizationRef", "notes", "reason"])
  if (!typeValid(body.type) || body.environment !== "TEST" || typeof body.active !== "boolean") fail("INVALID_INPUT", "Tipo, ambiente o estado inválido", 400)
  if ((body.readyForRollover !== undefined && typeof body.readyForRollover !== "boolean") || (body.active && body.readyForRollover)) fail("INVALID_INPUT", "El relevo debe estar inactivo", 400, ["readyForRollover"])
  const type = body.type as string, start = numberValue(body.rangeStart, "rangeStart"), end = numberValue(body.rangeEnd, "rangeEnd")
  if (start > end) fail("INVALID_INPUT", "El inicio supera el final", 400, ["rangeStart", "rangeEnd"])
  const expires = dateValue(body.expiresOn, type), authorizationRef = textValue(body.authorizationRef, "authorizationRef"), notes = textValue(body.notes, "notes"), reason = textValue(body.reason, "reason", true) as string
  return prisma.$transaction(async tx => {
    await lock(tx, actor.accountId); await profile(tx, actor)
    const conflict = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "FiscalSequence" WHERE "accountId"=${actor.accountId} AND regime='DO_ECF' AND environment='TEST' AND type=${type} AND (("rangeStart" <= ${end} AND "rangeEnd" >= ${start}) OR (active AND ${body.active as boolean})) LIMIT 1`
    if (conflict.length) fail("SEQUENCE_CONFLICT", "El rango se superpone o ya hay uno activo", 409)
    const id = crypto.randomUUID(), last = start - BigInt(1)
    await tx.$executeRaw`INSERT INTO "FiscalSequence" (id,"accountId",type,"rangeStart","rangeEnd","lastNumber","expiresOn",active,"readyForRollover","authorizationRef",notes,"updatedAt") VALUES (${id},${actor.accountId},${type},${start},${end},${last},${expires},${body.active as boolean},${body.readyForRollover === true},${authorizationRef},${notes},now())`
    const row = await getRow(tx, actor, id); await event(tx, actor, id, "CREATED", reason, serialize(row)); return serialize(row)
  })
}
export async function updateSequence(actor: Actor, id: string, input: unknown) {
  manage(actor)
  const body = bodyValue(input, ["expectedVersion", "expiresOn", "active", "readyForRollover", "authorizationRef", "notes", "reason"])
  if (!Number.isSafeInteger(body.expectedVersion) || typeof body.active !== "boolean") fail("INVALID_INPUT", "Versión o estado inválido", 400)
  if (body.readyForRollover !== undefined && typeof body.readyForRollover !== "boolean") fail("INVALID_INPUT", "Estado de relevo inválido", 400, ["readyForRollover"])
  const reason = textValue(body.reason, "reason", true) as string, authorizationRef = textValue(body.authorizationRef, "authorizationRef"), notes = textValue(body.notes, "notes")
  return prisma.$transaction(async tx => {
    await lock(tx, actor.accountId); await profile(tx, actor)
    const old = await getRow(tx, actor, id)
    if (old.version !== body.expectedVersion) fail("VERSION_CONFLICT", "La secuencia cambió; vuelve a cargarla", 409)
    const expires = dateValue(body.expiresOn, old.type)
    const active = body.active as boolean
    // Una edición antigua conserva la preparación salvo si activa el rango explícitamente.
    const ready = body.readyForRollover === undefined ? (active ? false : old.readyForRollover) : body.readyForRollover as boolean
    if (active && ready) fail("INVALID_INPUT", "El relevo debe estar inactivo", 400, ["readyForRollover"])
    if (active) {
      const conflict = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "FiscalSequence" WHERE "accountId"=${actor.accountId} AND regime=${old.regime} AND environment=${old.environment} AND type=${old.type} AND active=true AND id<>${id} LIMIT 1`
      if (conflict.length) fail("SEQUENCE_CONFLICT", "Ya existe otro rango activo", 409)
    }
    await tx.$executeRaw`UPDATE "FiscalSequence" SET "expiresOn"=${expires},active=${active},"readyForRollover"=${ready},"authorizationRef"=${authorizationRef},notes=${notes},version=version+1,"updatedAt"=now() WHERE id=${id} AND "accountId"=${actor.accountId}`
    const row = await getRow(tx, actor, id); await event(tx, actor, id, "UPDATED", reason, { before: serialize(old), after: serialize(row) }); return serialize(row)
  })
}
export async function reserveFiscalNumber(tx: Tx, actor: Actor, documentId: string, type: string) {
  if (!hasPermission(actor, "canPrepareFiscalDocuments")) fail("FORBIDDEN", "Sin permiso para preparar documentos fiscales", 403)
  if (!typeValid(type)) fail("INVALID_INPUT", "Tipo inválido", 400)
  await lock(tx, actor.accountId); await profile(tx, actor)
  const documents = await tx.$queryRaw<Array<{ id: string; type: string; state: string }>>`SELECT id,type,state FROM "FiscalDocument" WHERE id=${documentId} AND "accountId"=${actor.accountId} FOR UPDATE`
  if (!documents.length) fail("NOT_FOUND", "Documento no encontrado", 404)
  if (documents[0].type !== type) fail("DOCUMENT_CONFLICT", "El tipo no coincide con el documento", 409)
  const existing = await tx.$queryRaw<Allocation[]>`SELECT * FROM "FiscalNumberAllocation" WHERE "accountId"=${actor.accountId} AND "documentId"=${documentId}`
  if (existing.length) {
    if (existing[0].type !== type || existing[0].environment !== "TEST" || existing[0].voidedAt) fail("ALLOCATION_CONFLICT", "La asignación existente no puede reutilizarse", 409)
    return { ...existing[0], number: existing[0].number.toString() }
  }
  if (documents[0].state !== "VALIDADO") fail("DOCUMENT_CONFLICT", "El documento debe estar validado", 409)
  const rows = await tx.$queryRaw<Row[]>`SELECT * FROM "FiscalSequence" WHERE "accountId"=${actor.accountId} AND regime='DO_ECF' AND environment='TEST' AND type=${type} AND active=true FOR UPDATE`
  if (!rows.length || !serialize(rows[0]).usable) fail("SEQUENCE_UNAVAILABLE", "No hay un rango de prueba disponible", 409)
  const row = rows[0], number = row.lastNumber + BigInt(1), eNcf = `${type}${number.toString().padStart(10, "0")}`, id = crypto.randomUUID()
  const snapshot = JSON.stringify(serialize(row))
  await tx.$executeRaw`UPDATE "FiscalSequence" SET "lastNumber"=${number},"updatedAt"=now() WHERE id=${row.id} AND "accountId"=${actor.accountId}`
  await tx.$executeRaw`INSERT INTO "FiscalNumberAllocation" (id,"accountId","sequenceId","documentId",environment,type,number,"eNcf","sequenceSnapshot","actorUserId") VALUES (${id},${actor.accountId},${row.id},${documentId},'TEST',${type},${number},${eNcf},${snapshot}::jsonb,${actor.id})`
  await event(tx, actor, row.id, "ALLOCATED", "Reserva de prueba", { documentId, eNcf })
  if (number === row.rangeEnd) {
    // La asignación debe insertarse mientras el rango sigue activo: el cambio y la reserva comparten el mismo commit.
    const candidates = await tx.$queryRaw<Row[]>`SELECT * FROM "FiscalSequence" WHERE "accountId"=${actor.accountId} AND regime=${row.regime} AND environment=${row.environment} AND type=${type} AND "readyForRollover"=true AND active=false AND "lastNumber" < "rangeEnd" AND ("expiresOn" IS NULL OR "expiresOn" >= ${today()}::date) ORDER BY "rangeStart", id LIMIT 1 FOR UPDATE`
    const next = candidates[0]
    const details = { documentId, eNcf, previousSequenceId: row.id, previousRangeStart: row.rangeStart.toString(), previousRangeEnd: row.rangeEnd.toString(), nextSequenceId: next?.id ?? null, nextRangeStart: next?.rangeStart.toString() ?? null, nextRangeEnd: next?.rangeEnd.toString() ?? null }
    await event(tx, actor, row.id, "EXHAUSTED", "Último número reservado", details)
    if (next) {
      await tx.$executeRaw`UPDATE "FiscalSequence" SET active=false,version=version+1,"updatedAt"=now() WHERE id=${row.id} AND "accountId"=${actor.accountId}`
      await tx.$executeRaw`UPDATE "FiscalSequence" SET active=true,"readyForRollover"=false,version=version+1,"updatedAt"=now() WHERE id=${next.id} AND "accountId"=${actor.accountId}`
      await event(tx, actor, row.id, "ROLLOVER", "Cambio automático por agotamiento", details)
      await event(tx, actor, next.id, "ROLLOVER", "Activación automática por agotamiento", details)
    }
  }
  return { id, documentId, sequenceId: row.id, number: number.toString(), eNcf, environment: "TEST", type }
}
export async function voidFiscalAllocation(tx: Tx, actor: Actor, documentId: string, reasonInput: string) {
  if (!hasPermission(actor, "canPrepareFiscalDocuments")) fail("FORBIDDEN", "Sin permiso para preparar documentos fiscales", 403)
  const reason = textValue(reasonInput, "reason", true) as string
  await lock(tx, actor.accountId)
  const rows = await tx.$queryRaw<Allocation[]>`SELECT * FROM "FiscalNumberAllocation" WHERE "accountId"=${actor.accountId} AND "documentId"=${documentId} FOR UPDATE`
  if (!rows.length) fail("NOT_FOUND", "Asignación no encontrada", 404)
  if (rows[0].voidedAt) fail("ALLOCATION_CONFLICT", "La asignación ya fue inutilizada", 409)
  await tx.$executeRaw`UPDATE "FiscalNumberAllocation" SET "voidedAt"=now(),"voidedBy"=${actor.id},"voidReason"=${reason} WHERE id=${rows[0].id}`
  await event(tx, actor, rows[0].sequenceId, "VOIDED", reason, { documentId, eNcf: rows[0].eNcf })
}
