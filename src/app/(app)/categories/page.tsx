import { CategoriesClient } from "./categories-client"

export default function CategoriesPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="text-sm text-muted-foreground">Gestiona las categorías de tus productos.</p>
      </div>
      <CategoriesClient />
    </div>
  )
}

