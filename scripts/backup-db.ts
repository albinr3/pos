#!/usr/bin/env tsx

import { exec } from "child_process"
import { promisify } from "util"
import * as fs from "fs/promises"
import * as path from "path"

const execAsync = promisify(exec)

const BACKUPS_DIR = path.join(process.cwd(), "backups")
const MAX_BACKUPS = 30 // Mantener últimos 30 backups

async function ensureBackupsDir() {
  try {
    await fs.access(BACKUPS_DIR)
  } catch {
    await fs.mkdir(BACKUPS_DIR, { recursive: true })
  }
}

async function getDatabaseUrl(): Promise<string> {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL no está definida en las variables de entorno")
  }
  return url
}

async function createBackup(): Promise<string> {
  await ensureBackupsDir()

  const dbUrl = await getDatabaseUrl()
  // Formato: backup_YYYY-MM-DD_HH-MM-SS.sql
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const hours = String(now.getHours()).padStart(2, "0")
  const minutes = String(now.getMinutes()).padStart(2, "0")
  const seconds = String(now.getSeconds()).padStart(2, "0")
  const filename = `backup_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.sql`
  const filepath = path.join(BACKUPS_DIR, filename)

  // Extraer información de conexión de DATABASE_URL
  // Formato: postgresql://user:password@host:port/database?params
  const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/)
  if (!urlMatch) {
    throw new Error("Formato de DATABASE_URL inválido")
  }

  const [, user, password, host, port, database] = urlMatch

  // Crear backup usando pg_dump
  // --clean: incluye comandos DROP para limpiar antes de restaurar
  // --if-exists: usa IF EXISTS en los DROP para evitar errores
  // Usar variables de entorno directamente (funciona en todas las plataformas)
  const command = `pg_dump -h ${host} -p ${port} -U ${user} -d ${database} --clean --if-exists -F p -f "${filepath}"`

  try {
    await execAsync(command, {
      env: { ...process.env, PGPASSWORD: password },
    })
    console.log(`✅ Backup creado: ${filename}`)
    return filename
  } catch (error: any) {
    // Limpiar archivo si falló
    try {
      await fs.unlink(filepath)
    } catch {}

    throw new Error(`Error creando backup: ${error.message}`)
  }
}

async function cleanupOldBackups() {
  try {
    const files = await fs.readdir(BACKUPS_DIR)
    const backupFiles = files
      .filter((f) => f.startsWith("backup_") && f.endsWith(".sql"))
      .map((f) => ({
        name: f,
        path: path.join(BACKUPS_DIR, f),
      }))

    // Ordenar por fecha (más reciente primero)
    const filesWithStats = await Promise.all(
      backupFiles.map(async (f) => ({
        ...f,
        stat: await fs.stat(f.path),
      }))
    )

    filesWithStats.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime())

    // Eliminar backups antiguos
    if (filesWithStats.length > MAX_BACKUPS) {
      const toDelete = filesWithStats.slice(MAX_BACKUPS)
      for (const file of toDelete) {
        await fs.unlink(file.path)
        console.log(`🗑️  Backup antiguo eliminado: ${file.name}`)
      }
    }
  } catch (error) {
    console.error("Error limpiando backups antiguos:", error)
  }
}

async function main() {
  try {
    console.log("🔄 Iniciando backup de base de datos...")
    const filename = await createBackup()
    await cleanupOldBackups()
    console.log(`✅ Backup completado: ${filename}`)
    process.exit(0)
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

export { createBackup, cleanupOldBackups }
