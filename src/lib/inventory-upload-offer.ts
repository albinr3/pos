import { buildSupportWhatsAppUrl } from "@/lib/contact-info"

export const INVENTORY_UPLOAD_OFFER = {
  eyebrow: "Carga de inventario sin costo",
  title: "Te subimos el inventario gratis para que empieces a vender hoy.",
  description:
    "¿Tienes tu inventario en Excel, en fotos o en un cuaderno? Envíanoslo y nuestro equipo lo carga gratis en MOVOPos.",
  ctaLabel: "Enviar mi inventario por WhatsApp",
  whatsappMessage:
    "Hola, quiero que me suban gratis mi inventario a MOVOPos. Lo tengo en Excel, fotos o cuaderno.",
} as const

export function buildInventoryUploadWhatsAppUrl() {
  return buildSupportWhatsAppUrl(INVENTORY_UPLOAD_OFFER.whatsappMessage)
}
