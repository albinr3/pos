// Fuente única del número de soporte para evitar desalineaciones entre pantallas.
export const SUPPORT_PHONE_DIGITS = "18499254434"
export const SUPPORT_PHONE_E164 = `+${SUPPORT_PHONE_DIGITS}`
export const SUPPORT_PHONE_DISPLAY = "+1 (849) 925-4434"

export function buildSupportWhatsAppUrl(message: string) {
  return `https://wa.me/${SUPPORT_PHONE_DIGITS}?text=${encodeURIComponent(message)}`
}
