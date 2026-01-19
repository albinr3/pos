import Image from "next/image"

export const metadata = {
  title: "Sobre Nosotros | MOVOPos",
  description: "Conoce más sobre MOVOPos y nuestro equipo",
}

export default function AboutPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="container max-w-4xl">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Sobre Nosotros
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Conoce la historia detrás de MOVOPos y nuestra misión de ayudar a los negocios a crecer.
          </p>
        </div>

        <div className="space-y-16">
          <section>
            <div className="mb-8 rounded-lg overflow-hidden">
              <Image
                src="/person-working-html-computer.jpg"
                alt="Equipo de MOVOPos trabajando"
                width={1200}
                height={600}
                className="w-full h-auto object-cover"
                priority
              />
            </div>
            <h2 className="text-2xl font-semibold mb-4">Nuestra Historia</h2>
            <p className="text-muted-foreground mb-4">
              MOVOPos nació de la necesidad de crear una solución de punto de venta e inventario
              diseñada específicamente para el mercado dominicano. Comenzamos como un proyecto interno
              para Tejada Auto Adornos, y rápidamente nos dimos cuenta de que otras empresas podrían
              beneficiarse de esta herramienta.
            </p>
            <p className="text-muted-foreground">
              Hoy, ayudamos a cientos de negocios a gestionar sus ventas, inventario y finanzas de manera
              más eficiente, permitiéndoles enfocarse en lo que realmente importa: hacer crecer su negocio.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Nuestra Misión</h2>
            <p className="text-muted-foreground mb-4">
              Nuestra misión es proporcionar herramientas de gestión empresarial accesibles, intuitivas y
              poderosas que permitan a los negocios dominicanos competir y prosperar en el mercado actual.
            </p>
            <p className="text-muted-foreground">
              Creemos que cada negocio, sin importar su tamaño, merece acceso a tecnología de calidad que
              les ayude a tomar mejores decisiones y optimizar sus operaciones.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Nuestros Valores</h2>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary font-semibold">•</span>
                <span><strong>Simplicidad:</strong> Creemos en interfaces intuitivas que cualquier persona pueda usar.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-semibold">•</span>
                <span><strong>Confiabilidad:</strong> Tu negocio depende de nosotros, y nos tomamos esa responsabilidad en serio.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-semibold">•</span>
                <span><strong>Innovación:</strong> Constantemente mejoramos y agregamos nuevas funcionalidades basadas en el feedback de nuestros usuarios.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-semibold">•</span>
                <span><strong>Soporte:</strong> Estamos aquí para ayudarte cuando lo necesites.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Contáctanos</h2>
            <p className="text-muted-foreground mb-4">
              ¿Tienes preguntas, sugerencias o necesitas ayuda? Estamos aquí para ti.
            </p>
            <div className="space-y-2 text-muted-foreground">
              <p><strong>Email:</strong> soporte@tejadapos.com</p>
              <p><strong>Teléfono:</strong> 829-475-1454</p>
              <p><strong>Dirección:</strong> Carretera la Rosa, Moca, República Dominicana</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}


