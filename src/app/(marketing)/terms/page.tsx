export const metadata = {
  title: "Términos y Condiciones | Tejada POS",
  description: "Términos y condiciones de uso de Tejada POS",
}

export default function TermsPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="container max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight mb-8">Términos y Condiciones</h1>
        
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Aceptación de los Términos</h2>
            <p className="text-muted-foreground">
              Al acceder y utilizar Tejada POS, aceptas estar sujeto a estos términos y condiciones de uso.
              Si no estás de acuerdo con alguna parte de estos términos, no debes utilizar el servicio.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">2. Uso del Servicio</h2>
            <p className="text-muted-foreground">
              Tejada POS es un sistema de punto de venta e inventario. Te otorgamos una licencia limitada,
              no exclusiva y no transferible para usar el servicio de acuerdo con estos términos.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">3. Cuentas de Usuario</h2>
            <p className="text-muted-foreground">
              Eres responsable de mantener la confidencialidad de tu cuenta y contraseña. Eres responsable
              de todas las actividades que ocurran bajo tu cuenta.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">4. Pago y Facturación</h2>
            <p className="text-muted-foreground">
              Los planes de suscripción se facturan por adelantado. Los pagos son no reembolsables, excepto
              según lo establecido en nuestra política de garantía de satisfacción.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">5. Propiedad Intelectual</h2>
            <p className="text-muted-foreground">
              Todo el contenido, características y funcionalidades del servicio son propiedad de Tejada Auto
              Adornos y están protegidos por leyes de propiedad intelectual.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">6. Limitación de Responsabilidad</h2>
            <p className="text-muted-foreground">
              En la máxima medida permitida por la ley, Tejada POS no será responsable de daños indirectos,
              incidentales o consecuentes derivados del uso o la imposibilidad de usar el servicio.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">7. Modificaciones del Servicio</h2>
            <p className="text-muted-foreground">
              Nos reservamos el derecho de modificar o discontinuar el servicio en cualquier momento, con o
              sin previo aviso.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">8. Terminación</h2>
            <p className="text-muted-foreground">
              Podemos terminar o suspender tu acceso al servicio inmediatamente, sin previo aviso, por
              cualquier motivo, incluyendo el incumplimiento de estos términos.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">9. Ley Aplicable</h2>
            <p className="text-muted-foreground">
              Estos términos se regirán e interpretarán de acuerdo con las leyes de la República Dominicana.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">10. Contacto</h2>
            <p className="text-muted-foreground">
              Si tienes preguntas sobre estos términos, puedes contactarnos a través de nuestros canales
              de soporte.
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


