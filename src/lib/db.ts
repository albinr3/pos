import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Función para crear Prisma Client de forma lazy
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
}

// Getter que solo inicializa Prisma cuando se accede
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }
  return globalForPrisma.prisma
}

// Exportar un proxy que solo accede a Prisma cuando se usa
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient()
    const value = client[prop as keyof PrismaClient]
    // Si es una función, mantener el contexto correcto
    if (typeof value === "function") {
      return value.bind(client)
    }
    return value
  },
})
