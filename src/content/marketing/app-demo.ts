import { siteUrl } from "@/lib/site-url"

// El reproductor, el JSON-LD y el sitemap comparten estos datos para evitar URLs
// o duraciones contradictorias. Actualizarlos al sustituir la grabación.
export const appDemoVideo = {
  name: "Cómo registrar una venta desde el celular con MOVOPos",
  description:
    "Demostración de MOVOPos en Android: selecciona productos del catálogo, revisa el total en RD$, completa una venta en efectivo y consulta la factura con opciones para compartir o imprimir.",
  pagePath: "/app-ventas-inventario",
  videoPath: "/videos/movopos-registrar-venta-android.mp4",
  posterPath: "/videos/movopos-registrar-venta-android-poster.jpg",
  // Fecha de incorporación a la página; debe ser estable entre compilaciones.
  uploadDate: "2026-11-07T09:00:10-04:00",
  duration: "PT15S",
  durationSeconds: 15,
  width: 720,
  height: 1544,
}

export const appDemoVideoJsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "@id": `${siteUrl}${appDemoVideo.pagePath}#demo-video`,
  name: appDemoVideo.name,
  description: appDemoVideo.description,
  thumbnailUrl: `${siteUrl}${appDemoVideo.posterPath}`,
  uploadDate: appDemoVideo.uploadDate,
  duration: appDemoVideo.duration,
  contentUrl: `${siteUrl}${appDemoVideo.videoPath}`,
  inLanguage: "es-DO",
  width: appDemoVideo.width,
  height: appDemoVideo.height,
  publisher: {
    "@type": "Organization",
    name: "MOVOPos",
    url: siteUrl,
  },
}
