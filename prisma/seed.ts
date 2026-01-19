import { PrismaClient, UserRole } from "@prisma/client"
import { createHash } from "crypto"

const prisma = new PrismaClient()

function hashPassword(password: string) {
  // Simple sha256 for demo/local. In production, replace with bcrypt/argon2.
  return createHash("sha256").update(password).digest("hex")
}

async function main() {
  // Company settings (single company)
  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: {
      name: "Tejada Auto Adornos",
      phone: "829-475-1454",
      address: "Carretera la Rosa, Moca",
      logoUrl: null,
      allowNegativeStock: false,
      itbisRateBp: 1800,
    },
    create: {
      id: "company",
      name: "Tejada Auto Adornos",
      phone: "829-475-1454",
      address: "Carretera la Rosa, Moca",
      logoUrl: null,
      allowNegativeStock: false,
      itbisRateBp: 1800,
    },
  })

  // Invoice sequence A
  await prisma.invoiceSequence.upsert({
    where: { series: "A" },
    update: {},
    create: { series: "A", lastNumber: 0 },
  })

  // Return sequence
  await prisma.returnSequence.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main", lastNumber: 0 },
  })

  // Generic customer - ensure correct UTF-8 encoding
  await prisma.customer.upsert({
    where: { id: "generic" },
    update: { 
      name: "Cliente Genérico".normalize("NFC"), 
      isGeneric: true, 
      isActive: true 
    },
    create: { 
      id: "generic", 
      name: "Cliente Genérico".normalize("NFC"), 
      isGeneric: true, 
      isActive: true 
    },
  })

  // Admin user (username: admin, password: admin)
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "Administrador",
      username: "admin",
      passwordHash: hashPassword("admin"),
      role: UserRole.ADMIN,
      canOverridePrice: true,
      isActive: true,
    },
  })
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
