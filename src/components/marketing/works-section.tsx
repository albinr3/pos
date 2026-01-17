import { ImagePlaceholder } from "@/components/marketing/image-placeholder"

const works = [
  {
    title: "Contador",
    description: "Sistema de gestión financiera",
    image: "/marketing/works/contador.jpg",
  },
  {
    title: "Retail",
    description: "Punto de venta para tiendas",
    image: "/marketing/works/retail.jpg",
  },
  {
    title: "Distribuidora",
    description: "Control de inventario avanzado",
    image: "/marketing/works/distribuidora.jpg",
  },
]

export function WorksSection() {
  return (
    <section 
      className="py-24 sm:py-32"
      style={{
        background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
      }}
    >
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Nuestros Trabajos
          </h2>
          <p className="mt-6 text-xl text-white/90">
            Ejemplos de negocios que ya están usando Tejada POS
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((work, index) => (
            <div
              key={index}
              className="flex flex-col rounded-lg overflow-hidden bg-white shadow-lg"
            >
              <ImagePlaceholder
                width={400}
                height={250}
                alt={work.title}
                className="w-full h-48 object-cover"
              />
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {work.title}
                </h3>
                <p className="text-base text-gray-600">{work.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

