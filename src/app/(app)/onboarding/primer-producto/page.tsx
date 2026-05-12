import Link from "next/link"

import { Button } from "@/components/ui/button"
import { getProductExpressDefaults } from "../actions"
import { ProductExpressClient } from "./product-express-client"

export const dynamic = "force-dynamic"

export default async function PrimerProductoPage() {
  const defaults = await getProductExpressDefaults()

  return (
    <div className="grid gap-6">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Primer producto</h1>
          <p className="text-sm text-muted-foreground">Un formulario corto para empezar a vender.</p>
        </div>
        <Button asChild variant="ghost" className="shrink-0">
          <Link href="/dashboard">Salir</Link>
        </Button>
      </div>

      <ProductExpressClient itbisRateBp={defaults.itbisRateBp} />
    </div>
  )
}
