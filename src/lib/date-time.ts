export const SANTO_DOMINGO_TZ = "America/Santo_Domingo"

function toDate(value: Date | string | number) {
  return value instanceof Date ? value : new Date(value)
}

export function formatDateDO(value: Date | string | number, options?: Intl.DateTimeFormatOptions) {
  const date = toDate(value)
  const hasStyleOptions = Boolean(options?.dateStyle || options?.timeStyle)
  const defaultOptions: Intl.DateTimeFormatOptions = hasStyleOptions
    ? {}
    : {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
      }

  return new Intl.DateTimeFormat("es-DO", {
    ...defaultOptions,
    timeZone: SANTO_DOMINGO_TZ,
    ...options,
  }).format(date)
}

export function formatDateTimeDO(value: Date | string | number, options?: Intl.DateTimeFormatOptions) {
  const date = toDate(value)
  const hasStyleOptions = Boolean(options?.dateStyle || options?.timeStyle)
  const defaultOptions: Intl.DateTimeFormatOptions = hasStyleOptions
    ? {}
    : {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }

  return new Intl.DateTimeFormat("es-DO", {
    ...defaultOptions,
    timeZone: SANTO_DOMINGO_TZ,
    ...options,
  }).format(date)
}

export function dateKeyDO(value: Date | string | number = new Date()) {
  const date = toDate(value)
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: SANTO_DOMINGO_TZ,
  }).format(date)
}
