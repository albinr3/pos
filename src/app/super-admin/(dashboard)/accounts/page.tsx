import { getAccounts } from "./actions"
import { AccountsClient } from "./accounts-client"

export const dynamic = "force-dynamic"

export default async function AccountsPage() {
  const accounts = await getAccounts()
  return <AccountsClient initialAccounts={accounts} />
}
