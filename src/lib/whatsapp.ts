/**
 * Utilidades para WhatsApp Cloud API
 * Requiere variables de entorno:
 * - WHATSAPP_PHONE_NUMBER_ID: ID del número de teléfono en Meta
 * - WHATSAPP_ACCESS_TOKEN: Token de acceso de Meta
 */

/**
 * Normaliza un número de teléfono al formato E.164
 * Ejemplos:
 * - "8091234567" -> "+18091234567"
 * - "829-123-4567" -> "+18291234567"
 * - "+1 829 123 4567" -> "+18291234567"
 */
export function normalizePhoneNumber(phone: string): string | null {
  // Remover todos los caracteres no numéricos excepto +
  let cleaned = phone.replace(/[^\d+]/g, "")

  // Si no empieza con +, asumir que es un número dominicano
  if (!cleaned.startsWith("+")) {
    // Si empieza con 1, asumir que ya tiene el código de país
    if (cleaned.startsWith("1") && cleaned.length === 11) {
      cleaned = "+" + cleaned
    } else if (cleaned.length === 10) {
      // Número dominicano sin código de país (809, 829, 849)
      cleaned = "+1" + cleaned
    } else {
      return null
    }
  }

  // Validar formato E.164 básico
  if (!/^\+1\d{10}$/.test(cleaned)) {
    return null
  }

  return cleaned
}

/**
 * Envía un mensaje de texto por WhatsApp Cloud API
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  console.log("=== sendWhatsAppMessage called ===")
  console.log("To:", to)
  console.log("Message length:", message.length)
  
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  console.log("Phone Number ID:", phoneNumberId ? "Exists" : "MISSING")
  console.log("Access Token:", accessToken ? `Exists (${accessToken.length} chars)` : "MISSING")

  if (!phoneNumberId || !accessToken) {
    console.error("WhatsApp credentials not configured")
    return { success: false, error: "WhatsApp no configurado" }
  }

  try {
    // Remover el + del número para compatibilidad con WhatsApp API
    const phoneWithoutPlus = to.replace(/^\+/, "")
    
    const requestBody = {
      messaging_product: "whatsapp",
      to: phoneWithoutPlus, // Enviar sin el +
      type: "text",
      text: { body: message },
    }
    
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      }
    )

    const data = await response.json()

    // Logging detallado para debugging
    console.log("WhatsApp API Response Status:", response.status)
    console.log("WhatsApp API Response:", JSON.stringify(data, null, 2))
    console.log("Sent to:", phoneWithoutPlus)
    console.log("Message:", message)

    if (!response.ok) {
      console.error("WhatsApp API error:", data)
      return {
        success: false,
        error: data.error?.message || "Error al enviar mensaje",
      }
    }

    // Advertencia: Si la respuesta es 200 pero no llega el mensaje,
    // probablemente es porque los números de prueba solo aceptan templates
    if (response.ok && data.messages && data.messages[0]?.id) {
      console.log("⚠️ ADVERTENCIA: Mensaje aceptado por Meta (status 200 + message ID)")
      console.log("⚠️ Si no llega el mensaje, probablemente necesitas usar TEMPLATES en lugar de texto libre")
      console.log("⚠️ Los números de prueba solo permiten templates aprobados por Meta")
    }

    return { success: true }
  } catch (error) {
    console.error("Error sending WhatsApp message:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    }
  }
}

/**
 * Genera un código OTP de 6 dígitos
 */
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
