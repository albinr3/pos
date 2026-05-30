---
name: blog
description: Crea un artículo SEO para MOVOPos. Elige la primera keyword pendiente de blogcreator/keywords.csv, escribe el contenido con la voz de Julio y registra el post en src/content/blog para publicarlo en /blog/[slug].
---

# /blog - generador de artículos MOVOPos

Usar cuando el usuario escriba `/blog`, pida "crear un blog", "crear un artículo SEO" o pida continuar con la siguiente keyword del CSV.

## Resultado esperado

- Un nuevo archivo `src/content/blog/<slug>.ts` exportando un objeto `BlogPost`.
- `src/content/blog/index.ts` importando y registrando ese post en `blogPosts`.
- Imágenes locales descargadas desde Pexels en `public/images/blog/<slug>/`.
- Metadata de imágenes actualizada en `src/content/blog/pexels.json`.
- Una URL estática en `/blog/<slug>` usando `src/app/(marketing)/blog/[slug]/page.tsx`.
- `blogcreator/references/used-keywords.md` actualizado con la keyword usada.
- `npm run build` ejecutado sin errores antes de responder "listo".

## Leer antes de escribir

1. `AGENTS.md`
2. `blogcreator/CHATGPT.md`
3. `blogcreator/on-page-seo.md`
4. `blogcreator/references/voice.md`
5. `blogcreator/references/humour.md`
6. `blogcreator/references/stories.md`
7. `blogcreator/references/opinions.md`
8. `blogcreator/references/used-keywords.md`
9. `src/lib/blog.ts`
10. `src/content/blog/index.ts`
11. `src/app/(marketing)/blog/[slug]/page.tsx`
12. `blogcreator/templates/blog-post.example.ts`
13. `scripts/fetch-pexels.mjs`
14. `src/content/blog/pexels.json`

## 1. Elegir keyword

Leer `blogcreator/keywords.csv`.

Si el usuario no da keyword:

- Tomar la primera fila cuyo `Status` sea `pending`.
- Saltar cualquier keyword que aparezca como primaria en `references/used-keywords.md`.
- Usar solo filas con `Page type` = `blog`.
- Anunciar en una línea: `Voy con "<keyword>" (orden <Order>, tema <Topic>).`
- Continuar sin esperar confirmación, salvo que el usuario haya pedido aprobar antes.

Si el usuario da keyword:

- Buscar coincidencia exacta, ignorando mayúsculas.
- Confirmar que no esté usada.
- Si no existe o ya está usada, parar y pedir otra keyword.

## 2. Armar cluster

- Primary: la keyword elegida.
- Secondaries: tomar hasta 5 keywords del CSV con el mismo `Topic` y la misma intención.
- Si faltan secondaries, crear variaciones naturales tipo preguntas frecuentes y marcarlas como `(inferida)`.
- No inventar otra primary.

## 3. Investigar

Si hay acceso web, buscar la keyword y revisar los 3 mejores resultados orgánicos útiles. Omitir anuncios, videos, foros y páginas que no respondan la intención.

Extraer:

- Formato dominante: guía, lista, comparación, tutorial o explicación.
- Temas H2 que se repiten.
- Preguntas frecuentes reales.
- 1 o 2 huecos que MOVOPos pueda cubrir mejor para negocios dominicanos.

Si no hay acceso web, seguir con el CSV y las referencias internas, y decir en el resumen que no se pudo validar SERP en vivo.

## 4. Escribir en la voz correcta

- Español dominicano claro, no corporativo.
- Respuesta directa en el primer párrafo.
- Primary keyword en las primeras 100 palabras.
- Párrafos cortos.
- Máximo una historia de `stories.md`.
- Máximo una opinión fuerte de `opinions.md`.
- 2 o 3 momentos de humor como máximo.
- No usar palabras prohibidas de `voice.md`.
- No inventar estadísticas, precios, garantías ni datos legales.
- Decir cuándo MOVOPos no conviene si aplica. Eso da confianza.

## 5. Crear el archivo del post

Crear `src/content/blog/<slug>.ts` con esta forma:

```ts
import type { BlogImage, BlogPost } from "@/lib/blog"
import pexels from "./pexels.json"

const pexelsImages = pexels as Record<string, Record<string, BlogImage>>
const postImages = pexelsImages["<slug>"] ?? {}
const heroImage = postImages.hero

export const nombreDelPost: BlogPost = {
  slug: "<slug>",
  title: "<titulo SEO de 50 a 60 caracteres>",
  description: "<meta description de 150 a 160 caracteres>",
  category: "<punto-de-venta | facturacion | inventario | negocios-rd>",
  publishedAt: "<YYYY-MM-DD>",
  readingTimeMinutes: 7,
  keywords: ["<primary>", "<secondary>"],
  heroImage: {
    src: heroImage?.src ?? "/hero-img.svg",
    alt: heroImage?.alt ?? "<alt descriptivo con keyword natural>",
    width: heroImage?.width ?? 1200,
    height: heroImage?.height ?? 630,
    photographer: heroImage?.photographer,
    photographerUrl: heroImage?.photographerUrl,
    pexelsUrl: heroImage?.pexelsUrl,
  },
  author: {
    name: "Julio Rodríguez",
    role: "Programador y especialista en sistemas POS",
    bio: "Julio ayuda a negocios pequeños a vender, facturar y controlar inventario con números claros, sin ponerle traje y corbata a un colmado.",
  },
  excerpt: "<resumen corto visible en la portada>",
  tldr: "<2 a 4 frases con respuesta directa>",
  tableOfContents: [
    { id: "<id-del-h2>", title: "<titulo corto>" },
  ],
  sectionImages: postImages,
  body: [
    { type: "heading", id: "<id-del-h2>", title: "<H2 claro>" },
    { type: "paragraph", content: "Texto..." },
  ],
  faqs: [
    { question: "Pregunta", answer: "Respuesta directa." },
  ],
  internalLinks: [
    { title: "Precios", description: "Planes y costos de MOVOPos.", href: "/precios" },
  ],
  externalLinks: [],
}
```

Reglas del contenido:

- Cada `heading.id` debe coincidir con su entrada en `tableOfContents`.
- Usar `content` como string simple o como arreglo para enlaces internos:

```ts
{
  type: "paragraph",
  content: [
    "Si quieres ver planes claros, revisa ",
    { text: "los precios de MOVOPos", href: "/precios" },
    ".",
  ],
}
```

- Mantener 3 a 5 enlaces internos.
- Usar 2 a 3 enlaces externos solo si son fuentes confiables y relevantes.
- No usar `target` manualmente; el renderer lo aplica cuando `external: true`.

## 6. Fetch Pexels images

Las imágenes salen de Pexels usando `PEXELS_API_KEY` en `.env`.

Para cada post necesitas:

- `hero`: imagen horizontal relacionada con el tema.
- Una imagen por cada H2 del body. La llave debe ser exactamente el `id` del H2.
- `preguntas-frecuentes`: imagen genérica para FAQ.

Editar `scripts/fetch-pexels.mjs` y agregar una entrada en el objeto `posts`, usando el slug del artículo:

```js
"<slug>": {
  hero: {
    query: "small business invoice laptop",
    alt: "Sistema de facturacion para negocio pequeno",
  },
  "<id-del-h2>": {
    query: "business dashboard laptop",
    alt: "Panel de reportes de ventas para negocio pequeno",
  },
  "preguntas-frecuentes": {
    query: "question mark laptop",
    alt: "Preguntas frecuentes sobre sistema de facturacion",
  },
}
```

Luego correr:

```bash
npm run blog:images -- <slug>
```

Esto descarga archivos en `public/images/blog/<slug>/` y actualiza `src/content/blog/pexels.json`.

Verificar:

- Cada key esperada aparece en `src/content/blog/pexels.json`.
- Cada archivo existe en `public/images/blog/<slug>/`.
- El post importa `pexels.json`, usa `heroImage` desde `postImages.hero` y asigna `sectionImages: postImages`.
- Si una búsqueda falla, cambiar `query` por algo más concreto y correr de nuevo.
- Si quieres reemplazar imágenes existentes, correr `npm run blog:images -- <slug> --force`.

No guardar URLs remotas en el post. El sitio debe servir imágenes locales para evitar depender de Pexels en runtime.

## 7. Registrar el post

Editar `src/content/blog/index.ts`:

```ts
import type { BlogPost } from "@/lib/blog"
import { nombreDelPost } from "./<slug>"

export const blogPosts: BlogPost[] = [
  nombreDelPost,
]
```

Si ya hay posts, agregar el nuevo al inicio del arreglo.

## 8. Marcar keyword usada

Editar `blogcreator/references/used-keywords.md` y añadir:

- Fecha.
- Primary keyword.
- URL `/blog/<slug>`.
- Cluster usado.
- Nota de investigación: web validada o no validada.

También cambiar la fila del CSV a `used` si estás tocando el CSV en la misma tarea.

## 9. Verificar

Ejecutar:

```bash
npm run build
```

Revisar que:

- `/blog` lista el artículo.
- `/blog/<slug>` renderiza H1, TL;DR, tabla de contenido, FAQ y autor.
- El hero y las imágenes de cada H2 cargan desde `/images/blog/<slug>/`.
- El sitemap incluye `/blog/<slug>`.
- No hay errores de TypeScript.

## Resumen final

Responder en 8 a 10 líneas:

- Keyword usada.
- Slug y URL.
- Cluster.
- Archivos creados/cambiados.
- Si se validó SERP en vivo.
- Estado del build.
