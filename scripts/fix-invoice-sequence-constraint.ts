/**
 * Script para reparar el constraint único de InvoiceSequence
 * 
 * Este script elimina el constraint único antiguo de 'series' si existe
 * y asegura que solo exista el constraint compuesto de 'accountId + series'
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Verificando constraints de InvoiceSequence...")

  try {
    // Verificar si hay registros sin accountId
    const sequencesWithoutAccount = await prisma.$queryRaw<Array<{ id: string; series: string }>>`
      SELECT id, series FROM "InvoiceSequence" WHERE "accountId" IS NULL
    `

    if (sequencesWithoutAccount.length > 0) {
      console.log(`Encontrados ${sequencesWithoutAccount.length} registros sin accountId`)
      console.log("Asignando a default_account...")
      
      // Asignar a default_account si existe
      const defaultAccount = await prisma.account.findFirst({
        where: { id: "default_account" },
      })

      if (defaultAccount) {
        await prisma.$executeRaw`
          UPDATE "InvoiceSequence" 
          SET "accountId" = 'default_account' 
          WHERE "accountId" IS NULL
        `
        console.log("Registros actualizados")
      } else {
        console.log("No se encontró default_account. Creando uno...")
        await prisma.account.create({
          data: {
            id: "default_account",
            name: "Mi Negocio",
            clerkUserId: "pending_clerk_setup",
          },
        })
        await prisma.$executeRaw`
          UPDATE "InvoiceSequence" 
          SET "accountId" = 'default_account' 
          WHERE "accountId" IS NULL
        `
        console.log("Registros actualizados")
      }
    }

    // Verificar si el constraint único compuesto existe
    const compositeConstraint = await prisma.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'InvoiceSequence' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name LIKE '%accountId%series%'
    `

    if (compositeConstraint.length === 0) {
      console.log("Creando constraint único compuesto...")
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSequence_accountId_series_key" 
        ON "InvoiceSequence"("accountId", "series")
      `
      console.log("Constraint compuesto creado")
    } else {
      console.log("Constraint compuesto ya existe")
    }

    // Intentar eliminar el constraint único antiguo de 'series' si existe
    try {
      await prisma.$executeRaw`
        ALTER TABLE "InvoiceSequence" 
        DROP CONSTRAINT IF EXISTS "InvoiceSequence_series_key"
      `
      console.log("Constraint único antiguo de 'series' eliminado (si existía)")
    } catch (error) {
      console.log("No se pudo eliminar el constraint antiguo (puede que no exista):", error)
    }

    console.log("✅ Reparación completada")
  } catch (error) {
    console.error("❌ Error durante la reparación:", error)
    throw error
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
