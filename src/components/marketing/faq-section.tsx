"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
  {
    question: "¿Qué es MOVOPos?",
    answer: "MOVOPos es un sistema de punto de venta (POS) y control de inventario diseñado especialmente para pequeñas y medianas empresas. Incluye funcionalidades de facturación, control de inventario en tiempo real, gestión de clientes, reportes avanzados, cuentas por cobrar y mucho más.",
  },
  {
    question: "¿MOVOPos tiene facturación electrónica?",
    answer: "Actualmente MOVOPos cuenta con facturación térmica. La facturación electrónica se integrará en el futuro cercano como parte de nuestras mejoras continuas. Mientras tanto, puedes generar facturas impresas y mantener un registro completo de todas tus ventas.",
  },
  {
    question: "¿Necesito instalar algo en mi computadora?",
    answer: "No, MOVOPos es un sistema 100% en la nube. Solo necesitas un navegador web moderno (Chrome, Firefox, Safari o Edge) y conexión a internet. Puedes acceder desde cualquier dispositivo, en cualquier momento y lugar.",
  },
  {
    question: "¿Mis datos están seguros?",
    answer: "Sí, tus datos están completamente seguros. Utilizamos infraestructura en la nube con encriptación de datos y respaldos automáticos regulares. Tu información es privada y solo accesible mediante usuario y contraseña.",
  },
  {
    question: "¿MOVOPos cobra comisión por ventas?",
    answer: "No, MOVOPos NO cobra comisiones por ventas. Ofrecemos planes con tarifas mensuales fijas y transparentes. Puedes realizar todas las ventas que necesites sin pagar comisiones adicionales.",
  },
  {
    question: "¿Puedo usar MOVOPos sin conexión a internet?",
    answer: "MOVOPos requiere conexión a internet para funcionar, ya que es un sistema basado en la nube. Esto te permite acceder a tus datos desde cualquier lugar y garantiza que siempre tengas la información más actualizada.",
  },
  {
    question: "¿Cuántos usuarios puedo agregar?",
    answer: "Depende de tu plan. El plan Básico permite un usuario, mientras que el plan Pro permite múltiples usuarios. Todos los usuarios pueden tener diferentes permisos según sus roles en tu negocio.",
  },
  {
    question: "¿Puedo cambiar de plan más adelante?",
    answer: "Sí, puedes cambiar de plan en cualquier momento. Puedes actualizar a un plan superior cuando tu negocio crezca, o reducir tu plan si tus necesidades cambian. No hay contratos de largo plazo ni penalizaciones.",
  },
  {
    question: "¿Qué métodos de pago acepta MOVOPos?",
    answer: "MOVOPos registra todas las formas de pago que manejes en tu negocio: efectivo, tarjeta, transferencia, etc. Puedes configurar múltiples métodos de pago y generar reportes separados por cada uno.",
  },
]

export function FAQSection() {
  return (
    <section className="py-12 sm:py-16 bg-gray-50">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center mb-8">
          <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Preguntas frecuentes
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            Encuentra respuestas a las preguntas más comunes sobre MOVOPos
          </p>
        </div>

        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
            {/* Columna izquierda */}
            <div>
              <Accordion type="single" collapsible className="w-full">
                {faqs.slice(0, Math.ceil(faqs.length / 2)).map((faq, index) => (
                  <AccordionItem key={index} value={`item-left-${index}`}>
                    <AccordionTrigger className="text-left text-base font-semibold">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-base text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            {/* Columna derecha */}
            <div>
              <Accordion type="single" collapsible className="w-full">
                {faqs.slice(Math.ceil(faqs.length / 2)).map((faq, index) => (
                  <AccordionItem key={index} value={`item-right-${index}`}>
                    <AccordionTrigger className="text-left text-base font-semibold">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-base text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
