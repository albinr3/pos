import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contacto | Sistema de facturación MOVOPos",
  description:
    "Habla con el equipo de MOVOPos y conoce cómo implementar nuestro sistema de facturación, POS e inventario en República Dominicana.",
  alternates: {
    canonical: "/contact",
  },
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
