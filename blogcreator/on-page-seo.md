# Checklist SEO para artículos de MOVOPos

Usar este checklist para cada post generado desde `blogcreator`.

## Metadata

- Title: 50 a 60 caracteres, con la keyword primaria cerca del inicio.
- Description: 150 a 160 caracteres, con keyword primaria, beneficio claro y CTA suave.
- Canonical: `/blog/<slug>`.
- Open Graph: título, descripción, imagen, URL y tipo `article`.
- Twitter Card: `summary_large_image`.
- Idioma del sitio: `es`.

## URL

- Ruta final: `/blog/<slug>`.
- Slug corto, en minúsculas, con guiones.
- Sin acentos en el slug.
- Sin underscores.
- La keyword primaria debe estar representada de forma natural.

## Encabezados

- Un solo H1. Lo genera la plantilla desde `post.title`.
- H2 claros, no genéricos.
- Cada H2 debe tener `id` único.
- `tableOfContents` debe coincidir con los H2 reales.
- No repetir la keyword de forma artificial.

## Cuerpo

- Responder la intención en el primer párrafo.
- Keyword primaria en las primeras 100 palabras.
- Párrafos cortos.
- Lenguaje de negocio pequeño, no lenguaje corporativo.
- Incluir ejemplos concretos cuando ayuden.
- Usar una historia como máximo desde `references/stories.md`.
- Usar una opinión fuerte como máximo desde `references/opinions.md`.
- No inventar cifras. Si no hay fuente, escribir de forma cualitativa.

## Enlaces

- 3 a 5 enlaces internos:
  - `/precios`
  - `/app-ventas-inventario`
  - `/como-usar-la-plataforma`
  - `/contact`
  - otros posts relacionados si existen
- Texto de enlace descriptivo.
- 2 a 3 enlaces externos solo si son fuentes confiables y útiles.
- En enlaces externos, marcar `external: true` en el contenido o en `externalLinks`.

## FAQ

- 4 a 8 preguntas.
- Respuestas de 2 a 4 frases.
- Preguntas reales o razonables para la keyword.
- La plantilla genera `FAQPage` JSON-LD automáticamente.

## Imágenes

- Cada post debe tener `heroImage`.
- Cada H2 debe tener una imagen en `sectionImages` con key igual al `id` del H2.
- La FAQ debe tener imagen con key `preguntas-frecuentes` cuando haya FAQs.
- `alt` descriptivo y natural.
- `width` y `height` obligatorios.
- No usar imágenes remotas en runtime.
- Descargar imágenes con `npm run blog:images -- <slug>` antes del build.
- Usar `/hero-img.svg` solo como fallback temporal si Pexels no devuelve resultados.

## E-E-A-T

- Autor visible: Julio Rodríguez.
- Bio corta y concreta.
- Fecha de publicación.
- Fecha de actualización si aplica.
- Postura clara sin prometer resultados falsos.
- Indicar cuándo MOVOPos no conviene, si aplica.

## Accesibilidad

- Tablas con encabezados claros.
- Enlaces descriptivos.
- Contraste legible.
- No usar emojis como iconos principales.
- No meter texto dentro de imágenes.

## Revisión final

Antes de cerrar:

1. Leer otra vez `references/voice.md`.
2. Eliminar frases que suenen a IA.
3. Confirmar que el artículo aparece en `/blog`.
4. Confirmar que `/blog/<slug>` compila.
5. Ejecutar `npm run build`.
