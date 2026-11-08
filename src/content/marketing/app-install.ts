import { siteUrl } from "@/lib/site-url"

// Mantener el archivo, la miniatura y la duración sincronizados con el video publicado.
export const appInstallVideo = {
  name: "Cómo instalar la app de MOVOPos en Android",
  description: "Tutorial para descargar e instalar la aplicación MOVOPos en un celular Android.",
  pagePath: "/app-ventas-inventario",
  videoPath: "/videos/movopos-instalar-app-android.mp4",
  posterPath: "/videos/movopos-instalar-app-android-poster.jpg",
  uploadDate: "2026-11-08T14:20:41-04:00",
  duration: "PT19S",
  durationSeconds: 19,
  width: 368,
  height: 624,
}

export const appInstallVideoJsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "@id": `${siteUrl}${appInstallVideo.pagePath}#instalacion-video`,
  name: appInstallVideo.name,
  description: appInstallVideo.description,
  thumbnailUrl: `${siteUrl}${appInstallVideo.posterPath}`,
  uploadDate: appInstallVideo.uploadDate,
  duration: appInstallVideo.duration,
  contentUrl: `${siteUrl}${appInstallVideo.videoPath}`,
  inLanguage: "es-DO",
  width: appInstallVideo.width,
  height: appInstallVideo.height,
  publisher: { "@type": "Organization", name: "MOVOPos", url: siteUrl },
}
