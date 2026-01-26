import { getReceiptsReport, getCustomersForFilter } from "./actions"
import { ReceiptsReportClient } from "./receipts-report-client"

export const dynamic = "force-dynamic"

export default async function ReceiptsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  
  const filters = {
    startDate: typeof params.startDate === "string" ? params.startDate : undefined,
    endDate: typeof params.endDate === "string" ? params.endDate : undefined,
    customerId: typeof params.customerId === "string" ? params.customerId : undefined,
    receiptCode: typeof params.receiptCode === "string" ? params.receiptCode : undefined,
    method: typeof params.method === "string" ? params.method : undefined,
    minAmount: typeof params.minAmount === "string" ? parseFloat(params.minAmount) : undefined,
    maxAmount: typeof params.maxAmount === "string" ? parseFloat(params.maxAmount) : undefined,
    includeCancelled: params.includeCancelled === "true",
  }

  const [reportData, customers] = await Promise.all([
    getReceiptsReport(filters),
    getCustomersForFilter(),
  ])

  return (
    <ReceiptsReportClient
      initialData={reportData}
      customers={customers}
      initialFilters={filters}
    />
  )
}
