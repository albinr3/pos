import { TreasuryClient } from "./treasury-client"

export const dynamic = "force-dynamic"

export default function TreasuryPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tesorería</h1>
        <p className="text-sm text-muted-foreground">
          Control de saldos esperados por cuenta, transferencias internas y trazabilidad de movimientos.
        </p>
      </div>
      <TreasuryClient />
    </div>
  )
}
