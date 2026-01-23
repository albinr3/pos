import { getPayments } from "./actions"
import { PaymentsClient } from "./payments-client"

export const dynamic = "force-dynamic"

export default async function PaymentsPage() {
  const payments = await getPayments()
  return <PaymentsClient initialPayments={payments} />
}
