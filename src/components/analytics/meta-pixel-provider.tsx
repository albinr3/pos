"use client"

import { useUser } from "@clerk/nextjs"
import { usePathname, useSearchParams } from "next/navigation"
import Script from "next/script"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  buildViewContentPayload,
  createMetaEventId,
  getMetaPixelId,
  initMetaPixel,
  shouldTrackViewContent,
  trackMetaEvent,
} from "@/lib/meta/browser"

export function MetaPixelProvider() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isLoaded, isSignedIn, user } = useUser()
  const initDoneRef = useRef(false)
  const lastTrackedViewRef = useRef<string | null>(null)
  const [pixelReady, setPixelReady] = useState(false)
  const pixelId = getMetaPixelId()

  const advancedMatching = useMemo(
    () => ({
      email: user?.primaryEmailAddress?.emailAddress ?? null,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      phone: user?.primaryPhoneNumber?.phoneNumber ?? user?.phoneNumbers?.[0]?.phoneNumber ?? null,
      externalId: user?.id ?? null,
      country: "DO",
    }),
    [user]
  )

  useEffect(() => {
    if (!pixelId || !isLoaded || initDoneRef.current) return

    const interval = window.setInterval(() => {
      const initialized = initMetaPixel(pixelId, advancedMatching)

      if (initialized) {
        initDoneRef.current = true
        setPixelReady(true)
        window.clearInterval(interval)
      }
    }, 250)

    // Avoid infinite polling if the script is blocked (adblock/privacy settings).
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
    }, 30000)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [advancedMatching, isLoaded, pixelId])

  useEffect(() => {
    if (!pixelId || !isLoaded || !pixelReady || !pathname || !shouldTrackViewContent(pathname)) {
      return
    }

    const query = searchParams?.toString()
    const authState = isSignedIn ? user?.id ?? "signed-in" : "anonymous"
    const viewKey = `${pathname}?${query ?? ""}|${authState}`

    if (lastTrackedViewRef.current === viewKey) {
      return
    }

    trackMetaEvent(
      "ViewContent",
      buildViewContentPayload({
        pathname,
        isAuthenticated: !!isSignedIn,
      }),
      createMetaEventId("viewcontent")
    )

    lastTrackedViewRef.current = viewKey
  }, [isLoaded, isSignedIn, pathname, pixelId, pixelReady, searchParams, user?.id])

  if (!pixelId) {
    return null
  }

  return (
    <>
      <Script
        id="meta-pixel-base"
        // Evita que el script de terceros compita con el hero y afecte el render inicial/LCP.
        strategy="lazyOnload"
      >
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
        `}
      </Script>
    </>
  )
}
