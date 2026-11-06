import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function DeleteAccountCard() {
  return (
    <Card className="border-destructive/40">
      <CardHeader><CardTitle>Eliminar cuenta</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Elimina definitivamente tu cuenta, todos los usuarios y los datos de tu negocio. Esta acción no se puede deshacer.
        </p>
        <Button variant="destructive" asChild><Link href="/account/delete">Eliminar mi cuenta</Link></Button>
      </CardContent>
    </Card>
  )
}
