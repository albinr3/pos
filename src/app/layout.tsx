import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ServiceWorkerRegistrar } from "@/components/app/service-worker-registrar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MOVOPos - Sistema de Punto de Venta e Inventario",
    template: "%s | MOVOPos",
  },
  description: "Sistema completo de punto de venta, inventario y gestión empresarial para tu negocio. Gestiona ventas, compras, cuentas por cobrar y más.",
  keywords: ["POS", "punto de venta", "inventario", "gestión empresarial", "República Dominicana"],
  authors: [{ name: "Tejada Auto Adornos" }],
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  manifest: "/manifest.webmanifest",
  themeColor: "#111827",
  openGraph: {
    type: "website",
    locale: "es_DO",
    url: "https://tejadapos.com",
    siteName: "MOVOPos",
    title: "MOVOPos - Sistema de Punto de Venta e Inventario",
    description: "Sistema completo de punto de venta, inventario y gestión empresarial para tu negocio.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MOVOPos - Sistema de Punto de Venta e Inventario",
    description: "Sistema completo de punto de venta, inventario y gestión empresarial para tu negocio.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="es" suppressHydrationWarning>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ServiceWorkerRegistrar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
