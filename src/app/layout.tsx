import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
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

export const viewport = {
  themeColor: "#111827",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const baseLocalization = esES as any
  const clerkLocalization = {
    ...baseLocalization,
    signIn: {
      ...(baseLocalization.signIn ?? {}),
      start: {
        ...((baseLocalization.signIn && baseLocalization.signIn.start) ?? {}),
        title: "Iniciar sesión en MOVO",
        subtitle: "¡Bienvenido de nuevo! Inicia sesión para continuar",
        actionLink: "Regístrate gratis",
      },
    },
    zxcvbn: {
      ...(baseLocalization.zxcvbn ?? {}),
      couldBeStronger: "Tu contraseña funciona, pero podría ser más fuerte. Intenta agregar más caracteres.",
      goodPassword: "Tu contraseña cumple con todos los requisitos necesarios.",
      notEnough: "Tu contraseña no es lo suficientemente fuerte.",
      suggestions: {
        ...(baseLocalization.zxcvbn?.suggestions ?? {}),
        allUppercase: "Usa mayúsculas en algunas letras, pero no en todas.",
        anotherWord: "Agrega otra palabra que sea menos común.",
        associatedYears: "Evita años asociados contigo.",
        capitalization: "Usa una mezcla de mayúsculas y minúsculas.",
        dates: "Evita fechas o años fáciles de adivinar.",
        l33t: "Evita sustituciones obvias como @ por a.",
        longerKeyboardPattern: "Evita patrones largos del teclado.",
        noNeed: "No necesitas símbolos, números o mayúsculas si es una frase larga.",
        pwned: "Esta contraseña ha aparecido en una filtración.",
        recentYears: "Evita años recientes.",
        repeated: "Evita repeticiones.",
        reverseWords: "Evita palabras al revés.",
        sequences: "Evita secuencias de caracteres.",
        useWords: "Usa varias palabras que no estén relacionadas.",
      },
      warnings: {
        ...(baseLocalization.zxcvbn?.warnings ?? {}),
        common: "Esta contraseña es muy común.",
        commonNames: "Los nombres y apellidos comunes son fáciles de adivinar.",
        dates: "Las fechas son fáciles de adivinar.",
        extendedRepeat: "Repeticiones como \"abcabcabc\" son fáciles de adivinar.",
        keyPattern: "Los patrones de teclado cortos son fáciles de adivinar.",
        namesByThemselves: "Los nombres o apellidos por sí solos son fáciles de adivinar.",
        pwned: "Esta contraseña apareció en una filtración.",
        recentYears: "Los años recientes son fáciles de adivinar.",
        sequences: "Las secuencias son fáciles de adivinar.",
        similarToCommon: "Esta contraseña es muy similar a una común.",
        simpleRepeat: "Repeticiones como \"aaa\" son fáciles de adivinar.",
        straightRow: "Las filas rectas del teclado son fáciles de adivinar.",
        topHundred: "Esta contraseña está entre las más comunes.",
        topTen: "Esta contraseña está entre las 10 más comunes.",
        userInputs: "No uses datos personales.",
        wordByItself: "Una sola palabra es fácil de adivinar.",
      },
    },
  };

  return (
    <ClerkProvider localization={clerkLocalization}>
      <html lang="es" suppressHydrationWarning>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ServiceWorkerRegistrar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
