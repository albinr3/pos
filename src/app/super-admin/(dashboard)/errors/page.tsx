import { getErrorLogs } from "./actions"
import { ErrorsClient } from "./errors-client"

export const dynamic = "force-dynamic"

export default async function ErrorsPage() {
  const { errors, total, stats } = await getErrorLogs()
  
  return <ErrorsClient initialErrors={errors} initialTotal={total} initialStats={stats} />
}
