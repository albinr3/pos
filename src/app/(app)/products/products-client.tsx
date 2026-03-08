"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type DragEvent, type FocusEvent } from "react"
import { Edit, History, Loader2, Plus, Printer, Search, Trash2, Upload } from "lucide-react"
import { UnitType } from "@prisma/client"
import * as XLSX from "xlsx"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"
import { UNIT_OPTIONS, formatQty, decimalToNumber, unitAllowsDecimals, getUnitInfo } from "@/lib/units"
import { BarcodeLabel } from "@/components/app/barcode-label"
import { ProductImageUpload } from "@/components/app/product-image-upload"
import type { CurrentUser } from "@/lib/auth"

import {
  adjustManyStock,
  deactivateProduct,
  importProductsChunk,
  listRecipeIngredientOptions,
  listProductMovements,
  listProducts,
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

type RecipeModifierItemFormRow = {
  id: string
  ingredientId: string
  qtyDelta: string
}

type RecipeModifierFormRow = {
  id: string
  name: string
  items: RecipeModifierItemFormRow[]
}

const PAGE_SIZE = 50
const INVENTORY_IMPORT_MAX_ROWS = 5000
const INVENTORY_IMPORT_MAX_FILE_SIZE = 10 * 1024 * 1024
const INVENTORY_IMPORT_CHUNK_SIZE = 50

const INVENTORY_TEMPLATE_HEADERS = [
  "nombre",
  "sku",
  "referencia",
  "tipo_producto",
  "unidad_compra",
  "unidad_venta",
  "precio_venta",
  "costo",
  "itbis",
  "existencia",
  "existencia_minima",
  "categoria",
  "proveedor",
  "imagenes",
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

function createRecipeModifierItemRow(): RecipeModifierItemFormRow {
  return {
    id: createLocalRowId(),
    ingredientId: "",
    qtyDelta: "1",
  }
}

function createRecipeModifierRow(): RecipeModifierFormRow {
  return {
    id: createLocalRowId(),
    name: "",
    items: [createRecipeModifierItemRow()],
  }
}

function getProductFormType(product?: Product | null): ProductFormType {
  if (!product) return "basic"
  if (product.productKind === "RECIPE") return "recipe"
  return product.purchaseUnit === "UNIDAD" && product.saleUnit === "UNIDAD" ? "basic" : "measured"
}

function getProductTypeLabel(productType: ProductFormType) {
  if (productType === "recipe") return "Por receta"
  if (productType === "measured") return "Con medidas"
  return "Básico"
}

function formatMovementDate(value: string) {
  return new Date(value).toLocaleString("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  })
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
  const raw = String(value).trim().toUpperCase()
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
    LITRO: "LITRO",
    LITROS: "LITRO",
    L: "LITRO",
    ML: "ML",
    MILILITRO: "ML",
    MILILITROS: "ML",
    GALON: "GALON",
    GALONES: "GALON",
    GAL: "GALON",
    METRO: "METRO",
    METROS: "METRO",
    M: "METRO",
    CM: "CM",
    CENTIMETRO: "CM",
    CENTIMETROS: "CM",
    PIE: "PIE",
    PIES: "PIE",
    FT: "PIE",
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
    const unidadCompra = getCellValue(normalized, ["unidad_compra"])
    const unidadVenta = getCellValue(normalized, ["unidad_venta"])
    const precioVenta = getCellValue(normalized, ["precio_venta", "precio", "price"])
    const costo = getCellValue(normalized, ["costo", "cost"])
    const itbis = getCellValue(normalized, ["itbis", "itbis_percent"])
    const stock = getCellValue(normalized, ["stock", "existencia"])
    const stockMinimo = getCellValue(normalized, ["stock_minimo", "existencia_minima", "min_stock"])
    const categoria = getCellValue(normalized, ["categoria", "category"])
    const proveedor = getCellValue(normalized, ["proveedor", "supplier"])
    const imagenes = getCellValue(normalized, ["imagenes", "image_urls", "images"])

    const parsed: BulkProductImportRow = {
      rowNumber: index + 2,
    }

    if (hasCellValue(nombre)) parsed.nombre = String(nombre).trim()
    if (hasCellValue(sku)) parsed.sku = String(sku).trim()
    if (hasCellValue(referencia)) parsed.referencia = String(referencia).trim()
    if (hasCellValue(categoria)) parsed.categoria = String(categoria).trim()
    if (hasCellValue(proveedor)) parsed.proveedor = String(proveedor).trim()
    if (hasCellValue(imagenes)) parsed.imagenes = String(imagenes).trim()

    const parsedType = parseExcelProductType(tipoProducto)
    if (hasCellValue(tipoProducto) && !parsedType) {
      throw new Error(`Línea ${index + 2}: tipo_producto inválido (usa BASICO o MEDIDO)`)
    }
    if (parsedType) parsed.tipo_producto = parsedType

    const parsedPurchaseUnit = parseExcelUnit(unidadCompra)
    if (hasCellValue(unidadCompra) && !parsedPurchaseUnit) {
      throw new Error(`Línea ${index + 2}: unidad_compra inválida`)
    }
    if (parsedPurchaseUnit) parsed.unidad_compra = parsedPurchaseUnit

    const parsedSaleUnit = parseExcelUnit(unidadVenta)
    if (hasCellValue(unidadVenta) && !parsedSaleUnit) {
      throw new Error(`Línea ${index + 2}: unidad_venta inválida`)
    }
    if (parsedSaleUnit) parsed.unidad_venta = parsedSaleUnit

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

export function ProductsClient() {
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
  const inventoryFileInputRef = useRef<HTMLInputElement>(null)
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
  // Unidades de compra y venta
  const [purchaseUnit, setPurchaseUnit] = useState<UnitType>("KG")
  const [saleUnit, setSaleUnit] = useState<UnitType>("KG")
  const [recipeItems, setRecipeItems] = useState<RecipeItemFormRow[]>([createRecipeItemRow()])
  const [recipeModifiers, setRecipeModifiers] = useState<RecipeModifierFormRow[]>([])

  const selectAllOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select()
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
    getSettings().then((s) => setBarcodeLabelSize(s.barcodeLabelSize)).catch(() => {})
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
    setName(x?.name ?? "")
    setSku(x?.sku ?? "")
    setReference(x?.reference ?? "")
    setSupplierId(x?.supplierId ?? "")
    setCategoryId(x?.categoryId ?? "")
    setPrice(((x?.priceCents ?? 0) / 100).toFixed(2))
    setCost(((x?.costCents ?? 0) / 100).toFixed(2))
    setItbisRateBp(x?.itbisRateBp ?? 1800)
    const stockNum = x ? decimalToNumber(x.stock) : 0
    const minStockNum = x ? decimalToNumber(x.minStock) : 0
    setStock(String(stockNum))
    setMinStock(String(minStockNum))
    setImageUrls(x?.imageUrls ?? [])

    const nextType = getProductFormType(x)
    setProductType(nextType)

    const purchaseU = (x?.purchaseUnit as UnitType) ?? "UNIDAD"
    const saleU = (x?.saleUnit as UnitType) ?? "UNIDAD"
    if (nextType === "measured") {
      setPurchaseUnit(purchaseU === "UNIDAD" ? "KG" : purchaseU)
      setSaleUnit(saleU === "UNIDAD" ? "KG" : saleU)
    } else {
      setPurchaseUnit("KG")
      setSaleUnit("KG")
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
    setRecipeModifiers(
      x?.recipeModifiers?.length
        ? x.recipeModifiers.map((modifier: Product["recipeModifiers"][number]) => ({
            id: modifier.id,
            name: modifier.name,
            items: modifier.items.length
              ? modifier.items.map((item: Product["recipeModifiers"][number]["items"][number]) => ({
                  id: item.id,
                  ingredientId: item.ingredientId,
                  qtyDelta: String(decimalToNumber(item.qtyDelta)),
                }))
              : [createRecipeModifierItemRow()],
          }))
        : []
    )
  }

  const title = useMemo(() => (editing ? "Editar producto" : "Nuevo producto"), [editing])
  const bulkParsed = useMemo(() => parseBulkLines(bulkLines), [bulkLines])
  const availableIngredients = useMemo(
    () => ingredientOptions.filter((option) => option.id !== editing?.id),
    [editing?.id, ingredientOptions]
  )

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

  function updateRecipeModifier(modifierId: string, name: string) {
    setRecipeModifiers((prev) => prev.map((modifier) => (modifier.id === modifierId ? { ...modifier, name } : modifier)))
  }

  function addRecipeModifier() {
    setRecipeModifiers((prev) => [...prev, createRecipeModifierRow()])
  }

  function removeRecipeModifier(modifierId: string) {
    setRecipeModifiers((prev) => prev.filter((modifier) => modifier.id !== modifierId))
  }

  function updateRecipeModifierItem(
    modifierId: string,
    itemId: string,
    field: "ingredientId" | "qtyDelta",
    value: string
  ) {
    setRecipeModifiers((prev) =>
      prev.map((modifier) =>
        modifier.id === modifierId
          ? {
              ...modifier,
              items: modifier.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
            }
          : modifier
      )
    )
  }

  function addRecipeModifierItem(modifierId: string) {
    setRecipeModifiers((prev) =>
      prev.map((modifier) =>
        modifier.id === modifierId ? { ...modifier, items: [...modifier.items, createRecipeModifierItemRow()] } : modifier
      )
    )
  }

  function removeRecipeModifierItem(modifierId: string, itemId: string) {
    setRecipeModifiers((prev) =>
      prev.map((modifier) => {
        if (modifier.id !== modifierId) return modifier
        const nextItems = modifier.items.filter((item) => item.id !== itemId)
        return {
          ...modifier,
          items: nextItems.length ? nextItems : [createRecipeModifierItemRow()],
        }
      })
    )
  }

  async function onSave() {
    const trimmedName = name.trim()
    const priceCents = toCents(price)
    const costCents = toCents(cost)
    if (!trimmedName || priceCents <= 0 || costCents <= 0) {
      toast({ title: "Campos requeridos", description: "Hay que llenar todos los campos obligatorios.", variant: "destructive" })
      return
    }
    if (productType === "measured" && (!purchaseUnit || !saleUnit)) {
      toast({ title: "Campos requeridos", description: "Hay que llenar todos los campos obligatorios.", variant: "destructive" })
      return
    }
    startSaving(async () => {
      try {
        const productKind = productType === "recipe" ? "RECIPE" : productType === "measured" ? "MEASURED" : "BASIC"
        const finalPurchaseUnit: UnitType =
          productType === "basic" || productType === "recipe" ? "UNIDAD" : purchaseUnit
        const finalSaleUnit: UnitType =
          productType === "basic" || productType === "recipe" ? "UNIDAD" : saleUnit
        const allowsDecimals = unitAllowsDecimals(finalSaleUnit)
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
        const normalizedModifiers =
          productType === "recipe"
            ? recipeModifiers
                .map((modifier) => ({
                  name: modifier.name,
                  items: modifier.items
                    .map((item) => ({
                      ingredientId: item.ingredientId,
                      qtyDelta: Number(item.qtyDelta),
                    }))
                    .filter((item) => item.ingredientId),
                }))
                .filter((modifier) => modifier.name.trim() || modifier.items.length > 0)
            : []

        await upsertProduct({
          id: editing?.id,
          name,
          sku: sku || null,
          reference: reference || null,
          supplierId: supplierId || null,
          categoryId: categoryId || null,
          priceCents,
          costCents,
          itbisRateBp,
          stock: stockValue,
          minStock: minStockValue,
          imageUrls,
          productKind,
          recipeItems: normalizedRecipeItems,
          modifiers: normalizedModifiers,
          purchaseUnit: finalPurchaseUnit,
          saleUnit: finalSaleUnit,
        })
        toast({ title: "Guardado", description: "Producto actualizado" })
        setOpen(false)
        resetForm(null)
        refresh(query)
        listRecipeIngredientOptions().then(setIngredientOptions).catch(() => setIngredientOptions([]))
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
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

  function downloadInventoryTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet([
      [...INVENTORY_TEMPLATE_HEADERS],
      [
        "Ejemplo producto",
        "SKU-001",
        "REF-001",
        "BASICO",
        "",
        "",
        150,
        100,
        18,
        25,
        5,
        "General",
        "Proveedor A",
        "",
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

    try {
      for (let start = 0; start < total; start += INVENTORY_IMPORT_CHUNK_SIZE) {
        const chunk = inventoryRows.slice(start, start + INVENTORY_IMPORT_CHUNK_SIZE)
        const chunkEnd = Math.min(start + chunk.length, total)
        setInventoryStatus(`Procesando ${chunkEnd}/${total}`)

        try {
          const result = await importProductsChunk({
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
    if (!confirm("¿Desactivar este producto?") ) return
    try {
      await deactivateProduct(id)
      toast({ title: "Listo", description: "Producto desactivado" })
      refresh(query)
    } catch {
      toast({ title: "Error", description: "No se pudo desactivar" })
    }
  }

  const totalProducts = items.length
  const canAdjustStock = !!user && (user.canEditProducts || user.role === "ADMIN")
  const movementInitial = useMemo(() => movements.find((m) => m.type === "INITIAL") ?? null, [movements])
  const movementItems = useMemo(() => movements.filter((m) => m.type !== "INITIAL"), [movements])
  const movementPageSize = 10
  const movementPageCount = Math.max(Math.ceil(movementItems.length / movementPageSize), 1)
  const movementStart = movementsPage * movementPageSize
  const movementPageItems = movementItems.slice(movementStart, movementStart + movementPageSize)

  useEffect(() => {
    if (movementsPage > movementPageCount - 1) {
      setMovementsPage(0)
    }
  }, [movementsPage, movementPageCount])

  return (
    <div className="grid gap-6">
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
          <div className="flex items-center gap-2">
            <Dialog
              open={inventoryBulkOpen}
              onOpenChange={(v) => {
                setInventoryBulkOpen(v)
                if (!v) resetInventoryImportState()
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!canAdjustStock}
                  className="bg-green-100 border-green-300 text-green-900 hover:bg-green-200"
                >
                  Inventario masivo
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[780px]">
                <DialogHeader>
                  <DialogTitle>Inventario masivo</DialogTitle>
                </DialogHeader>
                <div className="grid gap-6">
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
                      className={`relative rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                        isInventoryDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
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
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!canAdjustStock}>Ajuste masivo</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                  <DialogTitle>Ajuste masivo de inventario</DialogTitle>
                </DialogHeader>
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
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setBulkOpen(false)} type="button">Cancelar</Button>
                  <Button onClick={onBulkSave} disabled={isBulkSaving || !canAdjustStock} type="button">
                    {isBulkSaving ? "Aplicando…" : "Aplicar ajustes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(null) }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(null); setOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px] max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>

              <Tabs value={productType} onValueChange={(v) => setProductType(v as ProductFormType)} className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Producto básico</TabsTrigger>
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

                    <div className="grid gap-2">
                      <Label>
                        Nombre del producto <span className="text-red-500">*</span>
                      </Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Alfombra" required />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label>Proveedor (opcional)</Label>
                        <select
                          value={supplierId}
                          onChange={(e) => setSupplierId(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">Sin proveedor</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Categoría (opcional)</Label>
                        <select
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">Sin categoría</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label>Código de proveedor (SKU)</Label>
                        <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej: 12345" />
                      </div>
                      <div className="grid gap-2">
                        <Label>Referencia</Label>
                        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: REF-01" />
                      </div>
                    </div>

                    <Separator />

                    {/* Campos específicos según el tipo de producto */}
                    <TabsContent value="basic" className="mt-0 space-y-4">
                      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                        Los productos básicos se compran y venden por unidad. Las unidades de compra y venta se establecen automáticamente como Unidad.
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>
                            Precio de venta por ({getUnitInfo("UNIDAD").abbr}) (RD$, ITBIS incluido) <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            inputMode="decimal"
                            required
                            disabled={editing ? (!user || (!user.canOverridePrice && user.role !== "ADMIN")) : false}
                            onFocus={selectAllOnFocus}
                          />
                        </div>
                        {(user?.canViewProductCosts || user?.role === "ADMIN") && (
                          <div className="grid gap-2">
                            <Label>
                              Costo por ({getUnitInfo("UNIDAD").abbr}) (RD$) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              value={cost}
                              onChange={(e) => setCost(e.target.value)}
                              inputMode="decimal"
                              required
                              onFocus={selectAllOnFocus}
                            />
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>Existencia ({getUnitInfo("UNIDAD").abbr})</Label>
                          <Input
                            value={stock}
                            onChange={(e) => setStock(e.target.value)}
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>
                            Unidad de compra <span className="text-red-500">*</span>
                          </Label>
                          <select
                            value={purchaseUnit}
                            onChange={(e) => setPurchaseUnit(e.target.value as UnitType)}
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
                        <div className="grid gap-2">
                          <Label>
                            Unidad de venta <span className="text-red-500">*</span>
                          </Label>
                          <select
                            value={saleUnit}
                            onChange={(e) => setSaleUnit(e.target.value as UnitType)}
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
                        La unidad de compra y venta pueden ser diferentes. Ejemplo: compras por kilogramos (kg) pero vendes por gramos (g).
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>
                            Precio de venta por ({getUnitInfo(saleUnit).abbr}) (RD$, ITBIS incluido) <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            inputMode="decimal"
                            required
                            disabled={editing ? (!user || (!user.canOverridePrice && user.role !== "ADMIN")) : false}
                            onFocus={selectAllOnFocus}
                          />
                        </div>
                        {(user?.canViewProductCosts || user?.role === "ADMIN") && (
                          <div className="grid gap-2">
                            <Label>
                              Costo por ({getUnitInfo(purchaseUnit).abbr}) (RD$) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              value={cost}
                              onChange={(e) => setCost(e.target.value)}
                              inputMode="decimal"
                              required
                              onFocus={selectAllOnFocus}
                            />
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <Label>Existencia ({getUnitInfo(saleUnit).abbr})</Label>
                          <Input
                            value={stock}
                            onChange={(e) => setStock(e.target.value)}
                            inputMode="decimal"
                            placeholder="Ej: 45.5"
                            disabled={!!editing}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Existencia mínima ({getUnitInfo(saleUnit).abbr})</Label>
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
                            Precio de venta por unidad (RD$, ITBIS incluido) <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            inputMode="decimal"
                            required
                            disabled={editing ? (!user || (!user.canOverridePrice && user.role !== "ADMIN")) : false}
                            onFocus={selectAllOnFocus}
                          />
                        </div>
                        {(user?.canViewProductCosts || user?.role === "ADMIN") && (
                          <div className="grid gap-2">
                            <Label>
                              Costo de referencia por unidad (RD$) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              value={cost}
                              onChange={(e) => setCost(e.target.value)}
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
                                <select
                                  value={item.ingredientId}
                                  onChange={(e) => updateRecipeItem(item.id, "ingredientId", e.target.value)}
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                  <option value="">Selecciona un insumo</option>
                                  {availableIngredients.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.productId} - {option.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid gap-2">
                                <Label>Cantidad</Label>
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

                      <div className="grid gap-3 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <Label>Modificadores</Label>
                            <div className="text-xs text-muted-foreground">
                              Ajustan cantidades de insumos sin cambiar el precio. Ejemplo: sin tomate, extra queso.
                            </div>
                          </div>
                          <Button type="button" variant="secondary" size="sm" onClick={addRecipeModifier}>
                            <Plus className="mr-2 h-4 w-4" />
                            Agregar modificador
                          </Button>
                        </div>

                        {recipeModifiers.length === 0 && (
                          <div className="text-sm text-muted-foreground">
                            Aún no has agregado modificadores. Puedes dejar esta sección vacía si solo usarás la receta base.
                          </div>
                        )}

                        {recipeModifiers.map((modifier, modifierIndex) => (
                          <div key={modifier.id} className="grid gap-3 rounded-md border p-3">
                            <div className="flex items-center gap-2">
                              <div className="grid flex-1 gap-2">
                                <Label>Modificador #{modifierIndex + 1}</Label>
                                <Input
                                  value={modifier.name}
                                  onChange={(e) => updateRecipeModifier(modifier.id, e.target.value)}
                                  placeholder="Ej: Sin tomate"
                                />
                              </div>
                              <Button type="button" variant="outline" size="icon" onClick={() => removeRecipeModifier(modifier.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            <div className="grid gap-3">
                              {modifier.items.map((item, itemIndex) => (
                                <div
                                  key={item.id}
                                  className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_160px_44px]"
                                >
                                  <div className="grid gap-2">
                                    <Label>Ajuste #{itemIndex + 1}</Label>
                                    <select
                                      value={item.ingredientId}
                                      onChange={(e) => updateRecipeModifierItem(modifier.id, item.id, "ingredientId", e.target.value)}
                                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                      <option value="">Selecciona un insumo</option>
                                      {availableIngredients.map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {option.productId} - {option.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="grid gap-2">
                                    <Label>Ajuste de cantidad</Label>
                                    <Input
                                      value={item.qtyDelta}
                                      onChange={(e) => updateRecipeModifierItem(modifier.id, item.id, "qtyDelta", e.target.value)}
                                      inputMode="decimal"
                                      placeholder="Ej: -1 o 0.5"
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => removeRecipeModifierItem(modifier.id, item.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div>
                              <Button type="button" variant="outline" size="sm" onClick={() => addRecipeModifierItem(modifier.id)}>
                                <Plus className="mr-2 h-4 w-4" />
                                Agregar ajuste
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    <Separator />

                    <div className="grid gap-2">
                      <Label>ITBIS aplicable</Label>
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

                    <div className="grid gap-2">
                      <Label>Imágenes del producto</Label>
                      <ProductImageUpload images={imageUrls} onChange={setImageUrls} maxImages={3} />
                    </div>

                    <Separator />
                    <div className="text-xs text-muted-foreground">Tip: el precio es el precio final al público (incluye ITBIS).</div>
                  </div>
                </div>
              </Tabs>

              <DialogFooter>
                <Button variant="secondary" onClick={() => setOpen(false)} type="button">Cancelar</Button>
                <Button onClick={onSave} disabled={isSaving} type="button">{isSaving ? "Guardando…" : "Guardar"}</Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
          </div>
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
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Código de proveedor</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Existencia</TableHead>
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
                      </div>
                    </TableCell>
                    <TableCell>{p.supplier?.name ?? "—"}</TableCell>
                    <TableCell>{p.sku ?? "—"}</TableCell>
                    <TableCell>{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatRD(p.priceCents)}</TableCell>
                    <TableCell className="text-right">
                      {p.productKind === "RECIPE"
                        ? "Por insumos"
                        : formatQty(decimalToNumber(p.stock), (p.saleUnit as UnitType) ?? "UNIDAD")}
                    </TableCell>
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
                          disabled={!user || (!user.canEditProducts && user.role !== "ADMIN")}
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
                    <TableCell colSpan={8} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <img
                          src="/lupa.png"
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

      {movementsProduct && (
        <Dialog
          open={movementsOpen}
          onOpenChange={(v) => {
            setMovementsOpen(v)
            if (!v) {
              setMovementsProduct(null)
              setMovements([])
            }
          }}
        >
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
                      const unit = (movementsProduct.saleUnit as UnitType) ?? "UNIDAD"
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
                      const unit = (movementsProduct.saleUnit as UnitType) ?? "UNIDAD"
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
        </Dialog>
      )}

      {printingProduct && (
        <BarcodeLabel
          productName={printingProduct.name}
          sku={printingProduct.sku}
          reference={printingProduct.reference}
          priceCents={printingProduct.priceCents}
          labelSize={barcodeLabelSize}
          onPrintComplete={() => setPrintingProduct(null)}
        />
      )}
    </div>
  )
}
