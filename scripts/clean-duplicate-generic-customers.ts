import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Limpiando clientes genéricos duplicados...")

  // Obtener todos los accounts
  const accounts = await prisma.account.findMany({
    select: { id: true },
  })

  for (const account of accounts) {
    // Buscar todos los clientes genéricos para este account
    const genericCustomers = await prisma.customer.findMany({
      where: {
        accountId: account.id,
        isGeneric: true,
      },
      orderBy: {
        createdAt: "asc", // Mantener el más antiguo
      },
    })

    if (genericCustomers.length > 1) {
      console.log(
        `Account ${account.id}: Encontrados ${genericCustomers.length} clientes genéricos`
      )

      // Mantener el primero (más antiguo)
      const keepCustomer = genericCustomers[0]
      const duplicates = genericCustomers.slice(1)

      console.log(`  Manteniendo: ${keepCustomer.id}`)

      // Para cada duplicado, verificar si tiene ventas asociadas
      for (const duplicate of duplicates) {
        const hasSales = await prisma.sale.count({
          where: { customerId: duplicate.id },
        })

        if (hasSales > 0) {
          console.log(
            `  ⚠️  Cliente ${duplicate.id} tiene ${hasSales} ventas. Actualizando ventas para usar el cliente genérico principal...`
          )
          
          // Actualizar todas las ventas del duplicado para usar el cliente genérico principal
          await prisma.sale.updateMany({
            where: { customerId: duplicate.id },
            data: { customerId: keepCustomer.id },
          })

          // Actualizar AccountReceivable
          await prisma.accountReceivable.updateMany({
            where: { customerId: duplicate.id },
            data: { customerId: keepCustomer.id },
          })

          // Actualizar Quotes
          await prisma.quote.updateMany({
            where: { customerId: duplicate.id },
            data: { customerId: keepCustomer.id },
          })
        }

        // Eliminar el duplicado
        await prisma.customer.delete({
          where: { id: duplicate.id },
        })
        console.log(`  ✓ Eliminado: ${duplicate.id}`)
      }
    }
  }

  console.log("\n✅ Limpieza completada!")
}

main()
  .catch((e) => {
    console.error("Error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
