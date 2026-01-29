import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de Privacidad | MOVOPos",
  description: "Política de privacidad de MOVOPos",
  alternates: {
    canonical: "/privacy",
  },
}

export default function PrivacyPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="container max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight mb-8">Política de Privacidad</h1>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Información que Recopilamos</h2>
            <p className="text-muted-foreground">
              Recopilamos información que nos proporcionas directamente cuando utilizas nuestro servicio,
              incluyendo datos de tu empresa, productos, ventas, y otra información necesaria para el
              funcionamiento del sistema.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">2. Uso de la Información</h2>
            <p className="text-muted-foreground">
              Utilizamos la información recopilada para proporcionar, mantener y mejorar nuestros servicios,
              procesar transacciones, y comunicarnos contigo sobre el servicio.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">3. Protección de Datos</h2>
            <p className="text-muted-foreground">
              Implementamos medidas de seguridad técnicas y organizativas apropiadas para proteger tu
              información contra acceso no autorizado, alteración, divulgación o destrucción.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">4. Compartir Información</h2>
            <p className="text-muted-foreground">
              No vendemos, alquilamos ni compartimos tu información personal con terceros, excepto cuando
              sea necesario para proporcionar el servicio o cuando la ley lo requiera.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">5. Tus Derechos</h2>
            <p className="text-muted-foreground">
              Tienes derecho a acceder, corregir, eliminar o portar tus datos personales. Puedes ejercer estos
              derechos contactándonos directamente.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">6. Cambios a esta Política</h2>
            <p className="text-muted-foreground">
              Podemos actualizar esta política de privacidad ocasionalmente. Te notificaremos sobre cambios
              significativos publicando la nueva política en esta página.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">7. Contacto</h2>
            <p className="text-muted-foreground">
              Si tienes preguntas sobre esta política de privacidad, puedes contactarnos a través de nuestros
              canales de soporte.
            </p>
          </section>

          <p className="text-sm text-muted-foreground mt-12">
            Última actualización: {new Date().toLocaleDateString("es-DO", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>
    </div>
  )
}


