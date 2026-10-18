import { FreightReportClient } from "./freight-report-client"
import { getFreightCustomers, getFreightReport } from "./actions"

export const dynamic = "force-dynamic"

export default async function FreightReportPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const [report, customers] = await Promise.all([
    getFreightReport({
      from: params.from, to: params.to, customerId: params.customerId,
      type: params.type, invoiceCode: params.invoiceCode,
    }, params.page),
    getFreightCustomers(),
  ])
  return <FreightReportClient key={JSON.stringify(params)} report={report} customers={customers} />
}
