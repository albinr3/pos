import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import Script from "next/script";
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

const siteUrl = "https://movopos.com";
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "MOVOPos - Sistema de facturación en República Dominicana",
    template: "%s | MOVOPos",
  },
  description:
    "Sistema de facturación en República Dominicana con punto de venta, inventario, compras y cuentas por cobrar. Factura en RD$ desde cualquier dispositivo.",
  keywords: [
    "sistema de facturación en república dominicana",
    "sistema de facturación",
    "sistema pos",
    "sistema punto de venta",
    "facturación online",
    "inventario",
    "sistema de inventario",
    "punto de venta",
    "facturación térmica",
    "república dominicana",
    "control de ventas",
  ],
  authors: [{ name: "Tejada Auto Adornos" }],
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "es_DO",
    url: siteUrl,
    siteName: "MOVOPos",
    title: "MOVOPos - Sistema de facturación en República Dominicana",
    description:
      "Sistema de facturación en República Dominicana con punto de venta, inventario, compras y cuentas por cobrar para negocios locales.",
    images: [
      {
        url: "/hero-img.svg",
        width: 1200,
        height: 630,
        alt: "Sistema de facturación en República Dominicana",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MOVOPos - Sistema de facturación en República Dominicana",
    description:
      "Sistema de facturación en República Dominicana con punto de venta, inventario, compras y cuentas por cobrar para negocios locales.",
    images: [
      {
        url: "/hero-img.svg",
        alt: "Sistema de facturación en República Dominicana",
      },
    ],
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
        <head>
          {GA_MEASUREMENT_ID ? (
            <>
              <Script
                async
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
                strategy="afterInteractive"
              />
              <Script id="google-analytics" strategy="afterInteractive">
                {`
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GA_MEASUREMENT_ID}');
                `}
              </Script>
            </>
          ) : null}
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ServiceWorkerRegistrar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
