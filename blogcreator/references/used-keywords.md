# Keywords usadas

Este archivo evita canibalización SEO. Antes de crear un post, confirmar que la primary no esté aquí.

## Regla

1. La primary debe salir de `blogcreator/keywords.csv`.
2. No repetir una primary usada.
3. Las secundarias deben compartir intención con la primary.
4. Si una secundaria no aparece en el CSV, marcarla como `(inferida)`.
5. Al publicar, cambiar el `Status` de la fila del CSV a `used`.

## Active primaries

### 2026-05-30 - que es un sistema de facturacion

- URL: `/blog/que-es-un-sistema-de-facturacion`
- CSV: Order `1`, Topic `facturacion`, Priority `Alta`
- Cluster:
  - `que es un sistema de facturacion` - primary
  - `que es la facturacion online` - CSV
  - `para que sirve un sistema de facturacion` - inferida
  - `como funciona un sistema de facturacion` - inferida
  - `sistema de facturacion para negocio pequeño` - inferida
  - `diferencia entre factura online y sistema de facturacion` - inferida
- Investigación: SERP validada
- Nota: cubre definición, funcionamiento, diferencia con facturación online, cuándo conviene, cuándo no conviene y contexto básico de e-CF/DGII en RD.

## Formato para nuevos registros

### YYYY-MM-DD - keyword primaria

- URL: `/blog/<slug>`
- CSV: Order `<n>`, Topic `<topic>`, Priority `<priority>`
- Cluster:
  - `<keyword>` - primary
  - `<secondary>` - CSV
  - `<secondary>` - inferida
- Investigación: SERP validada / SERP no validada
- Nota: resumen breve de la intención cubierta
