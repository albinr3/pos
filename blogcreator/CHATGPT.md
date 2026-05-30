# Reglas del proyecto para crear blogs

Este archivo adapta el flujo copiado a MOVOPos. No usar rutas, nombres ni componentes del proyecto original.

## Proyecto real

- Framework: Next.js App Router.
- Blog index: `src/app/(marketing)/blog/page.tsx`.
- Blog post route: `src/app/(marketing)/blog/[slug]/page.tsx`.
- Datos de posts: `src/content/blog`.
- Tipos y categorías: `src/lib/blog.ts`.
- Sitio público: `https://movopos.com`.
- Idioma: español dominicano claro.

## No copiar del proyecto original

No usar:

- `app/blog/<slug>/page.tsx` sin `src`.
- `content/blog-voiced.ts`.
- `content/pexels.json`.
- `lib/business.ts`.
- Componentes `Breadcrumbs`, `BlogBody`, `SectionImage`, `BlogJsonLd` o `BackToTop`.
- Nombres, autores, licencias, teléfonos o ejemplos de plomería.

Esos archivos pertenecían al proyecto copiado. En MOVOPos rompen el build o publican contenido que no tiene nada que ver.

## Cómo publicar aquí

1. Crear `src/content/blog/<slug>.ts`.
2. Exportar un objeto `BlogPost`.
3. Importarlo en `src/content/blog/index.ts`.
4. El índice `/blog`, la ruta `/blog/[slug]` y el sitemap lo toman automáticamente desde `blogPosts`.

## SEO técnico ya cubierto por la plantilla

La ruta dinámica ya genera:

- `metadata` por artículo.
- Canonical.
- Open Graph.
- Twitter Card.
- `BlogPosting` JSON-LD.
- `BreadcrumbList` JSON-LD.
- `FAQPage` JSON-LD cuando hay FAQs.
- Autor visible.
- Tabla de contenido.
- Sitemap automático para posts registrados.

El trabajo del generador es llenar bien el contenido y no romper el contrato de `BlogPost`.

## Voz

Escribir como Julio Rodríguez:

- Claro.
- Directo.
- Dominicano ligero.
- Humilde.
- Con humor seco.
- Sin lenguaje corporativo.

No usar frases tipo:

- "solución integral"
- "transforma tu negocio"
- "tecnología de punta"
- "lleva tu negocio al siguiente nivel"
- "maximiza tu rentabilidad"

## Imágenes

Las imágenes se descargan desde Pexels con `scripts/fetch-pexels.mjs`.

- La API key se lee desde `PEXELS_API_KEY` en `.env`.
- Los archivos van en `public/images/blog/<slug>/`.
- La metadata queda en `src/content/blog/pexels.json`.
- Cada post debe importar `pexels.json`, usar `postImages.hero` como `heroImage` y asignar `sectionImages: postImages`.
- Cada H2 debe tener una imagen con key igual al `id` del H2.
- La sección FAQ usa la key `preguntas-frecuentes`.
- No usar imágenes remotas en runtime. Pexels solo se usa para descargar assets locales.

## Build

`blogcreator` está excluido del `tsconfig` porque contiene prompts y plantillas, no código compilable de producción. Si se copia un `.tsx` dentro de `blogcreator`, no debe afectar el build.

Antes de decir que un artículo quedó listo, correr:

```bash
npm run build
```
