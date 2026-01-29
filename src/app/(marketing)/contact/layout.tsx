import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contáctanos | MOVOPos",
  description: "¿Tienes preguntas, sugerencias o necesitas ayuda? Estamos aquí para ti. Envíanos un mensaje y te responderemos lo antes posible.",
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
