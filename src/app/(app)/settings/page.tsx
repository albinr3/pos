import { SettingsClient } from "./settings-client"

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted-foreground">Configuraciones del sistema.</p>
      </div>
      <SettingsClient />
    </div>
  )
}
