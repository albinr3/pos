export type ExpoPushMessage = {
  to: string
  title: string
  body: string
  sound?: "default" | null
  channelId?: string
  data?: Record<string, unknown>
}

export type ExpoPushTicket = {
  status: "ok" | "error"
  id?: string
  message?: string
  details?: {
    error?: string
  }
}

export type ExpoPushSendResult = {
  token: string
  ticket: ExpoPushTicket
}

const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send"
const EXPO_PUSH_CHUNK_SIZE = 100

function chunkMessages(messages: ExpoPushMessage[]): ExpoPushMessage[][] {
  const chunks: ExpoPushMessage[][] = []
  for (let index = 0; index < messages.length; index += EXPO_PUSH_CHUNK_SIZE) {
    chunks.push(messages.slice(index, index + EXPO_PUSH_CHUNK_SIZE))
  }
  return chunks
}

export async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushSendResult[]> {
  const results: ExpoPushSendResult[] = []

  for (const chunk of chunkMessages(messages)) {
    const response = await fetch(EXPO_PUSH_SEND_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(`Expo Push HTTP ${response.status}: ${JSON.stringify(payload)}`)
    }

    const tickets = Array.isArray(payload?.data) ? payload.data : []
    chunk.forEach((message, index) => {
      results.push({
        token: message.to,
        ticket: tickets[index] || {
          status: "error",
          message: "Expo no devolvió ticket para este mensaje",
        },
      })
    })
  }

  return results
}

export function isDeviceNotRegistered(ticket: ExpoPushTicket): boolean {
  return ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered"
}
