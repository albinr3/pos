export type FAQItem = {
  question: string
  answer: string
}

export const faqItems: FAQItem[] = [
  {
    question: "¿Qué es MOVOPos y para quién está diseñado?",
    answer:
      "MOVOPos es un software POS en la nube para negocios en República Dominicana que necesitan controlar ventas, inventario, compras y cuentas por cobrar desde un solo lugar.",
  },
  {
    question: "¿Funciona con moneda local y facturación térmica?",
    answer:
      "Sí. Puedes trabajar en RD$, imprimir en impresoras térmicas y registrar múltiples métodos de pago. La facturación electrónica se encuentra en nuestro roadmap.",
  },
  {
    question: "¿Necesito instalar algo o hardware especial?",
    answer:
      "No. MOVOPos es 100% web: accedes con tu navegador desde laptop, tablet o móvil. Solo conecta tu impresora térmica y comienza a facturar.",
  },
  {
    question: "¿Puedo probar gratis y cuánto cuesta?",
    answer:
      "Tienes 15 días de prueba gratis. Luego pagas RD$1,300 al mes con todas las funcionalidades incluidas y sin comisiones por transacción.",
  },
  {
    question: "¿Puedo usarlo con varios usuarios y roles?",
    answer:
      "Sí. Agrega múltiples usuarios con permisos por rol (cajero, administrador, inventario) para mantener el control de tu operación.",
  },
  {
    question: "¿Necesito internet todo el tiempo?",
    answer:
      "Requiere conexión a internet para sincronizar ventas e inventario en tiempo real y que siempre tengas datos actualizados.",
  },
  {
    question: "¿Cómo protegen mis datos?",
    answer:
      "Utilizamos infraestructura en la nube con cifrado y respaldos automáticos. Solo accedes con credenciales seguras y control de permisos.",
  },
  {
    question: "¿Tienen soporte para negocios en República Dominicana?",
    answer:
      "Sí. Ofrecemos soporte por email y acompañamiento para puesta en marcha con foco en necesidades de negocios dominicanos.",
  },
]
