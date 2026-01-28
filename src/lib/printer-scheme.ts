/**
 * Utilidades para imprimir usando URL Schemes (RawBT, etc.)
 * Permite imprimir desde la web abriendo una app nativa instalada
 */

import { convertToESCPOS } from "./bluetooth-printer"
import html2canvas from "html2canvas"

/**
 * Genera una URL para imprimir texto/HTML usando RawBT (Android)
 * Documentación: https://rawbt.ru/en/api/
 */
export function generateRawbtUrl(content: string | HTMLElement): string {
    // 1. Obtener los bytes ESC/POS usando la utilidad existente
    const bytes = convertToESCPOS(content)

    // 2. Convertir a Base64
    const base64 = bytesToBase64(bytes)

    // 3. Generar URL Scheme
    // rawbt:base64,[cadena_base64]
    return `rawbt:base64,${base64}`
}

/**
 * Genera una URL genérica intent para Android (alternativa a rawbt directa)
 */
export function generateAndroidIntentUrl(content: string | HTMLElement): string {
    const bytes = convertToESCPOS(content)
    const base64 = bytesToBase64(bytes)

    // Intent action=android.intent.action.SEND type=text/plain
    // Esto es más complejo y a veces menos fiable que el esquema directo de rawbt
    // Por ahora mantenemos solo rawbt directo
    return `intent:#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;s.base64=${base64};end;`
}

/**
 * Helper para convertir Uint8Array a Base64 string
 */
function bytesToBase64(bytes: Uint8Array): string {
    let binary = ""
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
    }

    // Usar btoa para convertir a base64
    // Nota: btoa funciona bien en navegador
    if (typeof window !== "undefined") {
        return window.btoa(binary)
    }

    // Fallback para SSR (aunque no debería usarse en server)
    return Buffer.from(binary, "binary").toString("base64")
}

/**
 * Imprime abriendo la app configurada via URL Scheme
 */
export function printViaScheme(content: string | HTMLElement) {
    const url = generateRawbtUrl(content)

    // Abrir la URL
    window.location.href = url
}

/**
 * Método universal para iOS (iPhone/iPad)
 * Convierte el recibo a imagen y usa el menú "Compartir" nativo.
 * Esto permite enviar la imagen a CUALQUIER app de impresora instalada.
 */
export async function shareReceiptAsImage(element: HTMLElement) {
    try {
        // 1. Convertir HTML a Canvas/Imagen
        const canvas = await html2canvas(element, {
            scale: 3, // Alta resolución para que el texto sea legible al imprimir
            useCORS: true,
            backgroundColor: "#ffffff",
            logging: false,
        })

        // 2. Convertir Canvas a Blob
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/png", 1.0)
        )

        if (!blob) throw new Error("No se pudo generar la imagen del recibo")

        // 3. Crear archivo para compartir
        const file = new File([blob], "recibo.png", { type: "image/png" })

        // 4. Usar Web Share API si está disponible
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: "Recibo de Pago",
                text: "Enviar a impresora térmica",
            })
        } else {
            // Fallback: Abrir en nueva pestaña si no se puede compartir
            const url = URL.createObjectURL(blob)
            window.open(url, "_blank")
        }
    } catch (error) {
        console.error("Error al compartir recibo:", error)
        throw error
    }
}
