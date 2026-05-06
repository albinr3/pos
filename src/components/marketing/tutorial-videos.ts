export type TutorialCategory =
  | "primeros-pasos"
  | "avanzados"

export type TutorialVideo = {
  slug: string
  title: string
  description: string
  category: TutorialCategory
  categoryLabel: string
  duration: string
  level: "Basico" | "Intermedio" | "Avanzado"
  videoUrl: string | null
  featured?: boolean
  outcomes: string[]
}

export const tutorialCategories: Array<{
  value: "todos" | TutorialCategory
  label: string
  description: string
}> = [
  {
    value: "todos",
    label: "Todos",
    description: "Recorre toda la biblioteca y elige el siguiente paso.",
  },
  {
    value: "primeros-pasos",
    label: "Primeros pasos",
    description: "Configura tu cuenta y deja la plataforma lista para operar.",
  },
  {
    value: "avanzados",
    label: "Avanzados",
    description: "Profundiza en ventas, inventario, compras y configuracion.",
  },
]

export const tutorialVideos: TutorialVideo[] = [
  {
    slug: "bienvenida-y-panel-inicial",
    title: "Bienvenida y recorrido por el panel inicial",
    description:
      "Entiende la estructura general de MOVOPos y ubica rapido lo que necesitas para vender, controlar inventario y revisar reportes.",
    category: "primeros-pasos",
    categoryLabel: "Primeros pasos",
    duration: "4 min",
    level: "Basico",
    videoUrl: null,
    featured: true,
    outcomes: [
      "Ubicar modulos principales",
      "Entender la navegacion general",
      "Identificar siguientes pasos para comenzar",
    ],
  },
  {
    slug: "configurar-datos-del-negocio",
    title: "Configura los datos de tu negocio",
    description:
      "Aprende a completar la informacion principal de tu empresa para empezar a operar con una configuracion profesional.",
    category: "primeros-pasos",
    categoryLabel: "Primeros pasos",
    duration: "5 min",
    level: "Basico",
    videoUrl: null,
    outcomes: [
      "Actualizar nombre y datos del negocio",
      "Dejar lista la configuracion inicial",
      "Evitar errores comunes al comenzar",
    ],
  },
  {
    slug: "crear-tu-primera-venta",
    title: "Crea tu primera venta paso a paso",
    description:
      "Descubre como registrar una venta, seleccionar productos y completar el proceso de facturacion en pocos clics.",
    category: "avanzados",
    categoryLabel: "Avanzados",
    duration: "6 min",
    level: "Basico",
    videoUrl: null,
    outcomes: [
      "Agregar productos a una venta",
      "Confirmar totales y metodos de pago",
      "Finalizar la operacion correctamente",
    ],
  },
  {
    slug: "facturar-e-imprimir-ticket",
    title: "Facturar e imprimir o compartir el ticket",
    description:
      "Mira como emitir un comprobante, imprimir tickets y compartir el resultado con el cliente segun tu flujo de trabajo.",
    category: "avanzados",
    categoryLabel: "Avanzados",
    duration: "5 min",
    level: "Intermedio",
    videoUrl: null,
    outcomes: [
      "Emitir documentos correctamente",
      "Imprimir o compartir tickets",
      "Asegurar una entrega rapida al cliente",
    ],
  },
  {
    slug: "crear-productos-y-categorias",
    title: "Crea productos y categorias",
    description:
      "Organiza tu catalogo con nombres, precios, categorias y datos clave para que vender sea mas rapido y ordenado.",
    category: "avanzados",
    categoryLabel: "Avanzados",
    duration: "7 min",
    level: "Basico",
    videoUrl: null,
    outcomes: [
      "Agregar productos correctamente",
      "Clasificar el catalogo por categorias",
      "Preparar el inventario para vender",
    ],
  },
  {
    slug: "ajustes-de-stock-e-inventario",
    title: "Ajustes de stock e inventario",
    description:
      "Aprende a corregir existencias, revisar movimientos y mantener el inventario alineado con la realidad de tu negocio.",
    category: "avanzados",
    categoryLabel: "Avanzados",
    duration: "6 min",
    level: "Intermedio",
    videoUrl: null,
    outcomes: [
      "Hacer ajustes de inventario",
      "Revisar diferencias de stock",
      "Mantener control sobre existencias",
    ],
  },
  {
    slug: "registrar-una-compra",
    title: "Registrar una compra paso a paso",
    description:
      "Aprende a cargar compras de proveedores para que el inventario y los costos queden actualizados desde el primer registro.",
    category: "avanzados",
    categoryLabel: "Avanzados",
    duration: "6 min",
    level: "Intermedio",
    videoUrl: null,
    outcomes: [
      "Registrar compras completas",
      "Actualizar stock automaticamente",
      "Mantener historial ordenado",
    ],
  },
  {
    slug: "gestion-de-proveedores-y-cuentas",
    title: "Gestion de proveedores y cuentas pendientes",
    description:
      "Conoce como organizar proveedores, montos por pagar y seguimiento de compromisos relacionados con tus compras.",
    category: "avanzados",
    categoryLabel: "Avanzados",
    duration: "5 min",
    level: "Intermedio",
    videoUrl: null,
    outcomes: [
      "Consultar proveedores",
      "Dar seguimiento a pendientes",
      "Mejorar el control administrativo",
    ],
  },
  {
    slug: "usuarios-y-permisos",
    title: "Crea usuarios y administra permisos",
    description:
      "Configura accesos para tu equipo y asigna permisos segun el rol de cada persona dentro del negocio.",
    category: "avanzados",
    categoryLabel: "Avanzados",
    duration: "5 min",
    level: "Intermedio",
    videoUrl: null,
    outcomes: [
      "Crear usuarios del equipo",
      "Asignar roles con criterio",
      "Proteger areas sensibles del sistema",
    ],
  },
  {
    slug: "personalizar-documentos-e-impuestos",
    title: "Personaliza documentos, tickets e impuestos",
    description:
      "Ajusta detalles operativos y visuales para que la plataforma refleje la forma real en que trabaja tu negocio.",
    category: "avanzados",
    categoryLabel: "Avanzados",
    duration: "7 min",
    level: "Avanzado",
    videoUrl: null,
    outcomes: [
      "Ajustar parametros del negocio",
      "Personalizar la salida de documentos",
      "Preparar una operacion mas profesional",
    ],
  },
]

