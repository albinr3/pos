import { PaymentMethod } from "@prisma/client"

export function getPaymentMethodLabel(method: PaymentMethod | string) {
  switch (method) {
    case PaymentMethod.EFECTIVO:
    case "EFECTIVO":
      return "Efectivo"
    case PaymentMethod.TRANSFERENCIA:
    case "TRANSFERENCIA":
      return "Transferencia"
    case PaymentMethod.TARJETA:
    case "TARJETA":
      return "Tarjeta"
    case PaymentMethod.DIVIDIR_PAGO:
    case "DIVIDIR_PAGO":
      return "Dividir pago"
    default:
      return "Otro"
  }
}

export function formatPaymentWithBank(
  method: PaymentMethod | string,
  transferBankName?: string | null,
) {
  const label = getPaymentMethodLabel(method)
  if ((method === PaymentMethod.TRANSFERENCIA || method === "TRANSFERENCIA") && transferBankName) {
    return `${label} - ${transferBankName}`
  }
  return label
}
