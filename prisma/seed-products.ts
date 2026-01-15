import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Productos de ejemplo para Tejada Auto Adornos
const products = [
  {
    name: "Alfombra de goma para auto",
    sku: "ALF-001",
    reference: "REF-ALF-001",
    priceCents: 2500, // RD$ 25.00
    costCents: 1500, // RD$ 15.00
    stock: 50,
    minStock: 10,
  },
  {
    name: "Cubre volante de cuero",
    sku: "CV-001",
    reference: "REF-CV-001",
    priceCents: 1800, // RD$ 18.00
    costCents: 1000, // RD$ 10.00
    stock: 30,
    minStock: 5,
  },
  {
    name: "Espejo retrovisor con luz LED",
    sku: "ESP-001",
    reference: "REF-ESP-001",
    priceCents: 3500, // RD$ 35.00
    costCents: 2200, // RD$ 22.00
    stock: 25,
    minStock: 5,
  },
  {
    name: "Protector de parachoques delantero",
    sku: "PP-001",
    reference: "REF-PP-001",
    priceCents: 4500, // RD$ 45.00
    costCents: 2800, // RD$ 28.00
    stock: 15,
    minStock: 3,
  },
  {
    name: "Cubre asientos universal",
    sku: "CA-001",
    reference: "REF-CA-001",
    priceCents: 3200, // RD$ 32.00
    costCents: 2000, // RD$ 20.00
    stock: 40,
    minStock: 8,
  },
  {
    name: "Organizador de maletero",
    sku: "ORG-001",
    reference: "REF-ORG-001",
    priceCents: 2800, // RD$ 28.00
    costCents: 1700, // RD$ 17.00
    stock: 20,
    minStock: 5,
  },
  {
    name: "Cargador USB doble puerto",
    sku: "USB-001",
    reference: "REF-USB-001",
    priceCents: 1200, // RD$ 12.00
    costCents: 700, // RD$ 7.00
    stock: 60,
    minStock: 15,
  },
  {
    name: "Porta vasos universal",
    sku: "PV-001",
    reference: "REF-PV-001",
    priceCents: 800, // RD$ 8.00
    costCents: 450, // RD$ 4.50
    stock: 80,
    minStock: 20,
  },
  {
    name: "Cubre volante deportivo",
    sku: "CV-002",
    reference: "REF-CV-002",
    priceCents: 2200, // RD$ 22.00
    costCents: 1300, // RD$ 13.00
    stock: 35,
    minStock: 7,
  },
  {
    name: "Alfombra de goma premium",
    sku: "ALF-002",
    reference: "REF-ALF-002",
    priceCents: 3800, // RD$ 38.00
    costCents: 2400, // RD$ 24.00
    stock: 25,
    minStock: 5,
  },
  {
    name: "Espejo retrovisor ampliado",
    sku: "ESP-002",
    reference: "REF-ESP-002",
    priceCents: 1500, // RD$ 15.00
    costCents: 900, // RD$ 9.00
    stock: 45,
    minStock: 10,
  },
  {
    name: "Cubre asientos de neopreno",
    sku: "CA-002",
    reference: "REF-CA-002",
    priceCents: 4200, // RD$ 42.00
    costCents: 2600, // RD$ 26.00
    stock: 18,
    minStock: 4,
  },
  {
    name: "Protector solar para parabrisas",
    sku: "PS-001",
    reference: "REF-PS-001",
    priceCents: 2000, // RD$ 20.00
    costCents: 1200, // RD$ 12.00
    stock: 30,
    minStock: 6,
  },
  {
    name: "Organizador de guantera",
    sku: "ORG-002",
    reference: "REF-ORG-002",
    priceCents: 1500, // RD$ 15.00
    costCents: 900, // RD$ 9.00
    stock: 50,
    minStock: 12,
  },
  {
    name: "Cargador inalámbrico para auto",
    sku: "USB-002",
    reference: "REF-USB-002",
    priceCents: 3500, // RD$ 35.00
    costCents: 2200, // RD$ 22.00
    stock: 22,
    minStock: 5,
  },
  {
    name: "Porta vasos con iluminación LED",
    sku: "PV-002",
    reference: "REF-PV-002",
    priceCents: 1800, // RD$ 18.00
    costCents: 1100, // RD$ 11.00
    stock: 35,
    minStock: 8,
  },
  {
    name: "Cubre volante de gamuza",
    sku: "CV-003",
    reference: "REF-CV-003",
    priceCents: 2800, // RD$ 28.00
    costCents: 1700, // RD$ 17.00
    stock: 28,
    minStock: 6,
  },
  {
    name: "Alfombra de goma personalizada",
    sku: "ALF-003",
    reference: "REF-ALF-003",
    priceCents: 5200, // RD$ 52.00
    costCents: 3200, // RD$ 32.00
    stock: 12,
    minStock: 3,
  },
  {
    name: "Espejo retrovisor con cámara",
    sku: "ESP-003",
    reference: "REF-ESP-003",
    priceCents: 6500, // RD$ 65.00
    costCents: 4000, // RD$ 40.00
    stock: 10,
    minStock: 2,
  },
  {
    name: "Kit de limpieza para auto",
    sku: "KL-001",
    reference: "REF-KL-001",
    priceCents: 2500, // RD$ 25.00
    costCents: 1500, // RD$ 15.00
    stock: 40,
    minStock: 10,
  },
]

async function main() {
  console.log("🌱 Iniciando inserción de productos...")

  // Verificar si ya existen productos
  const existingProducts = await prisma.product.count()
  if (existingProducts > 0) {
    console.log(`⚠️  Ya existen ${existingProducts} productos en la base de datos.`)
    console.log("¿Deseas continuar de todas formas? (S/N)")
    // En un script automático, continuamos
  }

  // Insertar productos
  for (const product of products) {
    try {
      await prisma.product.create({
        data: product,
      })
      console.log(`✅ Producto creado: ${product.name}`)
    } catch (error: any) {
      // Si el SKU ya existe, intentar sin SKU
      if (error.code === "P2002" && error.meta?.target?.includes("sku")) {
        try {
          const { sku, ...productWithoutSku } = product
          await prisma.product.create({
            data: productWithoutSku,
          })
          console.log(`✅ Producto creado (sin SKU duplicado): ${product.name}`)
        } catch (error2) {
          console.error(`❌ Error al crear producto ${product.name}:`, error2)
        }
      } else {
        console.error(`❌ Error al crear producto ${product.name}:`, error)
      }
    }
  }

  const totalProducts = await prisma.product.count()
  console.log(`\n✨ Proceso completado. Total de productos: ${totalProducts}`)
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










