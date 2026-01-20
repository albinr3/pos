/**
 * Script para verificar el estado actual de InvoiceSequence
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🔍 Verificando estado de InvoiceSequence...\n")

  try {
    // 1. Verificar todos los constraints e índices
    console.log("📋 Constraints e índices únicos:")
    const constraints = await prisma.$queryRaw<Array<{ 
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

    const indexes = await prisma.$queryRaw<Array<{ 
      indexname: string
      indexdef: string
    }>>`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE tablename = 'InvoiceSequence'
        AND indexdef LIKE '%UNIQUE%'
      ORDER BY indexname
    `

    console.log("Constraints únicos encontrados:", constraints.length)
    constraints.forEach(c => console.log(`  - ${c.constraint_name} (${c.constraint_type})`))
    
    console.log("\nÍndices únicos encontrados:", indexes.length)
    indexes.forEach(i => console.log(`  - ${i.indexname}`))
    console.log()

    // 2. Verificar registros
    console.log("📊 Registros en InvoiceSequence:")
    const allSequences = await prisma.invoiceSequence.findMany({
      select: {
        id: true,
        accountId: true,
        series: true,
        lastNumber: true,
      },
    })

    console.log(`Total de registros: ${allSequences.length}`)
    allSequences.forEach(s => {
      console.log(`  - ID: ${s.id}, accountId: ${s.accountId || 'NULL'}, series: ${s.series}, lastNumber: ${s.lastNumber}`)
    })
    console.log()

    // 3. Verificar duplicados
    console.log("🔍 Verificando duplicados (accountId + series):")
    const duplicates = await prisma.$queryRaw<Array<{ 
      accountId: string | null
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
        console.log(`  - accountId: ${d.accountId || 'NULL'}, series: ${d.series}, count: ${d.count}`)
      })
    } else {
      console.log("✅ No hay duplicados")
    }
    console.log()

    // 4. Verificar si el constraint compuesto existe
    const hasComposite = constraints.some(c => 
      c.constraint_name.includes('accountId') && c.constraint_name.includes('series')
    ) || indexes.some(i => 
      i.indexdef.includes('accountId') && i.indexdef.includes('series')
    )

    if (!hasComposite) {
      console.log("⚠️  No se encontró constraint compuesto (accountId + series)")
      console.log("📝 Creando constraint compuesto...")
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSequence_accountId_series_key" 
        ON "InvoiceSequence"("accountId", "series")
      `
      console.log("✅ Constraint compuesto creado")
    } else {
      console.log("✅ Constraint compuesto existe")
    }

  } catch (error) {
    console.error("❌ Error:", error)
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
