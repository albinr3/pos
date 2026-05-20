"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type DragEvent, type FocusEvent } from "react"
import { Edit, History, Loader2, Plus, Printer, Search, Trash2, Upload } from "lucide-react"
import { UnitType } from "@prisma/client"
import * as XLSX from "xlsx"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { formatDateTimeDO } from "@/lib/date-time"
import { formatRD, toCents } from "@/lib/money"
import { UNIT_OPTIONS, formatQty, decimalToNumber, unitAllowsDecimals, getUnitInfo } from "@/lib/units"
import { BarcodeLabel } from "@/components/app/barcode-label"
import { ProductImageUpload } from "@/components/app/product-image-upload"
import { OnboardingGuide, type OnboardingGuideStep } from "@/components/app/onboarding-guide"
import type { CurrentUser } from "@/lib/auth"

import {
  adjustManyStock,
  deactivateProduct,
  finalizeInventoryBulkOperation,
  importProductImagesChunk,
  importProductsChunk,
  listRecipeIngredientOptions,
  listProductMovements,
  listProducts,
  startInventoryBulkOperation,
  type BulkProductImageImportRow,
  type BulkProductImageImportRowResult,
  type BulkProductImportRow,
  type BulkProductImportRowResult,
  upsertProduct,
} from "./actions"
import { getAllSuppliers } from "../suppliers/actions"
import { getAllCategories } from "../categories/actions"
import { getSettings } from "../settings/actions"

type Product = Awaited<ReturnType<typeof listProducts>>["items"][number]
type ProductMovement = Awaited<ReturnType<typeof listProductMovements>>[number]
type RecipeIngredientOption = Awaited<ReturnType<typeof listRecipeIngredientOptions>>[number]

type ProductFormType = "basic" | "measured" | "recipe"

type RecipeItemFormRow = {
  id: string
  ingredientId: string
  qty: string
}

type OnboardingFieldKey = "name" | "price" | "cost" | "stock"
type OnboardingFieldCompletionState = Record<OnboardingFieldKey, boolean>

const PAGE_SIZE = 50
const INVENTORY_IMPORT_MAX_ROWS = 5000
const INVENTORY_IMPORT_MAX_FILE_SIZE = 10 * 1024 * 1024
const INVENTORY_IMPORT_CHUNK_SIZE = 50
const INVENTORY_PREVIEW_PAGE_SIZE = 20
const PRODUCT_IMAGE_IMPORT_CHUNK_SIZE = 20
const PRODUCT_IMAGE_MAX_PER_PRODUCT = 3
const PRODUCT_IMAGE_MAX_FILE_SIZE = 2 * 1024 * 1024
const PRODUCT_IMAGE_IMPORT_MAX_FILES = 50
const PRODUCT_IMAGE_IMPORT_REASON = "Carga masiva de imágenes por ID"
const NONE_SUPPLIER_OPTION = "__none_supplier__"
const NONE_CATEGORY_OPTION = "__none_category__"
const CREATE_SUPPLIER_OPTION = "__create_supplier__"
const CREATE_CATEGORY_OPTION = "__create_category__"
const ONBOARDING_PROGRESS_KEY_PREFIX = "tejada-pos-onboarding-progress"

const INVENTORY_TEMPLATE_HEADERS = [
  "nombre",
  "sku",
  "referencia",
  "tipo_producto",
  "unidad",
  "precio_venta",
  "costo",
  "itbis",
  "existencia",
  "existencia_minima",
  "categoria",
  "proveedor",
] as const

const MOVEMENT_LABELS: Record<ProductMovement["type"], string> = {
  SALE: "Venta",
  SALE_CANCELLED: "Venta cancelada",
  PURCHASE: "Compra",
  PURCHASE_CANCELLED: "Compra cancelada",
  RETURN: "Devolución",
  RETURN_CANCELLED: "Devolución cancelada",
  ADJUSTMENT: "Ajuste",
  INITIAL: "Stock inicial",
}

function toInt(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function toDecimal(v: string) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function createLocalRowId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function createRecipeItemRow(): RecipeItemFormRow {
  return {
    id: createLocalRowId(),
    ingredientId: "",
    qty: "1",
  }
}

function createOnboardingFieldCompletionState(): OnboardingFieldCompletionState {
  return {
    name: false,
    price: false,
    cost: false,
    stock: false,
  }
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0
  return Math.max(0, Math.min(index, length - 1))
}

function getProductFormType(product?: Product | null): ProductFormType {
  if (!product) return "basic"
  if (product.productKind === "RECIPE") return "recipe"
  return product.productKind === "MEASURED" ? "measured" : "basic"
}

function getProductTypeLabel(productType: ProductFormType) {
  if (productType === "recipe") return "Por receta"
  if (productType === "measured") return "Con medidas"
  return "Básico"
}

function formatMovementDate(value: string) {
  return formatDateTimeDO(value, { dateStyle: "medium", timeStyle: "short" })
}

type BulkParseResult = {
  items: { productId: number; delta: number }[]
  errors: string[]
}

type InventoryImportSummary = {
  total: number
  created: number
  updated: number
  failed: number
  results: BulkProductImportRowResult[]
}

type ProductImageImportGroup = {
  rowNumber: number
  productId: number
  files: File[]
  fileNames: string[]
}

type ProductImageImportSummary = {
  total: number
  updated: number
  failed: number
  results: BulkProductImageImportRowResult[]
}

function parseProductIdFromFileName(fileName: string) {
  const withoutExtension = fileName.trim().replace(/\.[^/.]+$/, "")
  const match = withoutExtension.match(/^(\d+)/)
  if (!match) return null
  const parsed = Number(match[1])
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function buildProductImageImportGroups(files: File[]) {
  const errors: string[] = []
  const grouped = new Map<number, File[]>()

  for (const file of files) {
    if (!file.type?.startsWith("image/")) {
      errors.push(`${file.name}: solo se permiten imágenes.`)
      continue
    }
    if (file.size > PRODUCT_IMAGE_MAX_FILE_SIZE) {
      errors.push(`${file.name}: supera el máximo de 2MB.`)
      continue
    }

    const productId = parseProductIdFromFileName(file.name)
    if (!productId) {
      errors.push(`${file.name}: el nombre debe iniciar con el ID del producto (ej: 123.jpg o 123-1.png).`)
      continue
    }

    const current = grouped.get(productId) ?? []
    current.push(file)
    grouped.set(productId, current)
  }

  const groups: ProductImageImportGroup[] = []
  const orderedProductIds = Array.from(grouped.keys()).sort((a, b) => a - b)
  let rowNumber = 1

  for (const productId of orderedProductIds) {
    const productFiles = grouped.get(productId) ?? []
    if (!productFiles.length) continue
    if (productFiles.length > PRODUCT_IMAGE_MAX_PER_PRODUCT) {
      errors.push(`Producto ${productId}: máximo ${PRODUCT_IMAGE_MAX_PER_PRODUCT} imágenes por producto.`)
      continue
    }

    groups.push({
      rowNumber,
      productId,
      files: productFiles,
      fileNames: productFiles.map((file) => file.name),
    })
    rowNumber += 1
  }

  return { groups, errors }
}

function parseBulkLines(value: string): BulkParseResult {
  const items: { productId: number; delta: number }[] = []
  const errors: string[] = []
  const lines = value.split(/\r?\n/)

  lines.forEach((line, index) => {
    const raw = line.trim()
    if (!raw) return

    // Ignorar encabezados comunes
    if (!/\d/.test(raw) && /id|producto|cantidad/i.test(raw)) return

    let parts: string[]
    if (raw.includes("\t")) {
      parts = raw.split("\t")
    } else if (raw.includes(",")) {
      parts = raw.split(",")
    } else if (raw.includes(";")) {
      parts = raw.split(";")
    } else {
      parts = raw.split(/\s+/)
    }

    const [idRaw, deltaRaw] = parts.map((p) => p.trim()).filter(Boolean)
    if (!idRaw || !deltaRaw) {
      errors.push(`Línea ${index + 1}: formato inválido (usa ID y cantidad).`)
      return
    }

    const productId = Number(idRaw)
    const delta = Number(deltaRaw.replace(",", "."))

    if (!Number.isInteger(productId) || productId <= 0) {
      errors.push(`Línea ${index + 1}: ID inválido.`)
      return
    }
    if (!Number.isFinite(delta) || delta === 0) {
      errors.push(`Línea ${index + 1}: cantidad inválida.`)
      return
    }

    items.push({ productId, delta })
  })

  return { items, errors }
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function getCellValue(row: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    if (alias in row) return row[alias]
  }
  return undefined
}

function hasCellValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  return true
}

function parseExcelNumber(value: unknown) {
  if (!hasCellValue(value)) return undefined
  const parsed = Number(String(value).replace(",", ".").trim())
  if (!Number.isFinite(parsed)) {
    throw new Error("Número inválido")
  }
  return parsed
}

function parseExcelUnit(value: unknown): UnitType | undefined {
  if (!hasCellValue(value)) return undefined
  const raw = String(value)
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  const map: Record<string, UnitType> = {
    UNIDAD: "UNIDAD",
    UND: "UNIDAD",
    U: "UNIDAD",
    KG: "KG",
    KILO: "KG",
    KILOGRAMO: "KG",
    KILOGRAMOS: "KG",
    LIBRA: "LIBRA",
    LIBRAS: "LIBRA",
    LB: "LIBRA",
    GRAMO: "GRAMO",
    GRAMOS: "GRAMO",
    G: "GRAMO",
    MILIGRAMO: "MILIGRAMO",
    MILIGRAMOS: "MILIGRAMO",
    MG: "MILIGRAMO",
    ONZA: "ONZA",
    ONZAS: "ONZA",
    OZ: "ONZA",
    TONELADA: "TONELADA",
    TONELADAS: "TONELADA",
    TON: "TONELADA",
    T: "TONELADA",
    LITRO: "LITRO",
    LITROS: "LITRO",
    L: "LITRO",
    ML: "ML",
    MILILITRO: "ML",
    MILILITROS: "ML",
    ONZA_LIQUIDA: "ONZA_LIQUIDA",
    ONZA_LIQUIDAS: "ONZA_LIQUIDA",
    "ONZA LIQUIDA": "ONZA_LIQUIDA",
    "ONZAS LIQUIDAS": "ONZA_LIQUIDA",
    ONZAFLUIDA: "ONZA_LIQUIDA",
    ONZASFLUIDAS: "ONZA_LIQUIDA",
    FLOZ: "ONZA_LIQUIDA",
    FL_OZ: "ONZA_LIQUIDA",
    "FL OZ": "ONZA_LIQUIDA",
    CC: "CC",
    CM3: "CC",
    CENTIMETRO_CUBICO: "CC",
    CENTIMETROS_CUBICOS: "CC",
    "CENTIMETRO CUBICO": "CC",
    "CENTIMETROS CUBICOS": "CC",
    GALON: "GALON",
    GALONES: "GALON",
    GAL: "GALON",
    METRO: "METRO",
    METROS: "METRO",
    M: "METRO",
    CM: "CM",
    CENTIMETRO: "CM",
    CENTIMETROS: "CM",
    MM: "MM",
    MILIMETRO: "MM",
    MILIMETROS: "MM",
    PIE: "PIE",
    PIES: "PIE",
    FT: "PIE",
    PULGADA: "PULGADA",
    PULGADAS: "PULGADA",
    IN: "PULGADA",
    YARDA: "YARDA",
    YARDAS: "YARDA",
    YD: "YARDA",
    M3: "M3",
    METRO_CUBICO: "M3",
    METROS_CUBICOS: "M3",
    "METRO CUBICO": "M3",
    "METROS CUBICOS": "M3",
  }
  return map[raw]
}

function parseExcelProductType(value: unknown): "BASICO" | "MEDIDO" | undefined {
  if (!hasCellValue(value)) return undefined
  const raw = String(value).trim().toUpperCase()
  if (raw === "BASICO" || raw === "BÁSICO") return "BASICO"
  if (raw === "MEDIDO") return "MEDIDO"
  return undefined
}

function mapExcelRowsToImportRows(rows: Record<string, unknown>[]) {
  return rows.map((rawRow, index) => {
    const normalized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(rawRow)) {
      normalized[normalizeHeader(key)] = value
    }
    const parseNumberWithContext = (value: unknown, label: string) => {
      try {
        return parseExcelNumber(value)
      } catch {
        throw new Error(`Línea ${index + 2}: ${label} inválido`)
      }
    }

    const nombre = getCellValue(normalized, ["nombre", "name"])
    const sku = getCellValue(normalized, ["sku", "codigo", "codigo_de_proveedor"])
    const referencia = getCellValue(normalized, ["referencia", "reference"])
    const tipoProducto = getCellValue(normalized, ["tipo_producto", "tipo"])
    if ("unidad_compra" in normalized || "unidad_venta" in normalized) {
      throw new Error(`Línea ${index + 2}: usa la columna unidad; unidad_compra y unidad_venta ya no son válidas`)
    }

    const unidad = getCellValue(normalized, ["unidad"])
    const precioVenta = getCellValue(normalized, ["precio_venta", "precio", "price"])
    const costo = getCellValue(normalized, ["costo", "cost"])
    const itbis = getCellValue(normalized, ["itbis", "itbis_percent"])
    const stock = getCellValue(normalized, ["stock", "existencia"])
    const stockMinimo = getCellValue(normalized, ["stock_minimo", "existencia_minima", "min_stock"])
    const categoria = getCellValue(normalized, ["categoria", "category"])
    const proveedor = getCellValue(normalized, ["proveedor", "supplier"])

    if (!hasCellValue(nombre)) {
      throw new Error(`Línea ${index + 2}: nombre es requerido`)
    }
    if (!hasCellValue(precioVenta)) {
      throw new Error(`Línea ${index + 2}: precio_venta es requerido`)
    }
    if (!hasCellValue(costo)) {
      throw new Error(`Línea ${index + 2}: costo es requerido`)
    }

    const parsed: BulkProductImportRow = {
      rowNumber: index + 2,
    }

    if (hasCellValue(nombre)) parsed.nombre = String(nombre).trim()
    if (hasCellValue(sku)) parsed.sku = String(sku).trim()
    if (hasCellValue(referencia)) parsed.referencia = String(referencia).trim()
    if (hasCellValue(categoria)) parsed.categoria = String(categoria).trim()
    if (hasCellValue(proveedor)) parsed.proveedor = String(proveedor).trim()

    const parsedType = parseExcelProductType(tipoProducto)
    if (hasCellValue(tipoProducto) && !parsedType) {
      throw new Error(`Línea ${index + 2}: tipo_producto inválido (usa BASICO o MEDIDO)`)
    }
    if (parsedType) parsed.tipo_producto = parsedType

    const parsedUnit = parseExcelUnit(unidad)
    if (hasCellValue(unidad) && !parsedUnit) {
      throw new Error(`Línea ${index + 2}: unidad inválida`)
    }
    if (parsedUnit) parsed.unidad = parsedUnit

    const precio = parseNumberWithContext(precioVenta, "precio_venta")
    if (precio !== undefined) parsed.precio_venta = precio
    const cost = parseNumberWithContext(costo, "costo")
    if (cost !== undefined) parsed.costo = cost
    const itbisNumber = parseNumberWithContext(itbis, "itbis")
    if (itbisNumber !== undefined) parsed.itbis = itbisNumber
    const stockNumber = parseNumberWithContext(stock, "existencia")
    if (stockNumber !== undefined) parsed.stock = stockNumber
    const stockMinNumber = parseNumberWithContext(stockMinimo, "existencia_minima")
    if (stockMinNumber !== undefined) parsed.stock_minimo = stockMinNumber

    return parsed
  })
}

function formatInventoryPreviewValue(value: BulkProductImportRow[keyof BulkProductImportRow]) {
  if (!hasCellValue(value)) return "—"
  return String(value)
}

export function ProductsClient({
  onboardingProductGuide = false,
  onboardingSaleNavGuide = false,
  onboardingAccountId = null,
  onboardingStepOffset = 0,
}: {
  onboardingProductGuide?: boolean
  onboardingSaleNavGuide?: boolean
  onboardingAccountId?: string | null
  onboardingStepOffset?: number
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Product[]>([])
  const [isLoading, startLoading] = useTransition()
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [printingProduct, setPrintingProduct] = useState<Product | null>(null)
  const [barcodeLabelSize, setBarcodeLabelSize] = useState("4x2")
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkLines, setBulkLines] = useState("")
  const [bulkReason, setBulkReason] = useState("Ajuste masivo")
  const [isBulkSaving, startBulkSaving] = useTransition()
  const [inventoryBulkOpen, setInventoryBulkOpen] = useState(false)
  const [inventoryFile, setInventoryFile] = useState<File | null>(null)
  const [inventoryRows, setInventoryRows] = useState<BulkProductImportRow[]>([])
  const [inventoryParseError, setInventoryParseError] = useState<string | null>(null)
  const [isInventoryDragOver, setIsInventoryDragOver] = useState(false)
  const [isInventoryUploading, setIsInventoryUploading] = useState(false)
  const [inventoryProgress, setInventoryProgress] = useState(0)
  const [inventoryStatus, setInventoryStatus] = useState("Listo para cargar")
  const [inventorySummary, setInventorySummary] = useState<InventoryImportSummary | null>(null)
  const [inventoryPreviewPage, setInventoryPreviewPage] = useState(0)
  const inventoryFileInputRef = useRef<HTMLInputElement>(null)
  const [productImageBulkOpen, setProductImageBulkOpen] = useState(false)
  const [productImageGroups, setProductImageGroups] = useState<ProductImageImportGroup[]>([])
  const [productImageParseErrors, setProductImageParseErrors] = useState<string[]>([])
  const [isProductImageDragOver, setIsProductImageDragOver] = useState(false)
  const [isProductImageUploading, setIsProductImageUploading] = useState(false)
  const [productImageProgress, setProductImageProgress] = useState(0)
  const [productImageStatus, setProductImageStatus] = useState("Listo para cargar")
  const [productImageSummary, setProductImageSummary] = useState<ProductImageImportSummary | null>(null)
  const productImageFileInputRef = useRef<HTMLInputElement>(null)
  const [movementsOpen, setMovementsOpen] = useState(false)
  const [movementsProduct, setMovementsProduct] = useState<Product | null>(null)
  const [movements, setMovements] = useState<ProductMovement[]>([])
  const [isMovementsLoading, startMovementsLoading] = useTransition()
  const [movementsPage, setMovementsPage] = useState(0)

  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [reference, setReference] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [price, setPrice] = useState("0")
  const [cost, setCost] = useState("0")
  const [itbisRateBp, setItbisRateBp] = useState(1800) // 18% por defecto
  const [salePricesIncludeItbis, setSalePricesIncludeItbis] = useState(true)
  const [isAvailableForSale, setIsAvailableForSale] = useState(true)
  const [stock, setStock] = useState("0")
  const [minStock, setMinStock] = useState("0")
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<Awaited<ReturnType<typeof getAllSuppliers>>>([])
  const [categories, setCategories] = useState<Awaited<ReturnType<typeof getAllCategories>>>([])
  const [ingredientOptions, setIngredientOptions] = useState<RecipeIngredientOption[]>([])
  const [categoryId, setCategoryId] = useState("")
  const [isSaving, startSaving] = useTransition()
  const [user, setUser] = useState<CurrentUser | null>(null)

  // Estado para producto básico o con medidas
  const [productType, setProductType] = useState<ProductFormType>("basic")
  const [unit, setUnit] = useState<UnitType>("KG")
  const [recipeItems, setRecipeItems] = useState<RecipeItemFormRow[]>([createRecipeItemRow()])
  const [ingredientPickerOpen, setIngredientPickerOpen] = useState(false)
  const [ingredientPickerSearch, setIngredientPickerSearch] = useState("")
  const [isOnboardingGuideClosed, setIsOnboardingGuideClosed] = useState(false)
  const [resumeProductStepIndex, setResumeProductStepIndex] = useState(0)
  const [hasSkippedProgress, setHasSkippedProgress] = useState(false)
  const [onboardingFieldCompletion, setOnboardingFieldCompletion] = useState<OnboardingFieldCompletionState>(
    createOnboardingFieldCompletionState()
  )
  const ingredientPickerCallbackRef = useRef<((id: string) => void) | null>(null)
  const progressKey = onboardingAccountId ? `${ONBOARDING_PROGRESS_KEY_PREFIX}:${onboardingAccountId}` : null

  function openIngredientPicker(callback: (id: string) => void) {
    ingredientPickerCallbackRef.current = callback
    setIngredientPickerSearch("")
    setIngredientPickerOpen(true)
  }

  function onIngredientPicked(id: string) {
    ingredientPickerCallbackRef.current?.(id)
    ingredientPickerCallbackRef.current = null
    setIngredientPickerOpen(false)
  }

  const selectAllOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select()
  }

  function confirmOnboardingField(field: OnboardingFieldKey, isValid: boolean) {
    // Evita que la guía salte al siguiente paso con el primer carácter.
    // Solo confirmamos el paso cuando el usuario sale del campo (onBlur) con valor válido.
    if (!onboardingProductGuide || !!editing) return
    setOnboardingFieldCompletion((prev) => (prev[field] === isValid ? prev : { ...prev, [field]: isValid }))
  }

  useEffect(() => {
    // Obtener usuario actual con permisos
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user)
        }
      })
      .catch(() => {
        console.error("Error fetching user")
      })
  }, [])

  useEffect(() => {
    if (!progressKey) {
      setResumeProductStepIndex(0)
      setHasSkippedProgress(false)
      return
    }
    try {
      const raw = localStorage.getItem(progressKey)
      if (!raw) {
        setResumeProductStepIndex(0)
        setHasSkippedProgress(false)
        return
      }
      const parsed = JSON.parse(raw) as { skipped?: boolean; stepIndex?: number; stepKey?: string | null }
      setHasSkippedProgress(Boolean(parsed.skipped))
      const isProductStep = typeof parsed.stepKey === "string" && parsed.stepKey.startsWith("products-")
      const stepIndex = Number.isFinite(parsed.stepIndex) ? Number(parsed.stepIndex) : 0
      setResumeProductStepIndex(isProductStep ? Math.max(0, stepIndex - onboardingStepOffset) : 0)
    } catch {
      setResumeProductStepIndex(0)
      setHasSkippedProgress(false)
    }
  }, [onboardingStepOffset, progressKey])

  function refresh(q?: string) {
    startLoading(async () => {
      try {
        const r = await listProducts({ query: q, take: PAGE_SIZE })
        setItems(r.items)
        setNextCursor(r.nextCursor)
      } catch {
        setItems([])
        setNextCursor(null)
      }
    })
  }

  useEffect(() => {
    refresh("")
    getAllSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
    getAllCategories().then(setCategories).catch(() => setCategories([]))
    listRecipeIngredientOptions().then(setIngredientOptions).catch(() => setIngredientOptions([]))
    getSettings()
      .then((s) => {
        setBarcodeLabelSize(s.barcodeLabelSize)
        setSalePricesIncludeItbis(s.salePricesIncludeItbis)
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    const q = query.trim()
    const t = setTimeout(() => refresh(q), 200)
    return () => clearTimeout(t)
  }, [query])

  function loadMore() {
    if (!nextCursor) return
    const q = query.trim()
    startLoading(async () => {
      try {
        const r = await listProducts({ query: q, cursor: nextCursor, take: PAGE_SIZE })
        setItems((prev) => [...prev, ...r.items])
        setNextCursor(r.nextCursor)
      } catch {
        setNextCursor(null)
      }
    })
  }

  function resetForm(p?: Product | null) {
    const x = p ?? null
    setEditing(x)
    setOnboardingFieldCompletion(createOnboardingFieldCompletionState())
    setName(x?.name ?? "")
    setSku(x?.sku ?? "")
    setReference(x?.reference ?? "")
    setSupplierId(x?.supplierId ?? "")
    setCategoryId(x?.categoryId ?? "")
    setPrice(((x?.priceCents ?? 0) / 100).toFixed(2))
    setCost(((x?.costCents ?? 0) / 100).toFixed(2))
    setItbisRateBp(x?.itbisRateBp ?? 1800)
    setIsAvailableForSale(x?.isAvailableForSale ?? true)
    const stockNum = x ? decimalToNumber(x.stock) : 0
    const minStockNum = x ? decimalToNumber(x.minStock) : 0
    setStock(String(stockNum))
    setMinStock(String(minStockNum))
    setImageUrls(x?.imageUrls ?? [])

    const nextType = getProductFormType(x)
    setProductType(nextType)

    if (nextType === "measured") {
      const nextUnit = (x?.unit as UnitType) ?? "UNIDAD"
      setUnit(nextUnit === "UNIDAD" ? "KG" : nextUnit)
    } else {
      setUnit("KG")
    }

    setRecipeItems(
      x?.recipeItems?.length
        ? x.recipeItems.map((item: Product["recipeItems"][number]) => ({
          id: item.id,
          ingredientId: item.ingredientId,
          qty: String(decimalToNumber(item.qty)),
        }))
        : [createRecipeItemRow()]
    )
  }

  const title = useMemo(() => (editing ? "Editar producto" : "Nuevo producto"), [editing])
  const bulkParsed = useMemo(() => parseBulkLines(bulkLines), [bulkLines])
  const inventoryPreviewPageCount = useMemo(
    () => Math.max(Math.ceil(inventoryRows.length / INVENTORY_PREVIEW_PAGE_SIZE), 1),
    [inventoryRows.length]
  )
  const inventoryPreviewRows = useMemo(() => {
    const start = inventoryPreviewPage * INVENTORY_PREVIEW_PAGE_SIZE
    return inventoryRows.slice(start, start + INVENTORY_PREVIEW_PAGE_SIZE)
  }, [inventoryRows, inventoryPreviewPage])
  const availableIngredients = useMemo(
    () => ingredientOptions.filter((option) => option.id !== editing?.id),
    [editing?.id, ingredientOptions]
  )

  useEffect(() => {
    if (inventoryPreviewPage > inventoryPreviewPageCount - 1) {
      setInventoryPreviewPage(0)
    }
  }, [inventoryPreviewPage, inventoryPreviewPageCount])

  function updateRecipeItem(rowId: string, field: "ingredientId" | "qty", value: string) {
    setRecipeItems((prev) => prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)))
  }

  function addRecipeItem() {
    setRecipeItems((prev) => [...prev, createRecipeItemRow()])
  }

  function removeRecipeItem(rowId: string) {
    setRecipeItems((prev) => {
      const next = prev.filter((row) => row.id !== rowId)
      return next.length ? next : [createRecipeItemRow()]
    })
  }

  function handleSupplierChange(value: string) {
    if (value === NONE_SUPPLIER_OPTION) {
      setSupplierId("")
      return
    }
    if (value === CREATE_SUPPLIER_OPTION) {
      setSupplierId("")
      setOpen(false)
      router.push("/suppliers")
      return
    }
    setSupplierId(value)
  }

  function handleCategoryChange(value: string) {
    if (value === NONE_CATEGORY_OPTION) {
      setCategoryId("")
      return
    }
    if (value === CREATE_CATEGORY_OPTION) {
      setCategoryId("")
      setOpen(false)
      router.push("/categories")
      return
    }
    setCategoryId(value)
  }

  async function onSave() {
    const trimmedName = name.trim()
    const priceCents = toCents(price)
    const costCents = toCents(cost)
    const shouldContinueOnboarding = onboardingProductGuide && !editing
    if (!trimmedName || priceCents <= 0 || costCents <= 0) {
      toast({ title: "Campos requeridos", description: "Hay que llenar todos los campos obligatorios.", variant: "destructive" })
      return
    }
    if (productType === "measured" && !unit) {
      toast({ title: "Campos requeridos", description: "Hay que llenar todos los campos obligatorios.", variant: "destructive" })
      return
    }
    startSaving(async () => {
      try {
        const productKind = productType === "recipe" ? "RECIPE" : productType === "measured" ? "MEASURED" : "BASIC"
        const finalUnit: UnitType =
          productType === "basic" || productType === "recipe" ? "UNIDAD" : unit
        const allowsDecimals = unitAllowsDecimals(finalUnit)
        const stockValue = productType === "recipe" ? 0 : allowsDecimals ? toDecimal(stock) : toInt(stock)
        const minStockValue = productType === "recipe" ? 0 : allowsDecimals ? toDecimal(minStock) : toInt(minStock)
        const normalizedRecipeItems =
          productType === "recipe"
            ? recipeItems
              .map((item) => ({
                ingredientId: item.ingredientId,
                qty: Number(item.qty),
              }))
              .filter((item) => item.ingredientId)
            : []

        const result = await upsertProduct({
          id: editing?.id,
          name,
          sku: sku || null,
          reference: reference || null,
          supplierId: supplierId || null,
          categoryId: categoryId || null,
          priceCents,
          costCents,
          itbisRateBp,
          isAvailableForSale,
          stock: stockValue,
          minStock: minStockValue,
          imageUrls,
          productKind,
          recipeItems: normalizedRecipeItems,
          unit: finalUnit,
        })
        if (!result.ok) {
          const isDuplicateSku = result.code === "SKU_DUPLICATE"
          toast({
            title: isDuplicateSku ? "SKU duplicado" : "Error",
            description: result.error,
            variant: "destructive",
            className: isDuplicateSku ? "border-red-300 bg-red-100 text-red-900" : undefined,
          })
          return
        }
        toast({ title: "Guardado", description: "Producto actualizado" })
        setOpen(false)
        resetForm(null)
        if (shouldContinueOnboarding) {
          refresh(query)
          listRecipeIngredientOptions().then(setIngredientOptions).catch(() => setIngredientOptions([]))
          router.push("/products?onboarding=sale-nav")
          return
        }
        refresh(query)
        listRecipeIngredientOptions().then(setIngredientOptions).catch(() => setIngredientOptions([]))
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "No se pudo guardar"
        const isDuplicateSku =
          /sku/i.test(errorMessage) &&
          /(ya existe|ya está en uso|ya esta en uso|duplicad|duplicate)/i.test(errorMessage)
        toast({
          title: isDuplicateSku ? "SKU duplicado" : "Error",
          description: errorMessage,
          variant: "destructive",
          className: isDuplicateSku ? "border-red-300 bg-red-100 text-red-900" : undefined,
        })
      }
    })
  }

  async function onBulkSave() {
    const { items: parsedItems, errors } = parseBulkLines(bulkLines)
    if (!parsedItems.length) {
      toast({ title: "Sin datos", description: "Ingresa al menos un ID y cantidad.", variant: "destructive" })
      return
    }
    if (errors.length) {
      toast({ title: "Revisa el formato", description: errors[0], variant: "destructive" })
      return
    }
    startBulkSaving(async () => {
      try {
        await adjustManyStock({
          items: parsedItems,
          reason: bulkReason,
        })
        toast({ title: "Ajustes aplicados", description: "Inventario actualizado correctamente." })
        setBulkOpen(false)
        setBulkLines("")
        refresh(query)
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo aplicar el ajuste masivo" })
      }
    })
  }

  function resetInventoryImportState() {
    setInventoryFile(null)
    setInventoryRows([])
    setInventoryParseError(null)
    setInventoryProgress(0)
    setInventoryStatus("Listo para cargar")
    setInventorySummary(null)
    setInventoryPreviewPage(0)
    setIsInventoryDragOver(false)
    setIsInventoryUploading(false)
    if (inventoryFileInputRef.current) {
      inventoryFileInputRef.current.value = ""
    }
  }

  function closeInventoryImportModal() {
    resetInventoryImportState()
    setInventoryBulkOpen(false)
  }

  function resetProductImageImportState() {
    setProductImageGroups([])
    setProductImageParseErrors([])
    setProductImageProgress(0)
    setProductImageStatus("Listo para cargar")
    setProductImageSummary(null)
    setIsProductImageDragOver(false)
    setIsProductImageUploading(false)
    if (productImageFileInputRef.current) {
      productImageFileInputRef.current.value = ""
    }
  }

  function closeProductImageImportModal() {
    resetProductImageImportState()
    setProductImageBulkOpen(false)
  }

  async function loadProductImageFiles(files: File[]) {
    setProductImageParseErrors([])
    setProductImageSummary(null)
    setProductImageProgress(0)

    const filteredFiles = files.filter((file) => !!file)
    if (!filteredFiles.length) {
      throw new Error("No se detectaron archivos para cargar")
    }
    if (filteredFiles.length > PRODUCT_IMAGE_IMPORT_MAX_FILES) {
      throw new Error(`Máximo ${PRODUCT_IMAGE_IMPORT_MAX_FILES} imágenes por carga`)
    }

    const { groups, errors } = buildProductImageImportGroups(filteredFiles)
    if (!groups.length) {
      throw new Error(errors[0] ?? "No se encontraron archivos válidos para importar")
    }

    setProductImageGroups(groups)
    setProductImageParseErrors(errors)
    if (errors.length) {
      setProductImageStatus(`${groups.length} producto(s) listo(s) · ${errors.length} archivo(s) con observaciones`)
    } else {
      setProductImageStatus(`${groups.length} producto(s) listo(s) para importar`)
    }
  }

  function onProductImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    void loadProductImageFiles(files).catch((error) => {
      const message = error instanceof Error ? error.message : "No se pudieron procesar los archivos"
      setProductImageGroups([])
      setProductImageStatus("Listo para cargar")
      setProductImageParseErrors([message])
    })
  }

  function onProductImageDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsProductImageDragOver(false)
    const files = Array.from(event.dataTransfer.files ?? [])
    if (!files.length) return
    void loadProductImageFiles(files).catch((error) => {
      const message = error instanceof Error ? error.message : "No se pudieron procesar los archivos"
      setProductImageGroups([])
      setProductImageStatus("Listo para cargar")
      setProductImageParseErrors([message])
    })
  }

  function onProductImageDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsProductImageDragOver(true)
  }

  function onProductImageDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsProductImageDragOver(false)
  }

  async function uploadProductImageFile(file: File) {
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch("/api/upload-product-image", {
      method: "POST",
      body: formData,
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error ?? "")
          : ""
      throw new Error(message || "No se pudo subir la imagen")
    }

    if (!payload || typeof payload !== "object" || !("url" in payload)) {
      throw new Error("La subida no devolvió URL válida")
    }

    const url = String((payload as { url?: unknown }).url ?? "").trim()
    if (!url) {
      throw new Error("La subida no devolvió URL válida")
    }

    return url
  }

  async function onProductImageUpload() {
    if (!canImportProductImages) {
      toast({
        title: "Sin permiso",
        description: "No tienes permiso para importar imágenes de productos.",
        variant: "destructive",
      })
      return
    }

    if (!productImageGroups.length) {
      toast({
        title: "Sin datos",
        description: "Selecciona archivos de imagen para continuar.",
        variant: "destructive",
      })
      return
    }

    setIsProductImageUploading(true)
    setProductImageSummary(null)
    setProductImageProgress(0)
    setProductImageStatus("Iniciando carga...")

    const allResults: BulkProductImageImportRowResult[] = []
    let updated = 0
    let failed = 0
    let processed = 0
    const total = productImageGroups.length
    let operationId: string | null = null
    let finalized = false

    try {
      const started = await startInventoryBulkOperation({
        source: "BULK_EXCEL",
        reason: PRODUCT_IMAGE_IMPORT_REASON,
        totalRows: total,
      })
      operationId = started.operationId

      for (let start = 0; start < total; start += PRODUCT_IMAGE_IMPORT_CHUNK_SIZE) {
        const chunk = productImageGroups.slice(start, start + PRODUCT_IMAGE_IMPORT_CHUNK_SIZE)
        const chunkEnd = Math.min(start + chunk.length, total)
        setProductImageStatus(`Procesando ${chunkEnd}/${total}`)

        const preparedRows: BulkProductImageImportRow[] = []

        for (const group of chunk) {
          try {
            const imageUrls = await Promise.all(group.files.map((file) => uploadProductImageFile(file)))
            preparedRows.push({
              rowNumber: group.rowNumber,
              productId: group.productId,
              imageUrls,
            })
          } catch (error) {
            failed += 1
            allResults.push({
              rowNumber: group.rowNumber,
              productId: group.productId,
              status: "FAILED",
              message: error instanceof Error ? error.message : "No se pudieron subir las imágenes",
            })
          }
        }

        if (preparedRows.length) {
          try {
            const result = await importProductImagesChunk({
              operationId,
              rows: preparedRows,
              reason: PRODUCT_IMAGE_IMPORT_REASON,
            })
            updated += result.updated
            failed += result.failed
            allResults.push(...result.results)
          } catch (error) {
            const message = error instanceof Error ? error.message : "Error al actualizar imágenes en el lote"
            failed += preparedRows.length
            allResults.push(
              ...preparedRows.map((row) => ({
                rowNumber: row.rowNumber,
                productId: row.productId,
                status: "FAILED" as const,
                message,
              })),
            )
          }
        }

        processed += chunk.length
        setProductImageProgress(Math.min(Math.round((processed / total) * 100), 100))
      }

      await finalizeInventoryBulkOperation({
        operationId,
        status: "COMPLETED",
        totalRows: total,
        createdCount: 0,
        updatedCount: updated,
        failedCount: failed,
      })
      finalized = true

      const summary: ProductImageImportSummary = {
        total,
        updated,
        failed,
        results: allResults,
      }

      setProductImageSummary(summary)
      setProductImageStatus("Carga finalizada")
      refresh(query)

      if (failed > 0) {
        toast({
          title: "Carga completada con observaciones",
          description: `Actualizados: ${updated}, errores: ${failed}`,
        })
      } else {
        toast({
          title: "Carga completada",
          description: `Se actualizaron ${updated} producto(s).`,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo completar la carga de imágenes"
      setProductImageStatus("Carga fallida")
      if (operationId && !finalized) {
        try {
          await finalizeInventoryBulkOperation({
            operationId,
            status: "FAILED",
            totalRows: total,
            createdCount: 0,
            updatedCount: updated,
            failedCount: Math.max(failed, total - processed),
            errorMessage: message,
          })
        } catch {
          // Ignore finalize errors; el error principal se muestra al usuario.
        }
      }
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsProductImageUploading(false)
    }
  }

  function downloadProductImageErrorReport() {
    if (!productImageSummary) return
    const failedRows = productImageSummary.results.filter((item) => item.status === "FAILED")
    if (!failedRows.length) return

    const rowByNumber = new Map(productImageGroups.map((group) => [group.rowNumber, group]))
    const reportRows = failedRows.map((item) => {
      const sourceRow = rowByNumber.get(item.rowNumber)
      return {
        fila: item.rowNumber,
        id_producto: item.productId || sourceRow?.productId || "",
        archivos: sourceRow?.fileNames.join(", ") ?? "",
        error: item.message,
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(reportRows)
    worksheet["!cols"] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 50 },
      { wch: 60 },
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Errores")
    const date = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `reporte_errores_carga_imagenes_${date}.xlsx`)
  }

  function downloadInventoryTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet([
      [...INVENTORY_TEMPLATE_HEADERS],
      [
        "Ejemplo producto",
        "SKU-001",
        "REF-001",
        "BASICO",
        "",
        150,
        100,
        18,
        25,
        5,
        "General",
        "Proveedor A",
      ],
    ])
    worksheet["!cols"] = INVENTORY_TEMPLATE_HEADERS.map((header) => ({ wch: Math.max(header.length + 4, 16) }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Plantilla")
    XLSX.writeFile(workbook, "plantilla_inventario_masivo.xlsx")
  }

  async function parseInventoryFile(file: File) {
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      throw new Error("Formato inválido. Solo se permiten archivos .xlsx o .xls")
    }
    if (file.size > INVENTORY_IMPORT_MAX_FILE_SIZE) {
      throw new Error("El archivo supera el límite de 10 MB")
    }

    setInventoryStatus("Leyendo archivo...")
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: "array" })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      throw new Error("El archivo no contiene hojas")
    }

    setInventoryStatus("Validando archivo...")
    const worksheet = workbook.Sheets[firstSheetName]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" })
    if (rawRows.length > INVENTORY_IMPORT_MAX_ROWS) {
      throw new Error(`El archivo supera el límite de ${INVENTORY_IMPORT_MAX_ROWS} filas`)
    }

    const mappedRows = mapExcelRowsToImportRows(rawRows)
    const nonEmptyRows = mappedRows.filter((row) =>
      Object.entries(row).some(([key, value]) => key !== "rowNumber" && hasCellValue(value)),
    )
    if (!nonEmptyRows.length) {
      throw new Error("No se encontraron filas con datos en el archivo")
    }
    if (nonEmptyRows.length > INVENTORY_IMPORT_MAX_ROWS) {
      throw new Error(`El archivo supera el límite de ${INVENTORY_IMPORT_MAX_ROWS} filas`)
    }

    return nonEmptyRows
  }

  async function loadInventoryFile(file: File) {
    setInventoryParseError(null)
    setInventorySummary(null)
    setInventoryProgress(0)
    try {
      const parsedRows = await parseInventoryFile(file)
      setInventoryFile(file)
      setInventoryRows(parsedRows)
      setInventoryPreviewPage(0)
      setInventoryStatus(`${parsedRows.length} fila(s) lista(s) para importar`)
    } catch (error) {
      setInventoryFile(null)
      setInventoryRows([])
      setInventoryStatus("Listo para cargar")
      if (inventoryFileInputRef.current) {
        inventoryFileInputRef.current.value = ""
      }
      const message = error instanceof Error ? error.message : "No se pudo leer el archivo"
      setInventoryParseError(message)
    }
  }

  function onInventoryFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    void loadInventoryFile(file)
  }

  function onInventoryDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsInventoryDragOver(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    void loadInventoryFile(file)
  }

  function onInventoryDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsInventoryDragOver(true)
  }

  function onInventoryDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsInventoryDragOver(false)
  }

  async function onInventoryUpload() {
    if (!canAdjustStock) {
      toast({ title: "Sin permiso", description: "No tienes permiso para importar productos.", variant: "destructive" })
      return
    }

    if (!inventoryRows.length) {
      toast({ title: "Sin datos", description: "Selecciona un archivo con filas para importar.", variant: "destructive" })
      return
    }

    setIsInventoryUploading(true)
    setInventorySummary(null)
    setInventoryParseError(null)
    setInventoryProgress(0)
    setInventoryStatus("Iniciando carga...")

    const allResults: BulkProductImportRowResult[] = []
    let created = 0
    let updated = 0
    let failed = 0
    let processed = 0
    const total = inventoryRows.length
    let operationId: string | null = null
    let finalized = false

    try {
      const started = await startInventoryBulkOperation({
        source: "BULK_EXCEL",
        reason: "Importación masiva Excel",
        totalRows: total,
      })
      operationId = started.operationId

      for (let start = 0; start < total; start += INVENTORY_IMPORT_CHUNK_SIZE) {
        const chunk = inventoryRows.slice(start, start + INVENTORY_IMPORT_CHUNK_SIZE)
        const chunkEnd = Math.min(start + chunk.length, total)
        setInventoryStatus(`Procesando ${chunkEnd}/${total}`)

        try {
          const result = await importProductsChunk({
            operationId,
            rows: chunk,
            reason: "Importación masiva Excel",
          })
          created += result.created
          updated += result.updated
          failed += result.failed
          allResults.push(...result.results)
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error al procesar el lote"
          failed += chunk.length
          allResults.push(
            ...chunk.map((row) => ({
              rowNumber: row.rowNumber,
              status: "FAILED" as const,
              sku: row.sku ?? null,
              name: row.nombre,
              message,
            })),
          )
        }

        processed += chunk.length
        setInventoryProgress(Math.min(Math.round((processed / total) * 100), 100))
      }

      await finalizeInventoryBulkOperation({
        operationId,
        status: "COMPLETED",
        totalRows: total,
        createdCount: created,
        updatedCount: updated,
        failedCount: failed,
      })
      finalized = true

      const summary: InventoryImportSummary = {
        total,
        created,
        updated,
        failed,
        results: allResults,
      }
      setInventorySummary(summary)
      setInventoryStatus("Carga finalizada")
      refresh(query)

      if (failed > 0) {
        toast({
          title: "Carga completada con observaciones",
          description: `Creados: ${created}, actualizados: ${updated}, errores: ${failed}`,
        })
      } else {
        toast({
          title: "Carga completada",
          description: `Se procesaron ${total} fila(s) correctamente.`,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo completar la carga masiva"
      setInventoryStatus("Carga fallida")
      if (operationId && !finalized) {
        try {
          await finalizeInventoryBulkOperation({
            operationId,
            status: "FAILED",
            totalRows: total,
            createdCount: created,
            updatedCount: updated,
            failedCount: Math.max(failed, total - processed),
            errorMessage: message,
          })
        } catch {
          // Ignore finalize errors; el error principal se muestra al usuario.
        }
      }
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsInventoryUploading(false)
    }
  }

  function downloadInventoryErrorReport() {
    if (!inventorySummary) return
    const failedRows = inventorySummary.results.filter((item) => item.status === "FAILED")
    if (!failedRows.length) return

    const rowByNumber = new Map(inventoryRows.map((row) => [row.rowNumber, row]))
    const reportRows = failedRows.map((item) => {
      const sourceRow = rowByNumber.get(item.rowNumber)
      return {
        fila: item.rowNumber,
        sku: item.sku ?? sourceRow?.sku ?? "",
        nombre: item.name ?? sourceRow?.nombre ?? "",
        error: item.message,
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(reportRows)
    worksheet["!cols"] = [
      { wch: 8 },
      { wch: 20 },
      { wch: 40 },
      { wch: 60 },
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Errores")
    const date = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `reporte_errores_inventario_masivo_${date}.xlsx`)
  }

  function openMovements(product: Product) {
    setMovementsProduct(product)
    setMovementsOpen(true)
    setMovementsPage(0)
    setMovements([])
    startMovementsLoading(async () => {
      try {
        const data = await listProductMovements({ productId: product.id, take: 500 })
        setMovements(data)
      } catch (e) {
        setMovements([])
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudieron cargar los movimientos" })
      }
    })
  }

  async function onDelete(id: string) {
    if (!confirm("¿Desactivar este producto?")) return
    try {
      await deactivateProduct(id)
      toast({ title: "Listo", description: "Producto desactivado" })
      refresh(query)
    } catch {
      toast({ title: "Error", description: "No se pudo desactivar" })
    }
  }

  const totalProducts = items.length
  const canAdjustStock = !!user && (user.canAdjustInventory || user.isOwner)
  const canImportProductImages = !!user && (user.canEditProducts || user.isOwner)
  const movementInitial = useMemo(() => movements.find((m) => m.type === "INITIAL") ?? null, [movements])
  const movementItems = useMemo(() => movements.filter((m) => m.type !== "INITIAL"), [movements])
  const movementPageSize = 10
  const movementPageCount = Math.max(Math.ceil(movementItems.length / movementPageSize), 1)
  const movementStart = movementsPage * movementPageSize
  const movementPageItems = movementItems.slice(movementStart, movementStart + movementPageSize)
  const inventoryPreviewStart = inventoryRows.length ? inventoryPreviewPage * INVENTORY_PREVIEW_PAGE_SIZE + 1 : 0
  const inventoryPreviewEnd = Math.min((inventoryPreviewPage + 1) * INVENTORY_PREVIEW_PAGE_SIZE, inventoryRows.length)
  const productGuideState = useMemo(() => {
    if (!onboardingProductGuide || isOnboardingGuideClosed) return null

    const canSeeCost = Boolean(user?.canViewProductCosts || user?.isOwner)
    const parsedStock = Number(stock.replace(",", "."))
    const steps: Array<{ complete: boolean; step: OnboardingGuideStep }> = [
      {
        complete: open,
        step: {
          target: "products-new-button",
          title: "Crea el producto desde aquí",
          description: "Haz clic en Nuevo. Este es el mismo formulario que usarás todos los días para registrar productos.",
        },
      },
      {
        complete: productType === "basic",
        step: {
          target: "products-basic-tab",
          title: "Mantén Producto básico",
          description: "Para la primera práctica usa Producto básico. Es el tipo normal para productos que vendes por unidad.",
        },
      },
      {
        complete: onboardingFieldCompletion.name && name.trim().length > 0,
        step: {
          target: "products-name-input",
          title: "Escribe el nombre del producto",
          description: "Usa un nombre que puedas buscar luego a la hora de vender.",
        },
      },
      {
        complete: onboardingFieldCompletion.price && toCents(price) > 0,
        step: {
          target: "products-price-input",
          title: "Indica el precio de venta",
          description: "Este es el precio que verá el cliente cuando vendas el producto.",
        },
      },
      ...(canSeeCost
        ? [{
          complete: onboardingFieldCompletion.cost && toCents(cost) > 0,
          step: {
            target: "products-cost-input",
            title: "Registra el costo",
            description: "El costo permite calcular tu ganancia más luego. Puedes usar un valor aproximado si todavía no tienes el costo exacto.",
          },
        }]
        : []),
      {
        complete: onboardingFieldCompletion.stock && Number.isFinite(parsedStock) && parsedStock > 0,
        step: {
          target: "products-stock-input",
          title: "Agrega la cantidad de existencia inicial.",
          description: "Escribe cuántas unidades tienes disponibles para poder vender este producto.",
        },
      },
      {
        complete: isAvailableForSale,
        step: {
          target: "products-availability-switch",
          title: "Déjalo disponible para venta",
          description: "Este interruptor debe estar activo para que el producto aparezca en la pantalla de ventas.",
        },
      },
      {
        complete: false,
        step: {
          target: "products-save-button",
          title: "Guarda el producto",
          description: "Al guardar, el producto quedará disponible en inventario y pasaremos a hacer una venta real.",
        },
      },
    ]

    const firstIncompleteIndex = steps.findIndex((item) => !item.complete)
    const fallbackIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : steps.length - 1
    const activeIndex = clampIndex(Math.max(fallbackIndex, resumeProductStepIndex), steps.length)
    return {
      step: steps[activeIndex]?.step ?? null,
      stepIndex: activeIndex,
      totalSteps: steps.length,
      stepKey: `products-step-${activeIndex + onboardingStepOffset}`,
    }
  }, [
    cost,
    isAvailableForSale,
    isOnboardingGuideClosed,
    name,
    onboardingProductGuide,
    open,
    onboardingFieldCompletion.cost,
    onboardingFieldCompletion.name,
    onboardingFieldCompletion.price,
    onboardingFieldCompletion.stock,
    price,
    productType,
    resumeProductStepIndex,
    stock,
    user?.canViewProductCosts,
    user?.isOwner,
  ])

  useEffect(() => {
    if (movementsPage > movementPageCount - 1) {
      setMovementsPage(0)
    }
  }, [movementsPage, movementPageCount])

  return (
    <div className="grid gap-6">
      {productGuideState?.step ? (
        <OnboardingGuide
          accountId={onboardingAccountId}
          step={productGuideState.step}
          stepIndex={productGuideState.stepIndex + onboardingStepOffset}
          totalSteps={productGuideState.totalSteps + onboardingStepOffset}
          onClose={() => setIsOnboardingGuideClosed(true)}
          onSkip={() => setHasSkippedProgress(true)}
          progressKey={progressKey ?? undefined}
          stepKey={productGuideState.stepKey}
          resumePath="/products?onboarding=product"
        />
      ) : null}
      {onboardingSaleNavGuide && !isOnboardingGuideClosed && !hasSkippedProgress ? (
        <OnboardingGuide
          accountId={onboardingAccountId}
          step={{
            target: "app-nav-sales",
            title: "Ahora entra a Vender",
            description: "Haz clic en el botón Vender del menú. Ahí harás la primera venta usando el flujo normal.",
          }}
          stepIndex={9}
          totalSteps={10}
          onClose={() => setIsOnboardingGuideClosed(true)}
          onSkip={() => setHasSkippedProgress(true)}
          progressKey={progressKey ?? undefined}
          stepKey="products-go-to-sales"
          resumePath="/products?onboarding=sale-nav"
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-purple-primary bg-purple-50 dark:bg-purple-950/20">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total de productos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-purple-primary">{totalProducts}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Productos</CardTitle>
            <div className="text-sm text-muted-foreground">Descripción, código (SKU), referencia, precio y existencia.</div>
          </div>
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Dialog
                open={inventoryBulkOpen}
                onOpenChange={(v) => {
                  setInventoryBulkOpen(v)
                  if (!v) resetInventoryImportState()
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={!canAdjustStock}
                        className="bg-green-100 border-green-300 text-green-900 hover:bg-green-200"
                      >
                        Inventario masivo
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Carga masiva desde Excel</p>
                  </TooltipContent>
                </Tooltip>
                <DialogContent className="sm:max-w-[780px] max-h-[90vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Inventario masivo</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-6 overflow-y-auto pr-1">
                    <div className="grid gap-2">
                      <div className="text-sm font-medium">Primer paso: descargar plantilla</div>
                      <div className="text-xs text-muted-foreground">
                        Usa esta plantilla para completar productos. Campos requeridos para crear: nombre, precio_venta y costo.
                      </div>
                      <div>
                        <Button type="button" variant="secondary" onClick={downloadInventoryTemplate}>
                          Descargar plantilla
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-2">
                      <div className="text-sm font-medium">Segundo paso: subir archivo con productos</div>
                      <div
                        role="button"
                        tabIndex={0}
                        onDragOver={onInventoryDragOver}
                        onDragLeave={onInventoryDragLeave}
                        onDrop={onInventoryDrop}
                        onClick={() => inventoryFileInputRef.current?.click()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            inventoryFileInputRef.current?.click()
                          }
                        }}
                        className={`relative rounded-lg border-2 border-dashed p-10 text-center transition-colors ${isInventoryDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
                          }`}
                      >
                        <input
                          ref={inventoryFileInputRef}
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={onInventoryFileChange}
                          className="hidden"
                        />
                        <div className="flex flex-col items-center gap-2">
                          <Plus className="h-8 w-8 text-primary" />
                          <div className="text-sm font-medium">Arrastra y suelta el archivo aquí</div>
                          <div className="text-xs text-muted-foreground">o haz click para seleccionar (.xlsx, .xls)</div>
                          <div className="text-xs text-muted-foreground">Máximo 10 MB y 5,000 filas</div>
                        </div>
                      </div>
                      {inventoryFile && (
                        <div className="text-xs text-muted-foreground">
                          Archivo: <span className="font-medium">{inventoryFile.name}</span> · Filas detectadas:{" "}
                          <span className="font-medium">{inventoryRows.length}</span>
                        </div>
                      )}
                      {inventoryParseError && (
                        <div className="text-xs text-red-500">{inventoryParseError}</div>
                      )}
                    </div>

                    {inventoryRows.length > 0 && (
                      <div className="grid gap-2">
                        <div className="text-sm font-medium">Vista previa del archivo</div>
                        <div className="text-xs text-muted-foreground">
                          Revisa los productos antes de confirmar la carga. Esta tabla es solo de lectura.
                        </div>
                        <div className="max-h-[320px] overflow-auto rounded-md border">
                          <Table className="min-w-[1300px] text-xs">
                            <TableHeader>
                              <TableRow>
                                <TableHead>Fila</TableHead>
                                <TableHead>Nombre</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead>Referencia</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Unidad</TableHead>
                                <TableHead className="text-right">Precio venta</TableHead>
                                <TableHead className="text-right">Costo</TableHead>
                                <TableHead className="text-right">ITBIS</TableHead>
                                <TableHead className="text-right">Existencia</TableHead>
                                <TableHead className="text-right">Existencia minima</TableHead>
                                <TableHead>Categoria</TableHead>
                                <TableHead>Proveedor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {inventoryPreviewRows.map((row) => (
                                <TableRow key={row.rowNumber}>
                                  <TableCell>{row.rowNumber}</TableCell>
                                  <TableCell>{formatInventoryPreviewValue(row.nombre)}</TableCell>
                                  <TableCell>{formatInventoryPreviewValue(row.sku)}</TableCell>
                                  <TableCell>{formatInventoryPreviewValue(row.referencia)}</TableCell>
                                  <TableCell>{formatInventoryPreviewValue(row.tipo_producto)}</TableCell>
                                  <TableCell>{formatInventoryPreviewValue(row.unidad)}</TableCell>
                                  <TableCell className="text-right">{formatInventoryPreviewValue(row.precio_venta)}</TableCell>
                                  <TableCell className="text-right">{formatInventoryPreviewValue(row.costo)}</TableCell>
                                  <TableCell className="text-right">{formatInventoryPreviewValue(row.itbis)}</TableCell>
                                  <TableCell className="text-right">{formatInventoryPreviewValue(row.stock)}</TableCell>
                                  <TableCell className="text-right">{formatInventoryPreviewValue(row.stock_minimo)}</TableCell>
                                  <TableCell>{formatInventoryPreviewValue(row.categoria)}</TableCell>
                                  <TableCell>{formatInventoryPreviewValue(row.proveedor)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            Mostrando {inventoryPreviewStart}-{inventoryPreviewEnd} de {inventoryRows.length} fila(s)
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setInventoryPreviewPage((prev) => Math.max(prev - 1, 0))}
                              disabled={inventoryPreviewPage === 0}
                            >
                              Anterior
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setInventoryPreviewPage((prev) => Math.min(prev + 1, inventoryPreviewPageCount - 1))}
                              disabled={inventoryPreviewPage >= inventoryPreviewPageCount - 1}
                            >
                              Siguiente
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{inventoryStatus}</span>
                        <span>{inventoryProgress}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary transition-all"
                          style={{ width: `${inventoryProgress}%` }}
                        />
                      </div>
                    </div>

                    {inventorySummary && (
                      <div className="rounded-md border p-3 text-sm">
                        <div className="font-medium">Resultado de la carga</div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          <div>Total filas: {inventorySummary.total}</div>
                          <div>Creados: {inventorySummary.created}</div>
                          <div>Actualizados por SKU: {inventorySummary.updated}</div>
                          <div>Errores: {inventorySummary.failed}</div>
                        </div>
                        {inventorySummary.failed > 0 && (
                          <div className="mt-3">
                            <Button type="button" variant="outline" size="sm" onClick={downloadInventoryErrorReport}>
                              Descargar reporte de errores
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="secondary" onClick={closeInventoryImportModal} type="button">
                      Cerrar
                    </Button>
                    <Button
                      onClick={onInventoryUpload}
                      disabled={isInventoryUploading || !inventoryRows.length || !canAdjustStock}
                      type="button"
                    >
                      {isInventoryUploading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" /> Cargar
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog
                open={productImageBulkOpen}
                onOpenChange={(v) => {
                  setProductImageBulkOpen(v)
                  if (!v) resetProductImageImportState()
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={!canImportProductImages}
                        className="bg-blue-100 border-blue-300 text-blue-900 hover:bg-blue-200"
                      >
                        Cargar imágenes masivamente
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Actualizar imágenes por ID de producto</p>
                  </TooltipContent>
                </Tooltip>
                <DialogContent className="sm:max-w-[780px] max-h-[90vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Cargar imágenes masivamente</DialogTitle>
                  </DialogHeader>

                  <div className="grid gap-6 overflow-y-auto pr-1">
                    <div className="grid gap-2 text-xs text-muted-foreground">
                      <div className="text-sm font-medium text-foreground">Reglas del importador</div>
                      <div>1. El nombre del archivo debe iniciar con el ID del producto (ej: 123.jpg, 123-1.png, 123_frente.webp).</div>
                      <div>2. Máximo {PRODUCT_IMAGE_MAX_PER_PRODUCT} imágenes por producto.</div>
                      <div>3. Solo imágenes y máximo 2MB por archivo.</div>
                      <div>4. Máximo {PRODUCT_IMAGE_IMPORT_MAX_FILES} imágenes por carga.</div>
                    </div>

                    <Separator />

                    <div className="grid gap-2">
                      <div className="text-sm font-medium">Selecciona o arrastra imágenes</div>
                      <div
                        role="button"
                        tabIndex={0}
                        onDragOver={onProductImageDragOver}
                        onDragLeave={onProductImageDragLeave}
                        onDrop={onProductImageDrop}
                        onClick={() => productImageFileInputRef.current?.click()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            productImageFileInputRef.current?.click()
                          }
                        }}
                        className={`relative rounded-lg border-2 border-dashed p-10 text-center transition-colors ${isProductImageDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
                          }`}
                      >
                        <input
                          ref={productImageFileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={onProductImageFileChange}
                          className="hidden"
                        />
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="h-8 w-8 text-primary" />
                          <div className="text-sm font-medium">Arrastra y suelta imágenes aquí</div>
                          <div className="text-xs text-muted-foreground">o haz click para seleccionar múltiples archivos</div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Productos detectados: <span className="font-medium">{productImageGroups.length}</span> ·
                        Archivos válidos: <span className="font-medium">{productImageGroups.reduce((acc, group) => acc + group.files.length, 0)}</span>
                      </div>
                      {productImageParseErrors.length > 0 && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          <div className="font-medium">Observaciones ({productImageParseErrors.length})</div>
                          <div className="mt-1 grid gap-1">
                            {productImageParseErrors.slice(0, 8).map((error, index) => (
                              <div key={`${error}-${index}`}>• {error}</div>
                            ))}
                            {productImageParseErrors.length > 8 && (
                              <div>• ... y {productImageParseErrors.length - 8} más</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {productImageGroups.length > 0 && (
                      <div className="grid gap-2">
                        <div className="text-sm font-medium">Vista previa por producto</div>
                        <div className="max-h-[320px] overflow-auto rounded-md border">
                          <Table className="min-w-[700px] text-xs">
                            <TableHeader>
                              <TableRow>
                                <TableHead>Fila</TableHead>
                                <TableHead>ID producto</TableHead>
                                <TableHead className="text-right">Cant. imágenes</TableHead>
                                <TableHead>Archivos</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {productImageGroups.map((group) => (
                                <TableRow key={`${group.productId}-${group.rowNumber}`}>
                                  <TableCell>{group.rowNumber}</TableCell>
                                  <TableCell>{group.productId}</TableCell>
                                  <TableCell className="text-right">{group.files.length}</TableCell>
                                  <TableCell className="max-w-[420px] truncate">{group.fileNames.join(", ")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{productImageStatus}</span>
                        <span>{productImageProgress}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary transition-all"
                          style={{ width: `${productImageProgress}%` }}
                        />
                      </div>
                    </div>

                    {productImageSummary && (
                      <div className="rounded-md border p-3 text-sm">
                        <div className="font-medium">Resultado de la carga</div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          <div>Total productos: {productImageSummary.total}</div>
                          <div>Actualizados: {productImageSummary.updated}</div>
                          <div>Errores: {productImageSummary.failed}</div>
                        </div>
                        {productImageSummary.failed > 0 && (
                          <div className="mt-3">
                            <Button type="button" variant="outline" size="sm" onClick={downloadProductImageErrorReport}>
                              Descargar reporte de errores
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button variant="secondary" onClick={closeProductImageImportModal} type="button">
                      Cerrar
                    </Button>
                    <Button
                      onClick={onProductImageUpload}
                      disabled={isProductImageUploading || !productImageGroups.length || !canImportProductImages}
                      type="button"
                    >
                      {isProductImageUploading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" /> Cargar
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button variant="outline" disabled={!canAdjustStock}>Ajuste masivo</Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Ajuste de inventario rápido</p>
                  </TooltipContent>
                </Tooltip>
                <DialogContent className="sm:max-w-[720px] max-h-[90vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Ajuste masivo de inventario</DialogTitle>
                  </DialogHeader>

                  <div className="overflow-y-auto pr-1">
                    <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-md mb-2">
                      <p className="font-medium text-foreground mb-1">¿Cómo funciona?</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Escribe el <strong>ID del producto</strong> seguido de un espacio o tabulación, y luego la <strong>cantidad</strong> a ajustar.</li>
                        <li>Usa el signo <code className="bg-muted px-1 rounded text-primary">+</code> para aumentar la existencia o <code className="bg-muted px-1 rounded text-red-500">-</code> para disminuirla.</li>
                        <li>Coloca un producto por línea.</li>
                      </ul>
                      <p className="mt-2 text-xs italic">Tip: Puedes copiar y pegar directamente desde dos columnas de Excel o Google Sheets.</p>
                    </div>

                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label>Motivo (opcional)</Label>
                        <Input
                          value={bulkReason}
                          onChange={(e) => setBulkReason(e.target.value)}
                          placeholder="Ej: Conteo físico"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>IDs y cantidades (una línea por producto)</Label>
                        <Textarea
                          value={bulkLines}
                          onChange={(e) => setBulkLines(e.target.value)}
                          rows={8}
                          placeholder={"101\t+5\n102\t-2"}
                          className="font-mono"
                        />
                        <div className="text-xs text-muted-foreground">
                          Formato: ID y cantidad (usa + o -). Puedes pegar desde Excel/Sheets (tabulado).
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Líneas válidas: {bulkParsed.items.length}
                        {bulkParsed.errors.length > 0 ? ` · Errores: ${bulkParsed.errors.length}` : ""}
                      </div>
                      {bulkParsed.errors.length > 0 && (
                        <div className="text-xs text-red-500">{bulkParsed.errors[0]}</div>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="secondary" onClick={() => setBulkOpen(false)} type="button">Cancelar</Button>
                    <Button onClick={onBulkSave} disabled={isBulkSaving || !canAdjustStock} type="button">
                      {isBulkSaving ? "Aplicando…" : "Aplicar ajustes"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(null) }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button data-onboarding-target="products-new-button" onClick={() => { resetForm(null); setOpen(true) }}>
                        <Plus className="mr-2 h-4 w-4" /> Nuevo
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Crear un nuevo producto</p>
                  </TooltipContent>
                </Tooltip>
                <DialogContent className="sm:max-w-[620px] max-h-[90vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                  </DialogHeader>

                  <Tabs value={productType} onValueChange={(v) => setProductType(v as ProductFormType)} className="flex-1 flex flex-col min-h-0">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="basic" data-onboarding-target="products-basic-tab">Producto básico</TabsTrigger>
                      <TabsTrigger value="measured">Producto con medidas</TabsTrigger>
                      <TabsTrigger value="recipe">Productos por receta</TabsTrigger>
                    </TabsList>

                    <div className="flex-1 overflow-y-auto pr-2 mt-4">
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label>ID</Label>
                          <Input
                            value={editing ? editing.productId : "Se asignará automáticamente"}
                            disabled
                            className="bg-muted"
                          />
                        </div>

                        <div className="grid gap-2" data-onboarding-target="products-name-input">
                          <Label>
                            Nombre del producto <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={(e) => confirmOnboardingField("name", e.target.value.trim().length > 0)}
                            placeholder="Ej: Coca-Cola 20 oz"
                            required
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="grid gap-2">
                            <Label>Código de proveedor (SKU) (opcional)</Label>
                            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej: 12345" />
                          </div>
                          <div className="grid gap-2">
                            <Label>Referencia</Label>
                            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: REF-01" />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="grid gap-2">
                            <Label>Proveedor (opcional)</Label>
                            <Select value={supplierId || NONE_SUPPLIER_OPTION} onValueChange={handleSupplierChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Sin proveedor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE_SUPPLIER_OPTION}>Sin proveedor</SelectItem>
                                {suppliers.length === 0 ? (
                                  <>
                                    <SelectSeparator />
                                    <SelectItem value={CREATE_SUPPLIER_OPTION}>
                                      <span className="inline-flex items-center gap-2">
                                        <Plus className="h-4 w-4" />
                                        Crear proveedor
                                      </span>
                                    </SelectItem>
                                  </>
                                ) : (
                                  suppliers.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label>Categoría (opcional)</Label>
                            <Select value={categoryId || NONE_CATEGORY_OPTION} onValueChange={handleCategoryChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Sin categoría" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE_CATEGORY_OPTION}>Sin categoría</SelectItem>
                                {categories.length === 0 ? (
                                  <>
                                    <SelectSeparator />
                                    <SelectItem value={CREATE_CATEGORY_OPTION}>
                                      <span className="inline-flex items-center gap-2">
                                        <Plus className="h-4 w-4" />
                                        Crear categoría
                                      </span>
                                    </SelectItem>
                                  </>
                                ) : (
                                  categories.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <Separator />

                        {/* Campos específicos según el tipo de producto */}
                        <TabsContent value="basic" className="mt-0 space-y-4">
                          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                            Los productos básicos se compran y venden por unidad. Las unidades de compra y venta se establecen automáticamente como Unidad.
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="grid gap-2" data-onboarding-target="products-price-input">
                              <Label>
                                Precio de venta por ({getUnitInfo("UNIDAD").abbr}) (RD$, {salePricesIncludeItbis ? "ITBIS incluido" : "ITBIS no incluido"}) <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                onBlur={(e) => confirmOnboardingField("price", toCents(e.target.value) > 0)}
                                inputMode="decimal"
                                placeholder="Ej: 75.00"
                                required
                                disabled={editing ? (!user || (!user.canOverridePrice && !user.isOwner)) : false}
                                onFocus={selectAllOnFocus}
                              />
                            </div>
                            {(user?.canViewProductCosts || user?.isOwner) && (
                              <div className="grid gap-2" data-onboarding-target="products-cost-input">
                                <Label>
                                  Costo por ({getUnitInfo("UNIDAD").abbr}) (RD$) <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  value={cost}
                                  onChange={(e) => setCost(e.target.value)}
                                  onBlur={(e) => confirmOnboardingField("cost", toCents(e.target.value) > 0)}
                                  inputMode="decimal"
                                  placeholder="Ej: 50.00"
                                  required
                                  onFocus={selectAllOnFocus}
                                />
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="grid gap-2" data-onboarding-target="products-stock-input">
                              <Label>Existencia ({getUnitInfo("UNIDAD").abbr})</Label>
                              <Input
                                value={stock}
                                onChange={(e) => setStock(e.target.value)}
                                onBlur={(e) => {
                                  const parsed = Number(e.target.value.replace(",", "."))
                                  confirmOnboardingField("stock", Number.isFinite(parsed) && parsed > 0)
                                }}
                                inputMode="numeric"
                                placeholder="Ej: 100"
                                disabled={!!editing}
                                onFocus={selectAllOnFocus}
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label>Existencia mínima ({getUnitInfo("UNIDAD").abbr})</Label>
                              <Input
                                value={minStock}
                                onChange={(e) => setMinStock(e.target.value)}
                                inputMode="numeric"
                                placeholder="Ej: 10"
                                onFocus={selectAllOnFocus}
                              />
                            </div>
                          </div>
                          {editing && (
                            <div className="text-xs text-muted-foreground">
                              La existencia se ajusta desde Ajuste masivo.
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="measured" className="mt-0 space-y-4">
                          <div className="grid gap-2">
                            <div className="grid gap-2">
                              <Label>
                                Unidad <span className="text-red-500">*</span>
                              </Label>
                              <select
                                value={unit}
                                onChange={(e) => setUnit(e.target.value as UnitType)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                required
                              >
                                {UNIT_OPTIONS.filter((u) => u.value !== "UNIDAD").map((u) => (
                                  <option key={u.value} value={u.value}>
                                    {u.label} ({u.abbr})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                            La misma unidad se usa para costo, precio, existencia y movimientos del producto.
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="grid gap-2">
                              <Label>
                                Precio de venta por ({getUnitInfo(unit).abbr}) (RD$, {salePricesIncludeItbis ? "ITBIS incluido" : "ITBIS no incluido"}) <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                onBlur={(e) => confirmOnboardingField("price", toCents(e.target.value) > 0)}
                                inputMode="decimal"
                                required
                                disabled={editing ? (!user || (!user.canOverridePrice && !user.isOwner)) : false}
                                onFocus={selectAllOnFocus}
                              />
                            </div>
                            {(user?.canViewProductCosts || user?.isOwner) && (
                              <div className="grid gap-2">
                                <Label>
                                  Costo por ({getUnitInfo(unit).abbr}) (RD$) <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  value={cost}
                                  onChange={(e) => setCost(e.target.value)}
                                  onBlur={(e) => confirmOnboardingField("cost", toCents(e.target.value) > 0)}
                                  inputMode="decimal"
                                  required
                                  onFocus={selectAllOnFocus}
                                />
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="grid gap-2">
                              <Label>Existencia ({getUnitInfo(unit).abbr})</Label>
                              <Input
                                value={stock}
                                onChange={(e) => setStock(e.target.value)}
                                onBlur={(e) => {
                                  const parsed = Number(e.target.value.replace(",", "."))
                                  confirmOnboardingField("stock", Number.isFinite(parsed) && parsed > 0)
                                }}
                                inputMode="decimal"
                                placeholder="Ej: 45.5"
                                disabled={!!editing}
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label>Existencia mínima ({getUnitInfo(unit).abbr})</Label>
                              <Input value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="decimal" placeholder="Ej: 5" />
                            </div>
                          </div>
                          {editing && (
                            <div className="text-xs text-muted-foreground">
                              La existencia se ajusta desde Ajuste masivo.
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                            Los productos con medidas permiten cantidades decimales (ej: 2.5 kg, 1.75 m).
                          </div>
                        </TabsContent>

                        <TabsContent value="recipe" className="mt-0 space-y-4">
                          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                            Los productos por receta no manejan existencia propia. Al venderlos, el sistema descuenta sus materias primas del inventario.
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="grid gap-2">
                              <Label>
                                Precio de venta por unidad (RD$, {salePricesIncludeItbis ? "ITBIS incluido" : "ITBIS no incluido"}) <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                onBlur={(e) => confirmOnboardingField("price", toCents(e.target.value) > 0)}
                                inputMode="decimal"
                                required
                                disabled={editing ? (!user || (!user.canOverridePrice && !user.isOwner)) : false}
                                onFocus={selectAllOnFocus}
                              />
                            </div>
                            {(user?.canViewProductCosts || user?.isOwner) && (
                              <div className="grid gap-2">
                                <Label>
                                  Costo de referencia por unidad (RD$) <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  value={cost}
                                  onChange={(e) => setCost(e.target.value)}
                                  onBlur={(e) => confirmOnboardingField("cost", toCents(e.target.value) > 0)}
                                  inputMode="decimal"
                                  required
                                  onFocus={selectAllOnFocus}
                                />
                              </div>
                            )}
                          </div>

                          <div className="grid gap-2 rounded-md border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <Label>Receta base</Label>
                                <div className="text-xs text-muted-foreground">
                                  Define los insumos que se consumirán por cada unidad vendida.
                                </div>
                              </div>
                              <Button type="button" variant="secondary" size="sm" onClick={addRecipeItem}>
                                <Plus className="mr-2 h-4 w-4" />
                                Agregar insumo
                              </Button>
                            </div>
                            <div className="grid gap-3">
                              {recipeItems.map((item, index) => (
                                <div key={item.id} className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_140px_44px]">
                                  <div className="grid gap-2">
                                    <Label>Insumo #{index + 1}</Label>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="justify-start font-normal h-10 w-full text-sm"
                                      onClick={() => openIngredientPicker((id) => updateRecipeItem(item.id, "ingredientId", id))}
                                    >
                                      {item.ingredientId
                                        ? (() => {
                                          const opt = availableIngredients.find((o) => o.id === item.ingredientId)
                                          return opt ? `${opt.productId} - ${opt.name}` : "Insumo no encontrado"
                                        })()
                                        : <span className="text-muted-foreground">Selecciona un insumo</span>}
                                    </Button>
                                  </div>
                                  <div className="grid gap-2">
                                    <Label>
                                      Cantidad
                                      {(() => {
                                        const opt = item.ingredientId ? availableIngredients.find((o) => o.id === item.ingredientId) : null
                                        return opt && opt.unit !== "UNIDAD" ? ` (${getUnitInfo(opt.unit as UnitType).abbr})` : ""
                                      })()}
                                    </Label>
                                    <Input
                                      value={item.qty}
                                      onChange={(e) => updateRecipeItem(item.id, "qty", e.target.value)}
                                      inputMode="decimal"
                                      placeholder="Ej: 2"
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <Button type="button" variant="outline" size="icon" onClick={() => removeRecipeItem(item.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                            Los ajustes de receta (Sin/Extra) se configuran al momento de la venta, no en el perfil del producto.
                          </div>
                        </TabsContent>

                        <Separator />

                        <div className="grid gap-2">
                          <Label>ITBIS aplicable para venta</Label>
                          <select
                            value={itbisRateBp}
                            onChange={(e) => setItbisRateBp(Number(e.target.value))}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value={1800}>18% (Estándar)</option>
                            <option value={1600}>16%</option>
                            <option value={0}>0% (Exento)</option>
                          </select>
                          <div className="text-xs text-muted-foreground">
                            El ITBIS se calcula automáticamente según el porcentaje seleccionado.
                          </div>
                        </div>

                        <Separator />

                        <div className="grid gap-2" data-onboarding-target="products-availability-switch">
                          <Label htmlFor="sale-availability">Disponible para venta</Label>
                          <div className="flex items-center justify-between rounded-md border p-3">
                            <div className="text-xs text-muted-foreground pr-3">
                              Si se desactiva, no aparecerá en ventas, pero podrá seguir usándose como insumo en recetas.
                            </div>
                            <Switch
                              id="sale-availability"
                              checked={isAvailableForSale}
                              onCheckedChange={setIsAvailableForSale}
                              className="data-[state=checked]:bg-purple-primary"
                            />
                          </div>
                        </div>

                        <Separator />

                        <div className="grid gap-2">
                          <Label>Imágenes del producto</Label>
                          <ProductImageUpload images={imageUrls} onChange={setImageUrls} maxImages={3} />
                        </div>

                        <Separator />
                        <div className="text-xs text-muted-foreground">
                          {salePricesIncludeItbis
                            ? "Tip: el precio es el precio final al público (incluye ITBIS)."
                            : "Tip: el precio es base (sin ITBIS); al vender se sumará el ITBIS según la tasa del producto."}
                          {itbisRateBp === 0 ? " En este caso, estará excento." : ""}
                        </div>
                      </div>
                    </div>
                  </Tabs>

                  <DialogFooter>
                    <Button variant="secondary" onClick={() => setOpen(false)} type="button">Cancelar</Button>
                    <Button data-onboarding-target="products-save-button" onClick={onSave} disabled={isSaving} type="button">{isSaving ? "Guardando…" : "Guardar"}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </TooltipProvider>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por descripción, código o referencia" />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Existencia</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.productId}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        <Badge variant="secondary">{getProductTypeLabel(getProductFormType(p))}</Badge>
                        {!p.isAvailableForSale && (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                            No vendible
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatRD(p.priceCents)}</TableCell>
                    <TableCell className="text-right">
                      {p.productKind === "RECIPE"
                        ? "Por insumos"
                        : formatQty(decimalToNumber(p.stock), (p.unit as UnitType) ?? "UNIDAD")}
                    </TableCell>
                    <TableCell>{p.supplier?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openMovements(p)}
                          aria-label="Movimientos"
                          title="Movimientos"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button
                          className="bg-green-500 hover:bg-green-600 text-white"
                          size="icon"
                          onClick={() => setPrintingProduct(p)}
                          aria-label="Imprimir etiqueta"
                          title="Imprimir etiqueta"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          className="bg-blue-500 hover:bg-blue-600 text-white"
                          size="icon"
                          onClick={() => {
                            resetForm(p)
                            setOpen(true)
                          }}
                          aria-label="Editar"
                          title="Editar"
                          disabled={!user || (!user.canEditProducts && !user.isOwner)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          className="bg-red-500 hover:bg-red-600 text-white"
                          size="icon"
                          onClick={() => onDelete(p.id)}
                          aria-label="Desactivar"
                          title="Desactivar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {!isLoading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <img
                          src="/lupa.webp"
                          alt="No hay resultados"
                          width={192}
                          height={192}
                          className="mb-4 opacity-60"
                        />
                        <p className="text-lg font-medium text-muted-foreground">No se encontraron productos</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {query ? "Intenta con otros términos de búsqueda" : "Aún no se han registrado productos"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {nextCursor && (
            <div className="flex justify-center">
              <Button type="button" variant="secondary" onClick={loadMore} disabled={isLoading}>
                {isLoading ? "Cargando…" : "Cargar más"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>


      {
        movementsProduct && (
          <Dialog open={movementsOpen} onOpenChange={(v) => {
            setMovementsOpen(v)
            if (!v) {
              setMovementsProduct(null)
              setMovements([])
            }
          }}>
            <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>
                  Movimientos de {movementsProduct.name} (ID {movementsProduct.productId})
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1">
                <div className="rounded-md border max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Detalle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isMovementsLoading && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            Cargando movimientos...
                          </TableCell>
                        </TableRow>
                      )}
                      {!isMovementsLoading && movementItems.length === 0 && !movementInitial && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No hay movimientos para este producto.
                          </TableCell>
                        </TableRow>
                      )}
                      {movementInitial && !isMovementsLoading && (() => {
                        const unit = (movementsProduct.unit as UnitType) ?? "UNIDAD"
                        const qty = Math.abs(movementInitial.qtyDelta)
                        const qtyLabel = formatQty(qty, unit)
                        return (
                          <TableRow key={movementInitial.id} className="bg-muted/30">
                            <TableCell className="whitespace-nowrap">
                              {formatMovementDate(movementInitial.occurredAt)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{MOVEMENT_LABELS[movementInitial.type]}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium text-muted-foreground">{qtyLabel}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {movementInitial.reference ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {movementInitial.note ?? "—"}
                            </TableCell>
                          </TableRow>
                        )
                      })()}
                      {movementPageItems.map((movement) => {
                        const unit = (movementsProduct.unit as UnitType) ?? "UNIDAD"
                        const qty = Math.abs(movement.qtyDelta)
                        const qtyLabel = `${movement.qtyDelta > 0 ? "+" : ""}${formatQty(qty, unit)}`
                        const qtyClass = movement.qtyDelta > 0 ? "text-emerald-600" : "text-red-600"
                        const detailParts = [movement.actor, movement.note].filter(Boolean)
                        return (
                          <TableRow key={movement.id}>
                            <TableCell className="whitespace-nowrap">
                              {formatMovementDate(movement.occurredAt)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{MOVEMENT_LABELS[movement.type]}</Badge>
                            </TableCell>
                            <TableCell className={`text-right font-medium ${qtyClass}`}>{qtyLabel}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {movement.reference ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {detailParts.length ? detailParts.join(" • ") : "—"}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <DialogFooter>
                <div className="flex items-center justify-between w-full">
                  <div className="text-xs text-muted-foreground">
                    Página {Math.min(movementsPage + 1, movementPageCount)} de {movementPageCount}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMovementsPage((p) => Math.max(p - 1, 0))}
                      disabled={movementsPage === 0}
                      type="button"
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMovementsPage((p) => Math.min(p + 1, movementPageCount - 1))}
                      disabled={movementsPage >= movementPageCount - 1}
                      type="button"
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
                <Button variant="secondary" onClick={() => setMovementsOpen(false)} type="button">
                  Cerrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog >
        )
      }

      {
        printingProduct && (
          <BarcodeLabel
            productName={printingProduct.name}
            sku={printingProduct.sku}
            reference={printingProduct.reference}
            priceCents={printingProduct.priceCents}
            labelSize={barcodeLabelSize}
            onPrintComplete={() => setPrintingProduct(null)}
          />
        )
      }

      <Dialog open={ingredientPickerOpen} onOpenChange={setIngredientPickerOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Seleccionar insumo</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <Input
              className="pl-10"
              value={ingredientPickerSearch}
              onChange={(e) => setIngredientPickerSearch(e.target.value)}
              placeholder="Buscar por nombre o ID…"
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto border rounded-md min-h-0" style={{ maxHeight: "50vh" }}>
            {(() => {
              const term = ingredientPickerSearch.trim().toLowerCase()
              const filtered = term
                ? availableIngredients.filter(
                  (o) =>
                    o.name.toLowerCase().includes(term) ||
                    String(o.productId).toLowerCase().includes(term)
                )
                : availableIngredients
              if (filtered.length === 0) {
                if (availableIngredients.length === 0) {
                  return (
                    <div className="p-6 text-center text-sm text-muted-foreground space-y-1">
                      <p>No hay insumos disponibles.</p>
                      <p>Primero debes crear los ingredientes que utilizarás.</p>
                    </div>
                  )
                }
                return (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No se encontraron insumos.
                  </div>
                )
              }
              return (
                <>
                  {filtered.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-accent transition-colors border-b"
                      onClick={() => onIngredientPicked(option.id)}
                    >
                      <span className="font-medium text-muted-foreground min-w-[3rem]">{option.productId}</span>
                      <span>{option.name}</span>
                    </button>
                  ))}
                  <div className="border-t" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-primary hover:bg-accent transition-colors"
                    onClick={() =>
                      toast({
                        title: "Crear insumo",
                        description: "Si no existe, crea primero el ingrediente y luego vuelve a seleccionarlo.",
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Crear insumo
                  </button>
                </>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div >
  )
}
