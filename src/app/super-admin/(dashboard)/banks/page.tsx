import { getBankAccounts } from "./actions"
import { BanksClient } from "./banks-client"

export const dynamic = "force-dynamic"

export default async function BanksPage() {
  const banks = await getBankAccounts()
  return <BanksClient initialBanks={banks} />
}
