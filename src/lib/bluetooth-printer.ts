/**
 * Utilidades para conectar e imprimir a impresoras Bluetooth ESC/POS
 * Requiere HTTPS (excepto en localhost)
 */

// BluetoothDevice solo está disponible en el navegador
// Usamos 'any' para evitar errores de tipo durante el build de Next.js
// En runtime, estos tipos estarán disponibles en el navegador
export interface BluetoothPrinter {
  device: any // BluetoothDevice - solo disponible en navegador
  name: string
  id: string
}

/**
 * Verifica si el navegador soporta Web Bluetooth API
 * Nota: Web Bluetooth API está disponible en:
 * - Chrome/Edge en Windows/Mac/Linux
 * - Chrome/Edge en Android
 * - NO está disponible en iOS Safari ni Firefox
 */
export function isBluetoothSupported(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false
  }

  // Verificar si existe la API de Bluetooth
  // Nota: En Chrome Android, navigator.bluetooth puede no estar disponible
  // si no está en un contexto completamente seguro o si es WebView
  const hasBluetooth = "bluetooth" in navigator && typeof (navigator as any).bluetooth !== "undefined"

  if (!hasBluetooth) {
    // Intentar verificar de otra manera
    try {
      const testBluetooth = (navigator as any).bluetooth
      if (!testBluetooth) {
        console.log("[Bluetooth] navigator.bluetooth no está disponible")
        return false
      }
    } catch (e) {
      console.log("[Bluetooth] Error al verificar navigator.bluetooth:", e)
      return false
    }
    return false
  }

  // Detectar el navegador
  const userAgent = navigator.userAgent.toLowerCase()
  const isChrome = userAgent.includes("chrome") && !userAgent.includes("edg")
  const isEdge = userAgent.includes("edg")
  const isFirefox = userAgent.includes("firefox")
  const isSafari = userAgent.includes("safari") && !userAgent.includes("chrome")

  // Verificar si estamos en iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

  // Verificar si estamos en Android
  const isAndroid = /android/i.test(navigator.userAgent)

  // Web Bluetooth solo funciona en Chrome/Edge
  if (!isChrome && !isEdge) {
    console.log("[Bluetooth] Navegador no soportado. Requiere Chrome o Edge.")
    return false
  }

  // En iOS, incluso Chrome usa WebKit y no soporta Web Bluetooth
  if (isIOS) {
    console.log("[Bluetooth] iOS no soporta Web Bluetooth API")
    return false
  }

  // En Android Chrome, la API Bluetooth puede no estar disponible en ciertos contextos
  // Especialmente cuando se accede por IP local con HTTP
  if (isAndroid && isChrome && !hasBluetooth) {
    const hostname = window.location.hostname
    const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
    if (isIP && window.location.protocol === "http:") {
      console.warn(
        "[Bluetooth] Chrome Android no expone Bluetooth API cuando se accede por IP con HTTP.\n" +
        "Solución: Usa 'localhost' en lugar de la IP, o configura HTTPS.\n" +
        "Ejemplo: http://localhost:3000 en lugar de http://10.0.0.3:3000"
      )
    }
  }

  // Verificar si estamos en un entorno seguro (HTTPS o localhost/IPs locales)
  // Web Bluetooth requiere contexto seguro, pero en desarrollo local podemos ser más permisivos
  const hostname = window.location.hostname
  const isLocalhost = 
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("172.17.") ||
    hostname.startsWith("172.18.") ||
    hostname.startsWith("172.19.") ||
    hostname.startsWith("172.20.") ||
    hostname.startsWith("172.21.") ||
    hostname.startsWith("172.22.") ||
    hostname.startsWith("172.23.") ||
    hostname.startsWith("172.24.") ||
    hostname.startsWith("172.25.") ||
    hostname.startsWith("172.26.") ||
    hostname.startsWith("172.27.") ||
    hostname.startsWith("172.28.") ||
    hostname.startsWith("172.29.") ||
    hostname.startsWith("172.30.") ||
    hostname.startsWith("172.31.")

  const isSecureContext = 
    window.isSecureContext || 
    window.location.protocol === "https:" || 
    isLocalhost

  if (!isSecureContext) {
    console.warn("[Bluetooth] Web Bluetooth requiere HTTPS (excepto localhost/IPs locales)")
    // Aún retornamos true para que el usuario vea el botón, pero mostrará error al intentar usar
  }

  // Nota importante: Chrome en Android puede no exponer navigator.bluetooth en WebView
  // o cuando no está en un contexto completamente seguro
  // Verificar si realmente está disponible
  try {
    const bluetooth = (navigator as any).bluetooth
    if (!bluetooth || typeof bluetooth.requestDevice !== "function") {
      console.warn("[Bluetooth] API Bluetooth no está completamente disponible")
      // En algunos casos, la API existe pero no funciona correctamente
    }
  } catch (e) {
    console.warn("[Bluetooth] Error al verificar API Bluetooth:", e)
  }

  return true
}

/**
 * Solicita acceso a una impresora Bluetooth
 * Busca dispositivos con servicios de impresión comunes
 */
export async function requestBluetoothPrinter(): Promise<BluetoothPrinter | null> {
  if (!isBluetoothSupported()) {
    throw new Error("Bluetooth no está disponible en este navegador. Requiere Chrome/Edge en Android o Windows.")
  }

  try {
    // Intentar conectar a una impresora Bluetooth
    // Muchas impresoras ESC/POS usan el servicio genérico de acceso serial (SPP)
    const device = await (navigator as any).bluetooth.requestDevice({
      filters: [
        // Servicio Serial Port Profile (SPP) - común en impresoras Bluetooth
        { services: ["00001101-0000-1000-8000-00805f9b34fb"] },
      ],
      optionalServices: [
        // Servicios adicionales que algunas impresoras pueden usar
        "0000180f-0000-1000-8000-00805f9b34fb", // Battery Service
        "0000180a-0000-1000-8000-00805f9b34fb", // Device Information
      ],
    })

    if (!device.gatt) {
      throw new Error("Dispositivo no tiene GATT disponible")
    }

    return {
      device,
      name: device.name || "Impresora Bluetooth",
      id: device.id,
    }
  } catch (error: any) {
    if (error.name === "NotFoundError") {
      console.log("No se encontró ningún dispositivo Bluetooth")
      return null
    } else if (error.name === "SecurityError") {
      throw new Error("Se requiere HTTPS para usar Bluetooth (excepto en localhost)")
    } else if (error.name === "NetworkError") {
      throw new Error("Error de conexión con el dispositivo Bluetooth")
    }
    console.error("Error al solicitar dispositivo Bluetooth:", error)
    return null
  }
}

/**
 * Conecta a una impresora Bluetooth y obtiene el servicio de impresión
 */
async function connectToPrinter(printer: BluetoothPrinter): Promise<any> { // BluetoothRemoteGATTCharacteristic - solo disponible en navegador
  if (!printer.device.gatt) {
    throw new Error("Dispositivo no tiene GATT disponible")
  }

  const server = await printer.device.gatt.connect()

  // Buscar el servicio Serial Port Profile (SPP)
  // UUID estándar para Serial Port Profile
  const service = await server.getPrimaryService("00001101-0000-1000-8000-00805f9b34fb")

  // Obtener todas las características disponibles
  const characteristics = await service.getCharacteristics()

  // Buscar la característica de escritura (RX - Receive)
  // Muchas impresoras ESC/POS usan diferentes UUIDs, intentar varios
  let characteristic: any | null = null // BluetoothRemoteGATTCharacteristic - solo disponible en navegador

  // Intentar UUIDs comunes para escritura en impresoras ESC/POS
  const writeUUIDs = [
    "00001101-0000-1000-8000-00805f9b34fb", // SPP RX/TX
    "00002a03-0000-1000-8000-00805f9b34fb", // Característica genérica
  ]

  for (const uuid of writeUUIDs) {
    try {
      characteristic = await service.getCharacteristic(uuid)
      break
    } catch {
      // Continuar con el siguiente UUID
    }
  }

  // Si no encontramos por UUID, usar la primera característica que permita escritura
  if (!characteristic) {
    for (const char of characteristics) {
      const properties = char.properties
      if (properties.write || properties.writeWithoutResponse) {
        characteristic = char
        break
      }
    }
  }

  if (!characteristic) {
    throw new Error("No se encontró una característica de escritura en la impresora")
  }

  return characteristic
}

/**
 * Convierte HTML/texto a comandos ESC/POS
 * Extrae el texto del contenido HTML y lo formatea para impresoras térmicas
 */
export function convertToESCPOS(content: string | HTMLElement): Uint8Array {
  // Comandos ESC/POS básicos
  const ESC = 0x1b
  const GS = 0x1d

  // Inicializar impresora
  const commands: number[] = [
    ESC,
    0x40, // ESC @ - Inicializar impresora
  ]

  // Obtener texto del contenido
  let textContent: string

  if (typeof content === "string") {
    textContent = content
  } else {
    // Si es un elemento HTML, extraer el texto y formatearlo
    textContent = extractTextFromElement(content)
  }

  // Convertir el contenido a bytes (UTF-8)
  const encoder = new TextEncoder()
  const contentBytes = encoder.encode(textContent)

  // Agregar comandos de formato básico
  commands.push(...Array.from(contentBytes))

  // Agregar saltos de línea al final
  commands.push(0x0a, 0x0a, 0x0a) // 3 saltos de línea

  // Cortar papel (opcional, descomentar si quieres cortar automáticamente)
  // commands.push(GS, 0x56, 0x00) // GS V 0 - Cortar papel

  return new Uint8Array(commands)
}

/**
 * Extrae y formatea texto de un elemento HTML para impresión térmica
 */
export function extractTextFromElement(element: HTMLElement): string {
  // Clonar el elemento para no modificar el original
  const clone = element.cloneNode(true) as HTMLElement

  // Remover elementos que no deben imprimirse
  const noPrintElements = clone.querySelectorAll(".no-print, [data-no-print]")
  noPrintElements.forEach((el) => el.remove())

  // Obtener el texto
  let text = clone.innerText || clone.textContent || ""

  // Limpiar espacios múltiples y formatear
  text = text
    .replace(/\s+/g, " ") // Reemplazar múltiples espacios con uno solo
    .replace(/\n\s*\n/g, "\n") // Limpiar líneas vacías múltiples
    .trim()

  return text
}

/**
 * Imprime contenido HTML/texto a una impresora Bluetooth ESC/POS
 */
export async function printToBluetoothPrinter(
  printer: BluetoothPrinter,
  content: string | HTMLElement
): Promise<void> {
  try {
    // Conectar a la impresora
    const characteristic = await connectToPrinter(printer)

    // Convertir contenido a comandos ESC/POS
    const escposData = convertToESCPOS(content)

    // Verificar propiedades de la característica
    const properties = characteristic.properties
    const useWriteWithoutResponse = properties.writeWithoutResponse

    // Enviar datos en chunks (algunas impresoras tienen límites de tamaño)
    // Usar chunkSize más pequeño para impresoras Bluetooth
    const chunkSize = 20 // Tamaño de chunk en bytes

    for (let i = 0; i < escposData.length; i += chunkSize) {
      const chunk = escposData.slice(i, i + chunkSize)

      if (useWriteWithoutResponse) {
        await characteristic.writeValueWithoutResponse(chunk)
      } else if (properties.write) {
        await characteristic.writeValue(chunk)
      } else {
        throw new Error("La característica no soporta escritura")
      }

      // Pequeña pausa entre chunks para evitar saturar la impresora
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    console.log("✅ Impresión completada")
  } catch (error) {
    console.error("Error al imprimir a impresora Bluetooth:", error)
    throw error
  }
}

/**
 * Desconecta de una impresora Bluetooth
 */
export async function disconnectPrinter(printer: BluetoothPrinter): Promise<void> {
  if (printer.device.gatt?.connected) {
    printer.device.gatt.disconnect()
  }
}
