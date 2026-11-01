export type ShiftReportMovement = {
  id: string; sourceType: string; sourceId: string; reference: string; method: string | null
  amountCents: number; recordedAt: string; note: string | null; treasuryAccount: { name: string }; customerName?: string | null
}
export type ShiftReportDocument = { sourceType: string; id: string; reference: string; amountCents: number; cancelled: boolean; recordedAt: string; customerName?: string | null }
export type ShiftReportSnapshot = {
  accountId: string; userId: string; shiftId: string; cashierName: string; openedAt: string; generatedAt: string
  companyName: string; format: "CARTA" | "80mm"; openingCents: number; expectedCashCents: number
  lastSequence: number; finalSequence: number | null; status: string
  confirmedOperationIds: string[]; movements: ShiftReportMovement[]; documents: ShiftReportDocument[]
}
