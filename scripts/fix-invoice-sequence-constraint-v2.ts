/**
 * Script para reparar completamente el constraint único de InvoiceSequence
 * Versión mejorada que verifica y elimina todos los constraints problemáticos
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🔍 Verificando y reparando constraints de InvoiceSequence...\n")

  try {
    // 1. Verificar registros sin accountId
    const sequencesWithoutAccount = await prisma.$queryRaw<Array<{ id: string; series: string }>>`
      SELECT id, series FROM "InvoiceSequence" WHERE "accountId" IS NULL
    `

    if (sequencesWithoutAccount.length > 0) {
      console.log(`⚠️  Encontrados ${sequencesWithoutAccount.length} registros sin accountId`)
      
      // Obtener o crear default_account
      let defaultAccount = await prisma.account.findFirst({
        where: { id: "default_account" },
      })

      if (!defaultAccount) {
        console.log("📝 Creando default_account...")
        defaultAccount = await prisma.account.create({
          data: {
            id: "default_account",
            name: "Mi Negocio",
            clerkUserId: "pending_clerk_setup",
          },
        })
      }

      console.log("📝 Asignando accountId a registros huérfanos...")
      await prisma.$executeRaw`
        UPDATE "InvoiceSequence" 
        SET "accountId" = 'default_account' 
        WHERE "accountId" IS NULL
      `
      console.log("✅ Registros actualizados\n")
    } else {
      console.log("✅ Todos los registros tienen accountId\n")
    }

    // 2. Verificar constraints existentes
    console.log("🔍 Verificando constraints existentes...")
    const allConstraints = await prisma.$queryRaw<Array<{ 
      constraint_name: string
      constraint_type: string
    }>>`
      SELECT 
        constraint_name,
        constraint_type
      FROM information_schema.table_constraints 
      WHERE table_name = 'InvoiceSequence' 
        AND constraint_type = 'UNIQUE'
      ORDER BY constraint_name
    `

    console.log(`Encontrados ${allConstraints.length} constraints únicos:`)
    allConstraints.forEach(c => {
      console.log(`  - ${c.constraint_name}`)
    })
    console.log()

    // 3. Eliminar constraint único antiguo de 'series' si existe
    const oldConstraint = allConstraints.find(c => 
      c.constraint_name === 'InvoiceSequence_series_key' || 
      c.constraint_name.includes('series') && !c.constraint_name.includes('accountId')
    )

    if (oldConstraint) {
      console.log(`🗑️  Eliminando constraint antiguo: ${oldConstraint.constraint_name}`)
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "InvoiceSequence" DROP CONSTRAINT IF EXISTS "${oldConstraint.constraint_name}"`
        )
        console.log(`✅ Constraint ${oldConstraint.constraint_name} eliminado\n`)
      } catch (error: any) {
        console.log(`⚠️  No se pudo eliminar (puede que no exista): ${error.message}\n`)
      }
    } else {
      console.log("✅ No se encontró constraint único antiguo de 'series'\n")
    }

    // 4. Verificar si el constraint compuesto existe
    const compositeConstraint = allConstraints.find(c => 
      c.constraint_name.includes('accountId') && c.constraint_name.includes('series')
    )

    if (!compositeConstraint) {
      console.log("📝 Creando constraint único compuesto (accountId + series)...")
      try {
        await prisma.$executeRaw`
          CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSequence_accountId_series_key" 
          ON "InvoiceSequence"("accountId", "series")
        `
        console.log("✅ Constraint compuesto creado\n")
      } catch (error: any) {
        console.log(`⚠️  Error al crear constraint compuesto: ${error.message}\n`)
      }
    } else {
      console.log(`✅ Constraint compuesto ya existe: ${compositeConstraint.constraint_name}\n`)
    }

    // 5. Verificar duplicados
    console.log("🔍 Verificando registros duplicados...")
    const duplicates = await prisma.$queryRaw<Array<{ 
      accountId: string
      series: string
      count: bigint
    }>>`
      SELECT "accountId", "series", COUNT(*) as count
      FROM "InvoiceSequence"
      GROUP BY "accountId", "series"
      HAVING COUNT(*) > 1
    `

    if (duplicates.length > 0) {
      console.log(`⚠️  Encontrados ${duplicates.length} grupos con duplicados:`)
      duplicates.forEach(d => {
        console.log(`  - accountId: ${d.accountId}, series: ${d.series}, count: ${d.count}`)
      })
      console.log("\n⚠️  ADVERTENCIA: Hay duplicados. Necesitas limpiarlos manualmente.\n")
    } else {
      console.log("✅ No se encontraron duplicados\n")
    }

    // 6. Verificar registros con series pero sin accountId válido
    const invalidRecords = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "InvoiceSequence" 
      WHERE "accountId" NOT IN (SELECT id FROM "Account")
    `

    if (invalidRecords.length > 0) {
      console.log(`⚠️  Encontrados ${invalidRecords.length} registros con accountId inválido`)
      console.log("📝 Asignando a default_account...")
      await prisma.$executeRaw`
        UPDATE "InvoiceSequence" 
        SET "accountId" = 'default_account' 
        WHERE "accountId" NOT IN (SELECT id FROM "Account")
      `
      console.log("✅ Registros corregidos\n")
    }

    console.log("✅✅✅ Reparación completada exitosamente ✅✅✅")
    console.log("\nAhora puedes intentar guardar una factura nuevamente.")
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
