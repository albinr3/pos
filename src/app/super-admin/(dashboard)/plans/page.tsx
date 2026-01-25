import { getBillingPlans } from "./actions"
import { PlansClient } from "./plans-client"

export const dynamic = "force-dynamic"

export default async function PlansPage() {
  const plans = await getBillingPlans()
  
  return <PlansClient initialPlans={plans} />
}
