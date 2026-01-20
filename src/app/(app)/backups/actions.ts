"use server"

import * as fs from "fs/promises"
import * as path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { prisma } from "@/lib/db"

const execAsync = promisify(exec)

const BACKUPS_DIR = path.join(process.cwd(), "backups")

async function checkBackupPermission(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { canManageBackups: true, role: true },
  })
  
  if (!user) {
    throw new Error("Usuario inválido")
  }
  
  if (!user.canManageBackups && user.role !== "ADMIN") {
    throw new Error("No tienes permiso para gestionar backups")
  }
}

interface BackupFile {
  filename: string
  size: number
  createdAt: Date
}

export async function listBackups(): Promise<BackupFile[]> {
  try {
    await fs.access(BACKUPS_DIR)
  } catch {
    return []
  }

  try {
    const files = await fs.readdir(BACKUPS_DIR)
    const backupFiles = files.filter((f) => f.startsWith("backup_") && f.endsWith(".sql"))

    const filesWithStats = await Promise.all(
      backupFiles.map(async (filename) => {
        const filepath = path.join(BACKUPS_DIR, filename)
        const stat = await fs.stat(filepath)
        return {
          filename,
          size: stat.size,
          createdAt: stat.birthtime,
        }
      })
    )

    // Ordenar por fecha (más reciente primero)
    filesWithStats.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return filesWithStats
  } catch (error) {
    console.error("Error listando backups:", error)
    return []
  }
}

export async function createBackup(username: string): Promise<{ filename: string }> {
  await checkBackupPermission(username)
  const { exec } = await import("child_process")
  const { promisify } = await import("util")
  const execAsync = promisify(exec)
  
  // Asegurar que el directorio de backups existe
  try {
    await fs.access(BACKUPS_DIR)
  } catch {
    await fs.mkdir(BACKUPS_DIR, { recursive: true })
  }
  
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error("DATABASE_URL no está definida")
  }

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

  // Extraer información de conexión
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
    return { filename }
  } catch (error: any) {
    // Limpiar archivo si falló
    try {
      await fs.unlink(filepath)
    } catch {}
    throw new Error(`Error creando backup: ${error.message}`)
  }
}

export async function deleteBackup(filename: string, username: string): Promise<void> {
  await checkBackupPermission(username)
  // Validar que el filename es seguro (acepta formato con T o con _)
  if (!/^backup_\d{4}-\d{2}-\d{2}[T_]\d{2}-\d{2}-\d{2}\.sql$/.test(filename)) {
    throw new Error("Nombre de archivo inválido")
  }

  const filepath = path.join(BACKUPS_DIR, filename)
  
  try {
    await fs.unlink(filepath)
  } catch (error) {
    if ((error as any).code === "ENOENT") {
      throw new Error("Backup no encontrado")
    }
    throw error
  }
}

export async function getBackupPath(filename: string): Promise<string> {
  // Validar que el filename es seguro (acepta formato con T o con _)
  if (!/^backup_\d{4}-\d{2}-\d{2}[T_]\d{2}-\d{2}-\d{2}\.sql$/.test(filename)) {
    throw new Error("Nombre de archivo inválido")
  }

  const filepath = path.join(BACKUPS_DIR, filename)
  
  try {
    await fs.access(filepath)
    return filepath
  } catch {
    throw new Error("Backup no encontrado")
  }
}

export async function restoreBackup(filename: string, username: string): Promise<void> {
  await checkBackupPermission(username)
  // Validar que el filename es seguro (acepta formato con T o con _)
  if (!/^backup_\d{4}-\d{2}-\d{2}[T_]\d{2}-\d{2}-\d{2}\.sql$/.test(filename)) {
    throw new Error("Nombre de archivo inválido")
  }

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error("DATABASE_URL no está definida")
  }

  const filepath = path.join(BACKUPS_DIR, filename)

  // Verificar que el archivo existe
  try {
    await fs.access(filepath)
  } catch {
    throw new Error("Backup no encontrado")
  }

  // Extraer información de conexión
  // Formato: postgresql://user:password@host:port/database?params
  const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/)
  if (!urlMatch) {
    throw new Error("Formato de DATABASE_URL inválido")
  }

  const [, user, password, host, port, database] = urlMatch

  // Restaurar usando psql
  // Usar variables de entorno directamente (funciona en todas las plataformas)
  const command = `psql -h ${host} -p ${port} -U ${user} -d ${database} -f "${filepath}"`

  try {
    await execAsync(command, {
      env: { ...process.env, PGPASSWORD: password },
    })
  } catch (error: any) {
    throw new Error(`Error restaurando backup: ${error.message}`)
  }
}
