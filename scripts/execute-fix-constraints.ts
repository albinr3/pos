/**
 * Ejecuta el script SQL para arreglar los constraints
 */

import { PrismaClient } from "@prisma/client"
import { readFileSync } from "fs"
import { join } from "path"

const prisma = new PrismaClient()

async function main() {
  console.log("Ejecutando script SQL para arreglar constraints...\n")
  
  const sqlFile = readFileSync(join(process.cwd(), "scripts", "fix-constraints.sql"), "utf-8")
  
  // Dividir en comandos individuales
  const commands = sqlFile
    .split(";")
    .map(cmd => cmd.trim())
    .filter(cmd => cmd.length > 0 && !cmd.startsWith("--"))

  for (const command of commands) {
    if (command.includes("DO $$")) {
      // Ejecutar bloques DO directamente
      try {
        await prisma.$executeRawUnsafe(command)
        console.log("✅ Comando ejecutado")
      } catch (error: any) {
        console.log(`⚠️  ${error.message}`)
      }
    } else if (command.startsWith("SELECT")) {
      // Para SELECT, usar queryRaw
      try {
        const result = await prisma.$queryRawUnsafe(command)
        console.log("Resultado:", result)
      } catch (error: any) {
        console.log(`⚠️  ${error.message}`)
      }
    } else {
      // Para otros comandos (ALTER, CREATE, DROP, UPDATE)
      try {
        await prisma.$executeRawUnsafe(command)
        console.log("✅ Comando ejecutado")
      } catch (error: any) {
        console.log(`⚠️  ${error.message}`)
      }
    }
  }

  console.log("\n✅ Script completado")
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error("❌ Error:", e)
    await prisma.$disconnect()
    process.exit(1)
  })
