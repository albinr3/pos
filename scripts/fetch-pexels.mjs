import "dotenv/config"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

const rootDir = process.cwd()
const publicImagesDir = path.join(rootDir, "public", "images", "blog")
const metadataPath = path.join(rootDir, "src", "content", "blog", "pexels.json")

// PEXELS_API_KEY es el nombre real en .env. PEXEL_API queda como fallback por compatibilidad
// con la plantilla vieja, para no volver a romper el generador si alguien copia esa instruccion.
const apiKey = process.env.PEXELS_API_KEY ?? process.env.PEXEL_API

const args = process.argv.slice(2)
const force = args.includes("--force")
const targetSlug = args.find((arg) => !arg.startsWith("--"))

const posts = {
  "que-es-un-sistema-de-facturacion": {
    hero: {
      query: "small business invoice laptop",
      alt: "Sistema de facturacion en una laptop para un negocio pequeno",
    },
    "que-es-un-sistema-de-facturacion": {
      query: "invoice paperwork laptop",
      alt: "Factura digital abierta en una computadora",
    },
    "como-funciona-en-la-practica": {
      query: "cash register invoice",
      alt: "Registro de venta y factura en un mostrador",
    },
    "que-debe-tener-un-buen-sistema": {
      query: "business dashboard laptop",
      alt: "Panel de reportes de ventas para un negocio",
    },
    "facturacion-online-vs-sistema-de-facturacion": {
      query: "online invoice computer",
      alt: "Facturacion online en una computadora",
    },
    "cuando-conviene-para-un-negocio-pequeno": {
      query: "small business owner counter",
      alt: "Duenos de negocio revisando ventas en el mostrador",
    },
    "cuando-no-te-conviene-todavia": {
      query: "notebook small business",
      alt: "Libreta de notas usada para organizar ventas pequenas",
    },
    "que-pasa-en-republica-dominicana-con-ecf": {
      query: "tax invoice document",
      alt: "Documento fiscal y calculadora para facturacion electronica",
    },
    "como-empezar-sin-complicarte": {
      query: "small business planning laptop",
      alt: "Planificacion sencilla para empezar a facturar en un negocio",
    },
    "preguntas-frecuentes": {
      query: "question mark laptop",
      alt: "Preguntas frecuentes sobre sistema de facturacion",
    },
  },
}

async function readMetadata() {
  if (!existsSync(metadataPath)) return {}

  const raw = await readFile(metadataPath, "utf8")
  if (!raw.trim()) return {}

  return JSON.parse(raw)
}

async function writeMetadata(metadata) {
  await mkdir(path.dirname(metadataPath), { recursive: true })
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8")
}

async function searchPexels(query) {
  const url = new URL("https://api.pexels.com/v1/search")
  url.searchParams.set("query", query)
  url.searchParams.set("orientation", "landscape")
  url.searchParams.set("per_page", "1")

  const response = await fetch(url, {
    headers: { Authorization: apiKey },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Pexels search failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  const [photo] = data.photos ?? []

  if (!photo) {
    throw new Error(`No Pexels photo found for query "${query}"`)
  }

  return photo
}

async function downloadImage(url, destination) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Image download failed (${response.status})`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(destination, buffer)
}

async function fetchPostImages(slug, config, metadata) {
  const postDir = path.join(publicImagesDir, slug)
  await mkdir(postDir, { recursive: true })

  metadata[slug] ??= {}

  for (const [key, imageConfig] of Object.entries(config)) {
    const fileName = `${key}.jpg`
    const filePath = path.join(postDir, fileName)
    const publicPath = `/images/blog/${slug}/${fileName}`
    const existingMetadata = metadata[slug][key]

    if (!force && existingMetadata && existsSync(filePath)) {
      console.log(`skip ${slug}/${key}`)
      continue
    }

    const photo = await searchPexels(imageConfig.query)
    // `large` mantiene los archivos livianos para SEO; `large2x/original` puede subir cientos de KB por imagen.
    const imageUrl = photo.src?.large ?? photo.src?.large2x ?? photo.src?.original

    if (!imageUrl) {
      throw new Error(`Pexels response for "${imageConfig.query}" did not include a usable image URL`)
    }

    await downloadImage(imageUrl, filePath)

    metadata[slug][key] = {
      src: publicPath,
      alt: imageConfig.alt,
      width: photo.width,
      height: photo.height,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      pexelsUrl: photo.url,
    }

    console.log(`ok ${slug}/${key}`)
  }
}

async function main() {
  if (!apiKey) {
    throw new Error("Missing PEXELS_API_KEY in .env")
  }

  const selectedPosts = targetSlug
    ? Object.entries(posts).filter(([slug]) => slug === targetSlug)
    : Object.entries(posts)

  if (selectedPosts.length === 0) {
    throw new Error(
      targetSlug
        ? `No Pexels config found for "${targetSlug}"`
        : "No Pexels posts configured in scripts/fetch-pexels.mjs",
    )
  }

  const metadata = await readMetadata()

  for (const [slug, config] of selectedPosts) {
    await fetchPostImages(slug, config, metadata)
  }

  await writeMetadata(metadata)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
