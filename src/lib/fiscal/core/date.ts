const dominicanDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" })

export function fiscalDominicanDay(value: Date): string {
  return dominicanDay.format(value)
}

export function fiscalDateIsFuture(value: Date, serverNow = new Date()): boolean {
  // El reloj del dispositivo no puede autorizar una fecha fiscal futura.
  return fiscalDominicanDay(value) > fiscalDominicanDay(serverNow)
}

export function addFiscalDays(value: Date, days: number): Date {
  const result = new Date(value)
  // Añadir días en UTC evita que la zona o los cambios de hora del servidor alteren el vencimiento.
  result.setUTCDate(result.getUTCDate() + days)
  return result
}
