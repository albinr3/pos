import { TreasuryClient } from "./treasury-client"

export const dynamic = "force-dynamic"

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<{ newAccount?: string | string[] }>
}) {
  // Leer el parámetro en el servidor mantiene el estado inicial del modal durante la hidratación.
  const openNewAccount = (await searchParams).newAccount === "1"
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tesorería</h1>
        <p className="text-sm text-muted-foreground">
          Control de saldos esperados por cuenta, transferencias internas y trazabilidad de movimientos.
        </p>
      </div>
      <TreasuryClient openNewAccount={openNewAccount} />
    </div>
  )
}
