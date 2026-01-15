import { ReturnsListClient } from "./returns-list-client"

export default function ReturnsListPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Devoluciones</h1>
        <p className="text-sm text-muted-foreground">Consulta y gestiona las devoluciones registradas.</p>
      </div>
      <ReturnsListClient />
    </div>
  )
}









