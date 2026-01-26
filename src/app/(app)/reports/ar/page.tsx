import { getARReport, getCustomersForARFilter } from "./actions"
import { ARReportClient } from "./ar-report-client"

export const dynamic = "force-dynamic"

export default async function ARReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  
  const filters = {
    status: typeof params.status === "string" ? params.status : undefined,
    customerId: typeof params.customerId === "string" ? params.customerId : undefined,
    invoiceCode: typeof params.invoiceCode === "string" ? params.invoiceCode : undefined,
    startDate: typeof params.startDate === "string" ? params.startDate : undefined,
    endDate: typeof params.endDate === "string" ? params.endDate : undefined,
    minAmount: typeof params.minAmount === "string" ? parseFloat(params.minAmount) : undefined,
    maxAmount: typeof params.maxAmount === "string" ? parseFloat(params.maxAmount) : undefined,
    overdueOnly: params.overdueOnly === "true",
  }

  const [reportData, customers] = await Promise.all([
    getARReport(filters),
    getCustomersForARFilter(),
  ])

  return (
    <ARReportClient
      initialData={reportData}
      customers={customers}
      initialFilters={filters}
    />
  )
}
