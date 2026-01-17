# Marketing Assets

Este directorio está destinado para almacenar imágenes y assets del sitio web comercial.

## Estructura recomendada

```
marketing/
├── hero/          # Imágenes para la sección hero
├── features/      # Imágenes de características
├── testimonials/  # Fotos de clientes/testimonios
├── logos/         # Logos y marcas
└── screenshots/   # Capturas de pantalla de la app
```

## Uso

Para usar imágenes en los componentes de marketing, reemplaza los placeholders con rutas a imágenes en este directorio:

```tsx
import Image from "next/image"

<Image
  src="/marketing/hero/main-hero.jpg"
  alt="Descripción"
  width={1200}
  height={600}
/>
```

## Optimización

- Usa formatos modernos (WebP, AVIF) cuando sea posible
- Optimiza imágenes antes de subirlas
- Next.js Image component optimiza automáticamente las imágenes


