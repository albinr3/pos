export const DOMINICAN_BANKS = [
  "Banreservas",
  "Banco Popular Dominicano",
  "Banco BHD",
  "Banco Santa Cruz",
  "Promerica",
  "Scotiabank",
  "Banco Caribe",
  "Banco Ademi",
  "Banco Vimenca",
  "Asociacion Popular de Ahorros y Prestamos",
  "Asociacion Cibao de Ahorros y Prestamos",
  "Asociacion La Nacional de Ahorros y Prestamos",
] as const

export type DominicanBankName = (typeof DOMINICAN_BANKS)[number]

export function isDominicanBankName(value: string | null | undefined): value is DominicanBankName {
  if (!value) return false
  return DOMINICAN_BANKS.includes(value as DominicanBankName)
}
