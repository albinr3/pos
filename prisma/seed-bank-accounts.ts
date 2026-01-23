/**
 * Script para poblar las cuentas bancarias
 * 
 * Ejecutar con: npx tsx prisma/seed-bank-accounts.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const bankAccounts = [
  {
    bankName: "Banco Popular Dominicano",
    accountType: "Cuenta de Ahorros",
    accountNumber: "123-456789-0",
    accountName: "TU EMPRESA SRL",
    currency: "DOP",
    bankLogo: null, // Puedes agregar URL del logo
    instructions: "Usar tu email como referencia de la transferencia",
    isActive: true,
    displayOrder: 1,
  },
  {
    bankName: "BHD León",
    accountType: "Cuenta Corriente",
    accountNumber: "987-654321-0",
    accountName: "TU EMPRESA SRL",
    currency: "DOP",
    bankLogo: null,
    instructions: "Usar tu email como referencia de la transferencia",
    isActive: true,
    displayOrder: 2,
  },
  {
    bankName: "Banreservas",
    accountType: "Cuenta de Ahorros",
    accountNumber: "111-222333-4",
    accountName: "TU EMPRESA SRL",
    currency: "DOP",
    bankLogo: null,
    instructions: "Usar tu email como referencia de la transferencia",
    isActive: true,
    displayOrder: 3,
  },
]

async function main() {
  console.log("🏦 Creando cuentas bancarias...")

  for (const account of bankAccounts) {
    const existing = await prisma.bankAccount.findFirst({
      where: {
        bankName: account.bankName,
        accountNumber: account.accountNumber,
      },
    })

    if (existing) {
      console.log(`  ⏭️  ${account.bankName} ya existe, actualizando...`)
      await prisma.bankAccount.update({
        where: { id: existing.id },
        data: account,
      })
    } else {
      console.log(`  ✅ Creando ${account.bankName}...`)
      await prisma.bankAccount.create({
        data: account,
      })
    }
  }

  console.log("\n✅ Cuentas bancarias creadas/actualizadas exitosamente!")
  
  const all = await prisma.bankAccount.findMany({
    orderBy: { displayOrder: "asc" },
  })
  
  console.log("\n📋 Cuentas bancarias actuales:")
  for (const acc of all) {
    console.log(`  - ${acc.bankName} (${acc.accountType}): ${acc.accountNumber} [${acc.isActive ? "Activa" : "Inactiva"}]`)
  }
}

main()
  .catch((e) => {
    console.error("Error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
