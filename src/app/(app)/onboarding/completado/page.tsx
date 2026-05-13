import Link from "next/link"
import { CheckCircle2, PlayCircle, Clock3 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function OnboardingCompletadoPage() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center">
      <Card className="w-full max-w-xl border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30">
        <CardContent className="space-y-6 p-6 text-center sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckCircle2 className="h-9 w-9" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Acabas de dar el primer gran paso de tu negocio.</h1>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Si quieres seguir aprendiendo más sobre cómo usar la plataforma, en tan solo 30 minutos de video podrás aprender todo lo básico, haz click en el botón de videotutoriales.
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
                Ver después
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
