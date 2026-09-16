import Link from "next/link"
import { CheckCircle2, PlayCircle, Clock3 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { InventoryUploadOffer } from "@/components/inventory-upload-offer"

export const dynamic = "force-dynamic"

export default async function OnboardingCompletadoPage() {
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-4xl items-center py-6 sm:py-10">
      <div className="w-full space-y-6">
        <Card className="mx-auto w-full max-w-2xl border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30">
          <CardContent className="space-y-5 p-6 text-center sm:p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Tu primer producto ya está listo para vender.</h1>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Ya practicaste una venta y preparaste un producto propio. Cuando estés listo, entra a Vender para registrar tu primera venta real.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Este aviso necesita todo el ancho: dentro de la tarjeta estrecha comprimía el texto y el botón. */}
        <InventoryUploadOffer />

        <Card className="mx-auto w-full max-w-2xl">
          <CardContent className="space-y-5 p-6 text-center sm:p-8">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">Sigue aprendiendo a usar MOVO Pos</h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Mira los videotutoriales cuando quieras o vuelve al dashboard para continuar con tu negocio.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild size="lg" className="h-12">
                <Link href="/como-usar-la-plataforma">
                  <PlayCircle className="mr-2 h-5 w-5" />
                  Videotutoriales
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12">
                <Link href="/dashboard">
                  <Clock3 className="mr-2 h-5 w-5" />
                  Ir al dashboard
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
