"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { SaleType, PaymentMethod, UnitType } from "@prisma/client"
import { Plus, Search, Trash2, Grid3x3, List, AlertCircle, X, WifiOff, ChevronDown, ChevronUp } from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PriceInput } from "@/components/app/price-input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  calcDiscountedDocumentTotalsByTaxMode,
  formatRD,
  normalizeDiscountPercentBp,
  toCents,
} from "@/lib/money"
import { DOMINICAN_BANKS } from "@/lib/dominican-banks"
import { formatQty, formatQtyNumber, parseQty, decimalToNumber, unitAllowsDecimals, getUnitInfo } from "@/lib/units"
import { applyRecipeAdjustmentsWithScope, sortRecipeAdjustments, type RecipeApplyScope } from "@/lib/recipe-adjustment-scope"
import { toast } from "@/hooks/use-toast"
import { useOnlineStatus } from "@/hooks/use-online-status"
import { syncCacheData } from "@/lib/auto-sync"
import {
  savePendingSale,
  searchProductsCache,
  getProductsCache,
  getCustomersCache,
  getPendingCounts,
  findProductByBarcodeCache,
} from "@/lib/indexed-db"

import type { CurrentUser } from "@/lib/auth"

import { createSale, listCustomers, searchProducts, listAllProductsForSale, findProductByBarcode } from "./actions"

type ProductResult = Awaited<ReturnType<typeof searchProducts>>[number]

type RecipeAdjustment = {
  ingredientId: string
  ingredientName: string
  adjustmentType: "SIN" | "EXTRA"
}

type RecipeItem = NonNullable<ProductResult["recipeItems"]>[number]

type CartItem = {
  lineId: string
  productId: string
  name: string
  sku: string | null
  reference: string | null
  stock: number
  qty: number
  unitPriceCents: number
  wasPriceOverridden: boolean
  unit: UnitType
  itbisRateBp: number
  productKind: "BASIC" | "MEASURED" | "RECIPE"
  recipeItems: RecipeItem[]
  recipeAdjustments: RecipeAdjustment[]
}

type Customer = Awaited<ReturnType<typeof listCustomers>>[number]

type PaymentSplit = {
  method: PaymentMethod
  amountCents: number
  transferBankName?: string | null
}

type DiscountMode = "AUTO" | "MANUAL"

const USER_CACHE_KEY = "tejada-pos-user"
const POS_FORCE_RESET_KEY = "tejada-pos-force-reset-after-print"
const CREATE_CUSTOMER_OPTION = "__create_customer__"

function clampPercentInput(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "")
  const parts = normalized.split(".")
  if (parts.length <= 1) return normalized
  return `${parts[0]}.${parts.slice(1).join("")}`
}

function buildCartLineId(productId: string, recipeAdjustments: RecipeAdjustment[]) {
  const adjustmentsKey = recipeAdjustments
    .map((adjustment) => `${adjustment.ingredientId}:${adjustment.adjustmentType}`)
    .sort()
    .join(",")
  return adjustmentsKey ? `${productId}::${adjustmentsKey}` : productId
}

function formatAdjustmentLabel(adjustment: RecipeAdjustment) {
  return `${adjustment.adjustmentType === "SIN" ? "Sin" : "Extra"} ${adjustment.ingredientName}`
}

function getRecipeVariantLabels(recipeAdjustments: RecipeAdjustment[]) {
  if (recipeAdjustments.length === 0) return ["Normal"]
  return recipeAdjustments.map(formatAdjustmentLabel)
}

function serializeCartItem(item: CartItem) {
  return {
    lineId: String(item.lineId),
    productId: String(item.productId),
    name: String(item.name),
    sku: item.sku ? String(item.sku) : null,
    reference: item.reference ? String(item.reference) : null,
    stock: Number(item.stock),
    qty: Number(item.qty),
    unitPriceCents: Number(item.unitPriceCents),
    wasPriceOverridden: Boolean(item.wasPriceOverridden),
    unit: String(item.unit),
    itbisRateBp: Number(item.itbisRateBp ?? 1800),
    productKind: item.productKind,
    recipeItems: item.recipeItems,
    recipeAdjustments: item.recipeAdjustments,
  }
}

function cacheUser(user: CurrentUser) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
  } catch {
    // Ignore cache errors
  }
}

function getCachedUser(): CurrentUser | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CurrentUser
  } catch {
    return null
  }
}

export function PosClient({
  defaultViewMode = "list",
  showItbisOnReceipts = true,
  salePricesIncludeItbis = true,
}: {
  defaultViewMode?: string
  showItbisOnReceipts?: boolean
  salePricesIncludeItbis?: boolean
}) {
  const isOnline = useOnlineStatus()
  const [mounted, setMounted] = useState(false)
  const [query, setQuery] = useState("")
  const [isInitialized, setIsInitialized] = useState(false)

  // Evitar error de hidratación: solo mostrar indicador después de montar
  useEffect(() => {
    setMounted(true)
  }, [])
  const [results, setResults] = useState<ProductResult[]>([])
  const [isSearching, startSearch] = useTransition()
  const [viewMode, setViewMode] = useState<"list" | "grid">(defaultViewMode as "list" | "grid")
  const [isSaleConfigCollapsed, setIsSaleConfigCollapsed] = useState(true)
  const [allProducts, setAllProducts] = useState<ProductResult[]>([])
  const [isLoadingProducts, startLoadingProducts] = useTransition()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string | null>("generic")
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
  const [customerPickerQuery, setCustomerPickerQuery] = useState("")
  const [saleType, setSaleType] = useState<SaleType>(SaleType.CONTADO)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(PaymentMethod.EFECTIVO)
  const [transferBankName, setTransferBankName] = useState<string>("")
  const [pendingCounts, setPendingCounts] = useState({ sales: 0, payments: 0 })

  const [cart, setCart] = useState<CartItem[]>([])
  const [shippingInput, setShippingInput] = useState("")
  const [discountMode, setDiscountMode] = useState<DiscountMode>("AUTO")
  const [manualDiscountInput, setManualDiscountInput] = useState("")
  const [user, setUser] = useState<CurrentUser | null>(() => getCachedUser())
  // Usar el permiso del usuario para vender sin stock
  const allowNegativeStock = useMemo(() => user?.canSellWithoutStock || user?.isOwner || false, [user])
  const canApplyDiscounts = useMemo(() => user?.canApplyDiscounts || user?.isOwner || false, [user])
  const [isSaving, startSave] = useTransition()
  const [showChangeDialog, setShowChangeDialog] = useState(false)
  const [amountPaidInput, setAmountPaidInput] = useState("")
  const [showSplitPaymentDialog, setShowSplitPaymentDialog] = useState(false)
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([])
  const [editingPaymentAmounts, setEditingPaymentAmounts] = useState<Record<number, string>>({})
  // Estado temporal para valores de cantidad en edición (productId -> string)
  const [editingQuantities, setEditingQuantities] = useState<Record<string, string>>({})
  const [recipeDialogLineId, setRecipeDialogLineId] = useState<string | null>(null)
  const [recipeDialogMode, setRecipeDialogMode] = useState<"SIN" | "EXTRA" | null>(null)
  const [recipeApplyScope, setRecipeApplyScope] = useState<RecipeApplyScope>("ONE")
  const [recipeDraftByIngredient, setRecipeDraftByIngredient] = useState<Record<string, "SIN" | "EXTRA">>({})
  const [showNavigationDialog, setShowNavigationDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const recipeDialogCartItem = useMemo(
    () => cart.find((item) => item.lineId === recipeDialogLineId) ?? null,
    [cart, recipeDialogLineId]
  )

  // Ref para rastrear el tiempo de la primera y última tecla (para detectar escaneo de código de barras)
  const firstKeyPressTime = useRef<number>(0)
  const lastKeyPressTime = useRef<number>(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const router = useRouter()
  const pathname = usePathname()
  const shouldUseCustomerSearchModal = customers.length > 12

  const filteredCustomers = useMemo(() => {
    const q = customerPickerQuery.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => {
      const idLabel = typeof c.visualId === "number" ? String(c.visualId) : ""
      return `${c.name} ${idLabel}`.toLowerCase().includes(q)
    })
  }, [customers, customerPickerQuery])

  const genericCustomerId = useMemo(
    () => customers.find((c) => c.isGeneric)?.id ?? null,
    [customers]
  )

  const effectiveCustomerId = customerId === "generic" ? genericCustomerId : customerId
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === effectiveCustomerId) ?? null,
    [customers, effectiveCustomerId]
  )

  const selectedCustomerLabel = useMemo(() => {
    if (!selectedCustomer) return "Cliente general"
    return `${typeof selectedCustomer.visualId === "number" ? `#${selectedCustomer.visualId} ` : ""}${selectedCustomer.name}`
  }, [selectedCustomer])

  const autoDiscountPercentBp = useMemo(
    () => normalizeDiscountPercentBp(selectedCustomer?.saleDiscountPercentBp ?? 0),
    [selectedCustomer]
  )
  const manualDiscountPercentBp = useMemo(() => {
    const parsed = Number.parseFloat(manualDiscountInput.replace(",", "."))
    if (!Number.isFinite(parsed)) return 0
    return normalizeDiscountPercentBp(parsed * 100)
  }, [manualDiscountInput])
  const effectiveDiscountPercentBp = useMemo(() => {
    if (canApplyDiscounts) return manualDiscountPercentBp
    return autoDiscountPercentBp
  }, [autoDiscountPercentBp, canApplyDiscounts, manualDiscountPercentBp])

  const handleCustomerSelect = useCallback((value: string) => {
    if (value === CREATE_CUSTOMER_OPTION) {
      router.push("/customers")
      return
    }
    setCustomerId(value || null)
  }, [router])

  const resetSaleFormState = useCallback(() => {
    setCart([])
    setCustomerId("generic")
    setSaleType(SaleType.CONTADO)
    setShippingInput("")
    setDiscountMode("AUTO")
    setManualDiscountInput("")
    setQuery("")
    setResults([])
    setShowChangeDialog(false)
    setShowSplitPaymentDialog(false)
    setAmountPaidInput("")
    setPaymentSplits([])
    setTransferBankName("")
    setEditingPaymentAmounts({})
    setPaymentMethod(PaymentMethod.EFECTIVO)
    localStorage.removeItem("posCartState")
  }, [])

  useEffect(() => {
    if (pathname !== "/sales") return

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [pathname])

  useEffect(() => {
    if (typeof window === "undefined") return

    const resetIfNeeded = () => {
      const shouldReset = sessionStorage.getItem(POS_FORCE_RESET_KEY) === "1"
      if (!shouldReset) return
      sessionStorage.removeItem(POS_FORCE_RESET_KEY)
      resetSaleFormState()
    }

    resetIfNeeded()
    window.addEventListener("pageshow", resetIfNeeded)

    return () => window.removeEventListener("pageshow", resetIfNeeded)
  }, [resetSaleFormState])

  useEffect(() => {
    // Obtener usuario actual con permisos
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user)
          cacheUser(data.user)
        }
      })
      .catch(() => {
        const cached = getCachedUser()
        if (cached) {
          setUser(cached)
        }
        console.error("Error fetching user")
      })
  }, [])

  useEffect(() => {
    if (autoDiscountPercentBp > 0) {
      setManualDiscountInput((autoDiscountPercentBp / 100).toFixed(2))
    } else {
      setManualDiscountInput("")
    }
  }, [effectiveCustomerId, autoDiscountPercentBp])

  useEffect(() => {
    const loadInitialData = async () => {
      // Pre-cargar datos a IndexedDB si hay conexión
      if (isOnline) {
        try {
          await syncCacheData()
        } catch (error) {
          console.error("Error pre-cargando datos:", error)
        }
      }

      const loadCustomersFromCache = async () => {
        const cached = await getCustomersCache()
        // Ordenar clientes: primero el genérico, luego el resto alfabéticamente
        const sorted = cached.sort((a, b) => {
          if (a.isGeneric && !b.isGeneric) return -1
          if (!a.isGeneric && b.isGeneric) return 1
          return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
        })
        setCustomers(sorted)
        if (cached.length === 0) {
          toast({
            title: "Sin datos offline",
            description: "Conéctate y precarga clientes/productos para vender sin internet.",
            variant: "destructive",
          })
        }
        try {
          const products = await getProductsCache()
          if (products.length === 0) {
            toast({
              title: "Productos no disponibles offline",
              description: "Necesitas precargar los productos con internet.",
              variant: "destructive",
            })
          }
        } catch {
          // Ignore cache errors
        }
        return sorted
      }

      // Cargar clientes (desde servidor o cache)
      if (isOnline) {
        listCustomers()
          .then((customers) => {
            // Ordenar clientes: primero el genérico, luego el resto alfabéticamente
            const sorted = customers.sort((a, b) => {
              if (a.isGeneric && !b.isGeneric) return -1
              if (!a.isGeneric && b.isGeneric) return 1
              return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
            })
            setCustomers(sorted)
          })
          .catch(async () => {
            await loadCustomersFromCache()
          })
      } else {
        await loadCustomersFromCache()
      }

      // Cargar preferencia de vista desde localStorage
      // REMOVED: Respect defaultViewMode from settings instead
      // const savedViewMode = localStorage.getItem("posViewMode") as "list" | "grid" | null
      // if (savedViewMode) {
      //   setViewMode(savedViewMode)
      // }

      // Restaurar el estado del carrito
      try {
        const saved = localStorage.getItem("posCartState")
        if (saved) {
          const state = JSON.parse(saved)
          // Verificar que el estado no sea muy antiguo (máximo 24 horas)
          const maxAge = 24 * 60 * 60 * 1000 // 24 horas en milisegundos
          if (Date.now() - state.timestamp < maxAge && state.cart && Array.isArray(state.cart)) {
            // Cargar clientes primero para validar el customerId
            const customersList = await listCustomers().catch(() => loadCustomersFromCache())
            // Ordenar clientes: primero el genérico, luego el resto alfabéticamente
            const sortedCustomers = customersList.sort((a, b) => {
              if (a.isGeneric && !b.isGeneric) return -1
              if (!a.isGeneric && b.isGeneric) return 1
              return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
            })
            setCustomers(sortedCustomers)

            // Validar que el cliente aún existe
            const validCustomerId = state.customerId === "generic" ||
              customersList.some(c => c.id === state.customerId)
              ? state.customerId
              : "generic"

            setCustomerId(validCustomerId)
            setSaleType(state.saleType)
            setPaymentMethod(state.paymentMethod)
            setTransferBankName(state.transferBankName || "")
            setShippingInput(state.shippingInput || "")
            setDiscountMode(state.discountMode === "MANUAL" ? "MANUAL" : "AUTO")
            setManualDiscountInput(typeof state.manualDiscountInput === "string" ? state.manualDiscountInput : "")
            setPaymentSplits(
              Array.isArray(state.paymentSplits)
                ? state.paymentSplits.map((split: any) => ({
                  method: split.method as PaymentMethod,
                  amountCents: typeof split.amountCents === "number" ? split.amountCents : Number(split.amountCents) || 0,
                  transferBankName: split.transferBankName ? String(split.transferBankName) : null,
                }))
                : []
            )

            // Validar y limpiar el carrito antes de restaurarlo
            // Asegurarse de que todos los valores sean serializables (números, strings, etc.)
            const cleanedCart = state.cart.map((item: any) => ({
              lineId: String(
                item.lineId ||
                buildCartLineId(
                  String(item.productId || ""),
                  Array.isArray(item.recipeAdjustments)
                    ? item.recipeAdjustments
                      .map((adjustment: any) => ({
                        ingredientId: String(adjustment.ingredientId || ""),
                        ingredientName: String(adjustment.ingredientName || ""),
                        adjustmentType: String(adjustment.adjustmentType || "").toUpperCase() as "SIN" | "EXTRA",
                      }))
                      .filter((adjustment: RecipeAdjustment) => adjustment.ingredientId && adjustment.ingredientName && (adjustment.adjustmentType === "SIN" || adjustment.adjustmentType === "EXTRA"))
                    : []
                )
              ),
              productId: String(item.productId || ""),
              name: String(item.name || ""),
              sku: item.sku ? String(item.sku) : null,
              reference: item.reference ? String(item.reference) : null,
              stock: typeof item.stock === "number" ? item.stock : Number(item.stock) || 0,
              qty: typeof item.qty === "number" ? item.qty : Number(item.qty) || 1,
              unitPriceCents: typeof item.unitPriceCents === "number" ? item.unitPriceCents : Number(item.unitPriceCents) || 0,
              wasPriceOverridden: Boolean(item.wasPriceOverridden),
              unit: item.unit || "UNIDAD",
              itbisRateBp: typeof item.itbisRateBp === "number" ? item.itbisRateBp : Number(item.itbisRateBp) || 1800,
              productKind: item.productKind === "RECIPE" ? "RECIPE" : item.productKind === "MEASURED" ? "MEASURED" : "BASIC",
              recipeItems: Array.isArray(item.recipeItems)
                ? item.recipeItems
                  .map((recipeItem: any) => ({
                    ingredientId: String(recipeItem.ingredientId || ""),
                    ingredientName: String(recipeItem.ingredientName || ""),
                    qty: typeof recipeItem.qty === "number" ? recipeItem.qty : Number(recipeItem.qty) || 0,
                    ingredientUnit: String(recipeItem.ingredientUnit || "UNIDAD"),
                  }))
                  .filter((recipeItem: RecipeItem) => recipeItem.ingredientId && recipeItem.ingredientName)
                : [],
              recipeAdjustments: Array.isArray(item.recipeAdjustments)
                ? item.recipeAdjustments
                  .map((adjustment: any) => ({
                    ingredientId: String(adjustment.ingredientId || ""),
                    ingredientName: String(adjustment.ingredientName || ""),
                    adjustmentType: String(adjustment.adjustmentType || "").toUpperCase() as "SIN" | "EXTRA",
                  }))
                  .filter((adjustment: RecipeAdjustment) => adjustment.ingredientId && adjustment.ingredientName && (adjustment.adjustmentType === "SIN" || adjustment.adjustmentType === "EXTRA"))
                : [],
            })).filter((item: any) => item.productId && item.name) // Filtrar items inválidos

            if (cleanedCart.length > 0) {
              setCart(cleanedCart)
              toast({
                title: "Pedido restaurado",
                description: "Se ha restaurado tu pedido anterior. Puedes continuar donde lo dejaste."
              })
            } else {
              // Si no hay items válidos, limpiar el estado
              localStorage.removeItem("posCartState")
            }
          } else {
            // El estado es muy antiguo o inválido, limpiarlo
            localStorage.removeItem("posCartState")
          }
        }
      } catch (error) {
        console.error("Error restaurando estado del carrito:", error)
        // Limpiar el estado corrupto
        try {
          localStorage.removeItem("posCartState")
          console.log("✅ Estado del carrito corrupto eliminado. Por favor recarga la página.")
        } catch (e) {
          console.error("No se pudo limpiar el localStorage:", e)
        }
      }
    }

    loadInitialData().finally(() => setIsInitialized(true))

    // Actualizar contadores de pendientes
    const updatePendingCounts = async () => {
      const counts = await getPendingCounts()
      setPendingCounts(counts)
    }
    updatePendingCounts()
    const interval = setInterval(updatePendingCounts, 5000) // Actualizar cada 5 segundos

    return () => clearInterval(interval)
  }, [isOnline])

  useEffect(() => {
    // Cargar todos los productos cuando se cambia a vista de grid
    if (viewMode === "grid") {
      startLoadingProducts(async () => {
        try {
          if (isOnline) {
            try {
              const products = await listAllProductsForSale()
              setAllProducts(products)
              return
            } catch {
              // Fallback a cache local
            }
          }

          // Cargar desde cache offline
          const cached = await getProductsCache()
          // Normalizar productos: asegurar que tengan priceCents e itbisRateBp
          const normalized = cached.map((p: any) => {
            const price = p.priceCents ?? p.unitPriceCents ?? 0
            if (process.env.NODE_ENV === "development" && price === 0 && p.name) {
              console.log("[POS] Producto sin precio (grid):", p.name, "Campos:", Object.keys(p), "priceCents:", p.priceCents, "unitPriceCents:", p.unitPriceCents)
            }
            return {
              ...p,
              priceCents: price,
              unitPriceCents: price, // Asegurar que también tenga unitPriceCents
              itbisRateBp: p.itbisRateBp ?? 1800,
            }
          })
          setAllProducts(normalized as any)
        } catch {
          setAllProducts([])
        }
      })
    }
    // Guardar preferencia
    localStorage.setItem("posViewMode", viewMode)
  }, [viewMode, isOnline])

  // Guardar el estado del carrito cada vez que cambia
  useEffect(() => {
    if (!isInitialized) return

    if (cart.length > 0) {
      try {
        // Asegurarse de que todos los valores sean serializables
        const serializableCart = cart.map(serializeCartItem)

        const state = {
          cart: serializableCart,
          customerId,
          saleType,
          paymentMethod,
          transferBankName,
          paymentSplits,
          shippingInput,
          discountMode,
          manualDiscountInput,
          timestamp: Date.now(),
        }
        localStorage.setItem("posCartState", JSON.stringify(state))
      } catch (error) {
        console.error("Error guardando estado del carrito:", error)
        // Si hay error al guardar, limpiar el estado
        localStorage.removeItem("posCartState")
      }
    } else {
      // Si el carrito está vacío, limpiar el estado guardado
      localStorage.removeItem("posCartState")
    }
  }, [
    cart,
    customerId,
    saleType,
    paymentMethod,
    transferBankName,
    paymentSplits,
    shippingInput,
    discountMode,
    manualDiscountInput,
    isInitialized,
  ])

  // Interceptar navegación cuando hay productos en el carrito
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest("a")

      if (link && cart.length > 0) {
        const href = link.getAttribute("href")
        if (href && href !== pathname && !href.startsWith("#") && !link.hasAttribute("data-allow-navigation")) {
          // Verificar si es un link interno de Next.js
          if (href.startsWith("/")) {
            e.preventDefault()
            e.stopPropagation()
            setPendingNavigation(href)
            setShowNavigationDialog(true)
          }
        }
      }
    }

    // Interceptar clicks en links
    document.addEventListener("click", handleClick, true)

    // Interceptar beforeunload para cerrar pestaña/ventana
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        try {
          // Asegurarse de que todos los valores sean serializables
          const serializableCart = cart.map(serializeCartItem)

          const state = {
            cart: serializableCart,
            customerId,
            saleType,
            paymentMethod,
            transferBankName,
            paymentSplits,
            shippingInput,
            discountMode,
            manualDiscountInput,
            timestamp: Date.now(),
          }
          localStorage.setItem("posCartState", JSON.stringify(state))
        } catch (error) {
          console.error("Error guardando estado del carrito:", error)
        }
        e.preventDefault()
        e.returnValue = ""
        return ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      document.removeEventListener("click", handleClick, true)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [
    cart,
    customerId,
    saleType,
    paymentMethod,
    transferBankName,
    paymentSplits,
    shippingInput,
    discountMode,
    manualDiscountInput,
    pathname,
  ])

  useEffect(() => {
    const q = query.trim()

    const handle = setTimeout(() => {
      if (q) {
        startSearch(async () => {
          try {
            if (isOnline) {
              try {
                const r = await searchProducts(q)
                setResults(r)
                return
              } catch {
                // Fallback a cache local
              }
            }

            // Buscar en cache offline
            const r = await searchProductsCache(q)
            // Normalizar productos: asegurar que tengan priceCents e itbisRateBp
            const normalized = r.map((p: any) => {
              const price = p.priceCents ?? p.unitPriceCents ?? 0
              if (process.env.NODE_ENV === "development" && price === 0 && p.name) {
                console.log("[POS] Producto sin precio:", p.name, "Campos:", Object.keys(p), "priceCents:", p.priceCents, "unitPriceCents:", p.unitPriceCents)
              }
              return {
                ...p,
                priceCents: price,
                unitPriceCents: price, // Asegurar que también tenga unitPriceCents
                itbisRateBp: p.itbisRateBp ?? 1800,
              }
            })
            setResults(normalized as any)
          } catch {
            setResults([])
          }
        })
      } else {
        // Si no hay query y estamos en vista de grid, cargar todos los productos
        if (viewMode === "grid") {
          startLoadingProducts(async () => {
            try {
              if (isOnline) {
                try {
                  const products = await listAllProductsForSale()
                  setAllProducts(products)
                  return
                } catch {
                  // Fallback a cache local
                }
              }

              // Cargar desde cache offline
              const cached = await getProductsCache()
              // Normalizar productos: asegurar que tengan priceCents e itbisRateBp
              const normalized = cached.map((p: any) => {
                const price = p.priceCents ?? p.unitPriceCents ?? 0
                if (process.env.NODE_ENV === "development" && price === 0 && p.name) {
                  console.log("[POS] Producto sin precio (grid):", p.name, "Campos:", Object.keys(p), "priceCents:", p.priceCents, "unitPriceCents:", p.unitPriceCents)
                }
                return {
                  ...p,
                  priceCents: price,
                  unitPriceCents: price, // Asegurar que también tenga unitPriceCents
                  itbisRateBp: p.itbisRateBp ?? 1800,
                }
              })
              setAllProducts(normalized as any)
            } catch {
              setAllProducts([])
            }
          })
        } else {
          setResults([])
        }
      }
    }, 200)

    return () => clearTimeout(handle)
  }, [query, viewMode, isOnline])

  const {
    subtotalCents,
    itbisCents,
    discountTotalCents,
    itemsTotalCents,
  } = useMemo(() => {
    return calcDiscountedDocumentTotalsByTaxMode(
      cart.map((item) => ({
        unitPriceCents: item.unitPriceCents,
        qty: item.qty,
        itbisRateBp: item.itbisRateBp,
      })),
      salePricesIncludeItbis,
      effectiveDiscountPercentBp
    )
  }, [cart, salePricesIncludeItbis, effectiveDiscountPercentBp])
  const shippingCents = useMemo(() => toCents(shippingInput), [shippingInput])
  const totalCents = useMemo(() => itemsTotalCents + shippingCents, [itemsTotalCents, shippingCents])

  function addToCart(p: ProductResult, recipeAdjustments: RecipeAdjustment[] = []) {
    const productUnit = (p.unit as UnitType) ?? "UNIDAD"
    const stockNum = decimalToNumber(p.stock)
    const normalizedAdjustments = sortRecipeAdjustments(recipeAdjustments)
    const lineId = buildCartLineId(p.id, normalizedAdjustments)

    setCart((prev) => {
      const existing = prev.find((x) => x.lineId === lineId)
      if (existing) {
        // Para productos con medidas, incrementar en 0.5; para unidades, incrementar en 1
        const increment = unitAllowsDecimals(productUnit) ? 0.5 : 1
        return prev.map((x) => (x.lineId === lineId ? { ...x, qty: x.qty + increment } : x))
      }
      return [
        ...prev,
        {
          lineId,
          productId: p.id,
          name: p.name,
          sku: p.sku ?? null,
          reference: p.reference ?? null,
          stock: stockNum,
          qty: 1,
          unitPriceCents: p.priceCents,
          wasPriceOverridden: false,
          unit: productUnit,
          itbisRateBp: p.itbisRateBp ?? 1800,
          productKind: p.productKind === "RECIPE" ? "RECIPE" : p.productKind === "MEASURED" ? "MEASURED" : "BASIC",
          recipeItems: p.recipeItems ?? [],
          recipeAdjustments: normalizedAdjustments,
        },
      ]
    })
  }

  function handleProductSelection(p: ProductResult) {
    addToCart(p)
  }

  function closeRecipeDialog() {
    setRecipeDialogLineId(null)
    setRecipeDialogMode(null)
    setRecipeApplyScope("ONE")
    setRecipeDraftByIngredient({})
  }

  function openRecipeDialogForCartItem(item: CartItem) {
    setRecipeDialogLineId(item.lineId)
    setRecipeDialogMode(null)
    setRecipeApplyScope(item.qty > 1 ? "ONE" : "ALL")
    setRecipeDraftByIngredient(
      item.recipeAdjustments.reduce<Record<string, "SIN" | "EXTRA">>((acc, adjustment) => {
        acc[adjustment.ingredientId] = adjustment.adjustmentType
        return acc
      }, {})
    )
  }

  function resolveRecipeApplyScope(item: CartItem | null, scope: RecipeApplyScope): RecipeApplyScope {
    if (!item) return "ALL"
    return scope === "ONE" && item.qty > 1 ? "ONE" : "ALL"
  }

  function applyRecipeAdjustmentsToCartLine(
    lineId: string,
    recipeAdjustments: RecipeAdjustment[],
    scope: RecipeApplyScope
  ) {
    setCart((prev) =>
      applyRecipeAdjustmentsWithScope({
        lines: prev,
        lineId,
        recipeAdjustments,
        scope,
        buildLineId: buildCartLineId,
        splitQty: 1,
      })
    )
  }

  async function handleBarcodeScan(code: string) {
    const trimmedCode = code.trim()
    if (!trimmedCode) return

    try {
      let product = null
      if (isOnline) {
        try {
          product = await findProductByBarcode(trimmedCode)
        } catch {
          product = await findProductByBarcodeCache(trimmedCode)
        }
      } else {
        product = await findProductByBarcodeCache(trimmedCode)
      }

      if (product) {
        const normalized = {
          ...product,
          priceCents: product.priceCents ?? product.unitPriceCents ?? 0,
          itbisRateBp: product.itbisRateBp ?? 1800,
        }
        handleProductSelection(normalized as any)
        setQuery("")
        toast({ title: "Producto agregado", description: product.name })
      } else {
        toast({ title: "Producto no encontrado", description: `No se encontró producto con código: ${trimmedCode}`, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "No se pudo buscar el producto", variant: "destructive" })
    }
  }

  function isLikelyOfflineError(error: unknown) {
    if (typeof navigator !== "undefined" && !navigator.onLine) return true
    if (error instanceof TypeError) return true
    if (error instanceof Error) {
      const msg = error.message.toLowerCase()
      return msg.includes("failed to fetch") || msg.includes("network") || msg.includes("fetch")
    }
    return false
  }

  async function onSave() {
    // Validaciones iniciales
    if (saleType === SaleType.CREDITO && (!customerId || customerId === "generic")) {
      toast({ title: "Crédito", description: "Para crédito debes seleccionar un cliente." })
      return
    }

    if (saleType === SaleType.CONTADO && !paymentMethod) {
      toast({ title: "Método de pago", description: "Debes seleccionar un método de pago para ventas al contado." })
      return
    }

    if (saleType === SaleType.CONTADO && paymentMethod === PaymentMethod.TRANSFERENCIA && !transferBankName) {
      toast({ title: "Banco", description: "Debes seleccionar el banco de la transferencia." })
      return
    }

    // Si es dividir pago, mostrar diálogo de división
    if (saleType === SaleType.CONTADO && paymentMethod === PaymentMethod.DIVIDIR_PAGO) {
      setEditingPaymentAmounts({})
      setShowSplitPaymentDialog(true)
      return
    }

    // Si es pago en efectivo, mostrar diálogo de cambio
    if (saleType === SaleType.CONTADO && paymentMethod === PaymentMethod.EFECTIVO) {
      setAmountPaidInput("")
      setShowChangeDialog(true)
      return
    }

    // Para otros métodos de pago o crédito, guardar directamente
    await doSave()
  }

  async function doSave() {
    if (!user) {
      toast({ title: "Error", description: "Usuario no disponible. Por favor, recarga la p gina.", variant: "destructive" })
      return
    }

    const discountModeForSave: DiscountMode = canApplyDiscounts ? "MANUAL" : "AUTO"

    const saveSaleOffline = async () => {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      await savePendingSale({
        tempId,
        customerId: customerId === "generic" ? null : customerId,
        type: saleType,
        paymentMethod: saleType === SaleType.CONTADO && paymentMethod !== PaymentMethod.DIVIDIR_PAGO ? paymentMethod : null,
        transferBankName:
          saleType === SaleType.CONTADO && paymentMethod === PaymentMethod.TRANSFERENCIA
            ? transferBankName
            : null,
        paymentSplits: paymentSplits.length > 0 ? paymentSplits : undefined,
        items: cart.map((c) => ({
          productId: c.productId,
          qty: c.qty,
          unitPriceCents: c.unitPriceCents,
          wasPriceOverridden: c.wasPriceOverridden,
          recipeAdjustments: c.recipeAdjustments.map((adjustment) => ({
            ingredientId: adjustment.ingredientId,
            adjustmentType: adjustment.adjustmentType,
          })),
        })),
        shippingCents: shippingCents > 0 ? shippingCents : undefined,
        discountMode: discountModeForSave,
        manualDiscountPercentBp:
          discountModeForSave === "MANUAL" ? manualDiscountPercentBp : undefined,
        salePricesIncludeItbis,
        username: user.username,
        createdAt: Date.now(),
      })

      toast({
        title: "Venta guardada (offline)",
        description: "Se guardar  cuando vuelva la conexi¢n",
      })

      const counts = await getPendingCounts()
      setPendingCounts(counts)
    }

    startSave(async () => {
      try {
        if (!isOnline) {
          await saveSaleOffline()
        } else {
          try {
            const sale = await createSale({
              customerId: customerId === "generic" ? "generic" : customerId,
              type: saleType,
              paymentMethod: saleType === SaleType.CONTADO && paymentMethod !== PaymentMethod.DIVIDIR_PAGO ? paymentMethod : null,
              transferBankName:
                saleType === SaleType.CONTADO && paymentMethod === PaymentMethod.TRANSFERENCIA
                  ? transferBankName
                  : null,
              paymentSplits: paymentSplits.length > 0 ? paymentSplits : undefined,
              items: cart.map((c) => ({
                productId: c.productId,
                qty: c.qty,
                unitPriceCents: c.unitPriceCents,
                wasPriceOverridden: c.wasPriceOverridden,
                recipeAdjustments: c.recipeAdjustments.map((adjustment) => ({
                  ingredientId: adjustment.ingredientId,
                  adjustmentType: adjustment.adjustmentType,
                })),
              })),
              shippingCents: shippingCents > 0 ? shippingCents : undefined,
              discountMode: discountModeForSave,
              manualDiscountPercentBp:
                discountModeForSave === "MANUAL" ? manualDiscountPercentBp : undefined,
              salePricesIncludeItbis,
              username: user.username,
            })

            toast({ title: "Venta guardada", description: `Factura ${sale.invoiceCode}` })
            sessionStorage.setItem(POS_FORCE_RESET_KEY, "1")

            // Autoimpresión térmica por navegador/OS (impresora predeterminada del sistema).
            const receiptUrl = `/api/print/sale/${sale.invoiceCode}?autoprint=1`
            const popup = window.open(receiptUrl, "_blank")

            // Fallback cuando el navegador bloquea popups.
            if (!popup || popup.closed || typeof popup.closed === "undefined") {
              toast({
                title: "Popup bloqueado",
                description: "Se abrirá el ticket en esta pestaña para continuar con la impresión.",
              })
              router.push(receiptUrl)
            }
          } catch (e) {
            if (isLikelyOfflineError(e)) {
              await saveSaleOffline()
            } else {
              throw e
            }
          }
        }

        resetSaleFormState()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error guardando venta"
        toast({ title: "No se pudo guardar", description: msg })
      }
    })
  }

  const amountPaidCents = useMemo(() => toCents(amountPaidInput), [amountPaidInput])
  const changeCents = useMemo(() => amountPaidCents - totalCents, [amountPaidCents, totalCents])
  const exactAmountInput = useMemo(() => (totalCents / 100).toFixed(2), [totalCents])

  // Función helper para obtener la cantidad de un producto en el carrito
  function getCartQuantity(productId: string): number {
    return cart.reduce((sum, item) => (item.productId === productId ? sum + item.qty : sum), 0)
  }

  return (
    <div className={`grid gap-6 ${viewMode === "grid" ? "lg:grid-cols-[1fr_400px]" : "lg:grid-cols-[1fr_380px]"}`}>
      {/* Indicador de modo offline */}
      {mounted && !isOnline && (
        <div className="col-span-full rounded-md border border-yellow-500 bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4" />
            <span className="font-semibold">Modo offline</span>
            <span className="text-muted-foreground">
              {pendingCounts.sales > 0 && `${pendingCounts.sales} venta(s) pendiente(s)`}
              {pendingCounts.sales > 0 && pendingCounts.payments > 0 && " • "}
              {pendingCounts.payments > 0 && `${pendingCounts.payments} pago(s) pendiente(s)`}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Venta</CardTitle>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSaleConfigCollapsed((prev) => !prev)}
                  className="h-8 px-2 text-muted-foreground"
                >
                  {isSaleConfigCollapsed ? (
                    <>
                      <ChevronDown className="mr-1 h-4 w-4" />
                      Mostrar opciones
                    </>
                  ) : (
                    <>
                      <ChevronUp className="mr-1 h-4 w-4" />
                      Ocultar opciones
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <List className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Lista</span>
                  </div>
                  <Switch
                    checked={viewMode === "grid"}
                    onCheckedChange={(checked) => setViewMode(checked ? "grid" : "list")}
                    aria-label="Cambiar vista"
                  />
                  <div className="flex items-center gap-2">
                    <Grid3x3 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Imágenes</span>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!isSaleConfigCollapsed && (
              <>
                <div className="grid gap-2">
                  <Label>Cliente</Label>
                  {shouldUseCustomerSearchModal ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-between font-normal"
                        onClick={() => setCustomerPickerOpen(true)}
                      >
                        <span className="truncate">{selectedCustomerLabel}</span>
                        <Search className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Dialog
                        open={customerPickerOpen}
                        onOpenChange={(open) => {
                          setCustomerPickerOpen(open)
                          if (!open) setCustomerPickerQuery("")
                        }}
                      >
                        <DialogContent className="sm:max-w-[520px]">
                          <DialogHeader>
                            <DialogTitle>Seleccionar cliente</DialogTitle>
                          </DialogHeader>
                          <div className="grid gap-3">
                            <div className="relative">
                              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                value={customerPickerQuery}
                                onChange={(e) => setCustomerPickerQuery(e.target.value)}
                                className="pl-9"
                                placeholder="Buscar cliente por nombre o ID"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-[320px] overflow-y-auto rounded-md border">
                              {filteredCustomers.length === 0 ? (
                                <div className="p-3 text-sm text-muted-foreground">No se encontraron clientes.</div>
                              ) : (
                                <div className="divide-y">
                                  {filteredCustomers.map((c) => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => {
                                        setCustomerId(c.id)
                                        setCustomerPickerOpen(false)
                                        setCustomerPickerQuery("")
                                      }}
                                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                                    >
                                      <span className="truncate">
                                        {c.isGeneric ? "(General) " : ""}
                                        {typeof c.visualId === "number" ? `#${c.visualId} ` : ""}
                                        {c.name}
                                      </span>
                                      {effectiveCustomerId === c.id && <Badge variant="secondary">Actual</Badge>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <Separator />
                            <Button
                              type="button"
                              variant="outline"
                              className="justify-start gap-2"
                              onClick={() => {
                                setCustomerPickerOpen(false)
                                setCustomerPickerQuery("")
                                router.push("/customers")
                              }}
                            >
                              <Plus className="h-4 w-4" />
                              Crear cliente
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>
                  ) : (
                    <Select value={effectiveCustomerId ?? ""} onValueChange={handleCustomerSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.isGeneric ? "(General) " : ""}
                            {typeof c.visualId === "number" ? `#${c.visualId} ` : ""}
                            {c.name}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={CREATE_CUSTOMER_OPTION}>
                          <span className="inline-flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Crear cliente
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={saleType === SaleType.CONTADO ? "default" : "secondary"}
                    onClick={() => {
                      setSaleType(SaleType.CONTADO)
                      if (!paymentMethod) setPaymentMethod(PaymentMethod.EFECTIVO)
                    }}
                  >
                    Contado
                  </Button>
                  <Button
                    type="button"
                    variant={saleType === SaleType.CREDITO ? "default" : "secondary"}
                    onClick={() => setSaleType(SaleType.CREDITO)}
                  >
                    Crédito
                  </Button>
                </div>

                {saleType === SaleType.CONTADO && (
                  <div className="grid gap-2">
                    <Label>Método de pago</Label>
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={paymentMethod ?? ""}
                      onChange={(e) => {
                        const nextMethod = e.target.value as PaymentMethod
                        setPaymentMethod(nextMethod)
                        if (nextMethod !== PaymentMethod.TRANSFERENCIA) {
                          setTransferBankName("")
                        }
                      }}
                    >
                      <option value={PaymentMethod.EFECTIVO}>Efectivo</option>
                      <option value={PaymentMethod.TRANSFERENCIA}>Transferencia</option>
                      <option value={PaymentMethod.TARJETA}>Tarjeta</option>
                      <option value={PaymentMethod.DIVIDIR_PAGO}>Dividir pago</option>
                    </select>
                  </div>
                )}

                {saleType === SaleType.CONTADO && paymentMethod === PaymentMethod.TRANSFERENCIA && (
                  <div className="grid gap-2">
                    <Label>Banco de la transferencia</Label>
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={transferBankName}
                      onChange={(e) => setTransferBankName(e.target.value)}
                    >
                      <option value="">Selecciona un banco</option>
                      {DOMINICAN_BANKS.map((bankName) => (
                        <option key={bankName} value={bankName}>
                          {bankName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label>Descuento (%)</Label>
                  <Input
                    value={manualDiscountInput}
                    onChange={(e) => setManualDiscountInput(clampPercentInput(e.target.value))}
                    inputMode="decimal"
                    placeholder="0.00"
                    disabled={!canApplyDiscounts}
                  />
                  {!canApplyDiscounts && (
                    <p className="text-xs text-muted-foreground">
                      El descuento mostrado viene del cliente. Tu usuario no puede modificarlo.
                    </p>
                  )}
                </div>

                <Separator />
              </>
            )}

            {isSaleConfigCollapsed && (
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setIsSaleConfigCollapsed(false)}
                  className="flex w-full items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/60 hover:border-foreground/20 transition-colors cursor-pointer text-left"
                >
                  <span>
                    {selectedCustomerLabel} ·{" "}
                    {saleType === SaleType.CONTADO ? "Contado" : "Crédito"}
                    {saleType === SaleType.CONTADO && paymentMethod ? ` · ${paymentMethod.toLowerCase().replace("_", " ")}` : ""}
                    {effectiveDiscountPercentBp > 0 ? ` · Desc. ${(effectiveDiscountPercentBp / 100).toFixed(2)}%` : ""}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 ml-2" />
                </button>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Buscar producto (descripción / código / referencia)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => {
                    const now = Date.now()
                    const newValue = e.target.value

                    // Si el campo se vacía, resetear tiempos
                    if (newValue.length === 0) {
                      firstKeyPressTime.current = 0
                      lastKeyPressTime.current = 0
                    } else {
                      // Si es el primer carácter, guardar el tiempo
                      if (firstKeyPressTime.current === 0) {
                        firstKeyPressTime.current = now
                      }
                      // Si el tiempo desde la última tecla es muy largo (> 200ms), resetear
                      // Esto indica que el usuario está escribiendo manualmente, no escaneando
                      if (lastKeyPressTime.current > 0 && now - lastKeyPressTime.current > 200) {
                        firstKeyPressTime.current = now
                      }
                      lastKeyPressTime.current = now
                    }

                    setQuery(newValue)
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && query.trim()) {
                      const now = Date.now()
                      const timeSinceFirstKey = firstKeyPressTime.current > 0 ? now - firstKeyPressTime.current : 0
                      const timeSinceLastKey = lastKeyPressTime.current > 0 ? now - lastKeyPressTime.current : 0

                      // Detectar escaneo de código de barras:
                      // - Tiempo total muy corto (< 500ms) para códigos de más de 3 caracteres O
                      // - Tiempo desde última tecla muy corto (< 100ms) O
                      // - Texto tiene más de 10 caracteres (códigos de barras suelen ser largos)
                      const isLikelyBarcode =
                        (timeSinceFirstKey > 0 && timeSinceFirstKey < 500 && query.length > 3) ||
                        (timeSinceLastKey > 0 && timeSinceLastKey < 100) ||
                        query.length > 10

                      if (isLikelyBarcode) {
                        e.preventDefault()
                        await handleBarcodeScan(query)
                        // Resetear los tiempos
                        firstKeyPressTime.current = 0
                        lastKeyPressTime.current = 0
                      }
                    }
                  }}
                  className="pl-10"
                  placeholder="Buscar productos"
                />
              </div>
            </div>

            {viewMode === "list" ? (
              // Vista de lista (original)
              query.trim() && (
                <div className="rounded-md border">
                  {results.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      {isSearching ? "Buscando…" : "Sin resultados"}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {results.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => handleProductSelection(p)}
                          className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              Código: {p.sku ?? "—"} · Ref: {p.reference ?? "—"} · {" "}
                              {p.productKind === "RECIPE"
                                ? "Disponibilidad por insumos"
                                : `Existencia: ${formatQty(decimalToNumber(p.stock), (p.unit as UnitType) ?? "UNIDAD")}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold">{formatRD(p.priceCents)}</div>
                            <Plus className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : (
              // Vista de grid (imágenes)
              <div className="space-y-4">
                {query.trim() ? (
                  // Mostrar resultados de búsqueda en grid
                  results.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      {isSearching ? "Buscando…" : "Sin resultados"}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                      {results.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => handleProductSelection(p)}
                          className="group relative flex flex-col rounded-lg border-2 border-border hover:border-purple-primary transition-colors bg-card shadow-sm"
                        >
                          <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden rounded-t-lg">
                            {p.imageUrls && p.imageUrls.length > 0 ? (
                              <img
                                src={p.imageUrls[0]}
                                alt={p.name}
                                loading="lazy"
                                decoding="async"
                                className="object-contain max-w-full max-h-full"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                <div className="text-center p-4">
                                  <div className="text-2xl mb-1">{p.name.charAt(0).toUpperCase()}</div>
                                  <div className="text-xs">Sin imagen</div>
                                </div>
                              </div>
                            )}
                            {getCartQuantity(p.id) > 0 ? (
                              <div className="absolute top-2 right-2 bg-purple-primary text-white rounded-full min-w-[24px] h-6 px-2 flex items-center justify-center text-xs font-semibold shadow-lg">
                                {getCartQuantity(p.id)}
                              </div>
                            ) : (
                              <div className="absolute top-2 right-2 bg-purple-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                <Plus className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div className="p-3 space-y-1">
                            <div className="font-medium text-sm truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{p.reference ?? "—"}</div>
                            <div className="text-sm font-semibold text-purple-primary">{formatRD(p.priceCents)}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.productKind === "RECIPE"
                                ? "Por receta"
                                : `${p.stock} disponible${p.stock !== 1 ? "s" : ""}`}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  // Mostrar todos los productos en grid
                  isLoadingProducts ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Cargando productos…</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                      {/* Tarjeta para crear producto */}
                      <Link
                        href="/products"
                        data-allow-navigation
                        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-purple-primary transition-colors bg-muted/30 aspect-square p-4 text-center"
                      >
                        <Plus className="h-12 w-12 text-muted-foreground mb-2" />
                        <span className="text-sm font-medium text-muted-foreground">Crear producto</span>
                      </Link>

                      {allProducts.map((p) => {
                        const cartQty = getCartQuantity(p.id)
                        return (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => handleProductSelection(p)}
                            className="group relative flex flex-col rounded-lg border-2 border-border hover:border-purple-primary transition-colors bg-card shadow-sm"
                          >
                            <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden rounded-t-lg">
                              {p.imageUrls && p.imageUrls.length > 0 ? (
                                <img
                                  src={p.imageUrls[0]}
                                  alt={p.name}
                                  loading="lazy"
                                  decoding="async"
                                  className="object-contain max-w-full max-h-full"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                  <div className="text-center p-4">
                                    <div className="text-2xl mb-1">{p.name.charAt(0).toUpperCase()}</div>
                                    <div className="text-xs">Sin imagen</div>
                                  </div>
                                </div>
                              )}
                              {cartQty > 0 ? (
                                <div className="absolute top-2 right-2 bg-purple-primary text-white rounded-full min-w-[24px] h-6 px-2 flex items-center justify-center text-xs font-semibold shadow-lg">
                                  {cartQty}
                                </div>
                              ) : (
                                <div className="absolute top-2 right-2 bg-purple-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Plus className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                            <div className="p-3 space-y-1">
                              <div className="font-medium text-sm truncate">{p.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{p.reference ?? "—"}</div>
                              <div className="text-sm font-semibold text-purple-primary">{formatRD(p.priceCents)}</div>
                              <div className="text-xs text-muted-foreground">
                                {p.productKind === "RECIPE"
                                  ? "Disponibilidad por insumos"
                                  : `${formatQty(decimalToNumber(p.stock), (p.unit as UnitType) ?? "UNIDAD")} disponible`}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {viewMode === "list" && (
          <Card>
            <CardHeader>
              <CardTitle>Carrito</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 ? (
                <div className="text-sm text-muted-foreground">Agrega productos para empezar.</div>
              ) : (
                <div className="space-y-3">
                  {cart.map((c) => {
                    const allowsDecimals = unitAllowsDecimals(c.unit)
                    const increment = allowsDecimals ? 0.5 : 1
                    const minQty = allowsDecimals ? 0.5 : 1
                    const unitInfo = getUnitInfo(c.unit)
                    return (
                      <div key={c.lineId} className="flex items-start justify-between gap-3 rounded-md border p-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            Código: {c.sku ?? "—"} · Ref: {c.reference ?? "—"}
                            {c.unit !== "UNIDAD" && <span className="ml-2 text-purple-primary">({unitInfo.abbr})</span>}
                          </div>
                          {c.recipeItems.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {getRecipeVariantLabels(c.recipeAdjustments).map((label) => (
                                <Badge
                                  key={`${c.lineId}-${label}`}
                                  variant={label === "Normal" ? "secondary" : "outline"}
                                  className="text-[11px]"
                                >
                                  {label}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                // Limpiar estado de edición antes de decrementar
                                setEditingQuantities((prev) => {
                                  const next = { ...prev }
                                  delete next[c.lineId]
                                  return next
                                })
                                setCart((p) =>
                                  p.map((x) =>
                                    x.lineId === c.lineId ? { ...x, qty: Math.max(minQty, x.qty - increment) } : x
                                  )
                                )
                              }}
                            >
                              -
                            </Button>
                            <Input
                              type="text"
                              inputMode={allowsDecimals ? "decimal" : "numeric"}
                              className="w-16 text-center text-sm font-semibold h-9"
                              value={editingQuantities[c.lineId] ?? formatQtyNumber(c.qty, c.unit)}
                              onChange={(e) => {
                                // Solo actualizar el estado temporal mientras el usuario escribe
                                let rawValue = e.target.value

                                // Si no permite decimales, remover cualquier punto decimal
                                if (!allowsDecimals && rawValue.includes(".")) {
                                  rawValue = rawValue.replace(".", "")
                                }

                                // Solo permitir números enteros si no permite decimales
                                if (!allowsDecimals) {
                                  // Remover cualquier carácter no numérico excepto el menos al inicio (aunque no usamos negativos)
                                  rawValue = rawValue.replace(/[^\d]/g, "")
                                }

                                setEditingQuantities((prev) => ({ ...prev, [c.lineId]: rawValue }))
                              }}
                              onBlur={(e) => {
                                // Parsear y validar el valor al perder el foco
                                const rawValue = e.target.value.trim()
                                const newQty = parseQty(rawValue, c.unit)
                                const finalQty = newQty < (allowsDecimals ? 0.01 : 1) ? (allowsDecimals ? 0.5 : 1) : newQty

                                setCart((p) =>
                                  p.map((x) =>
                                    x.lineId === c.lineId ? { ...x, qty: finalQty } : x
                                  )
                                )

                                // Limpiar el estado de edición
                                setEditingQuantities((prev) => {
                                  const next = { ...prev }
                                  delete next[c.lineId]
                                  return next
                                })
                              }}
                              onKeyDown={(e) => {
                                // Permitir Enter para confirmar
                                if (e.key === "Enter") {
                                  e.currentTarget.blur()
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                // Limpiar estado de edición antes de incrementar
                                setEditingQuantities((prev) => {
                                  const next = { ...prev }
                                  delete next[c.lineId]
                                  return next
                                })
                                setCart((p) => p.map((x) => (x.lineId === c.lineId ? { ...x, qty: x.qty + increment } : x)))
                              }}
                            >
                              +
                            </Button>
                            <div className="ml-2 text-sm text-muted-foreground">x</div>
                            {user && user.canOverridePrice ? (
                              <div className="w-36">
                                <PriceInput
                                  className="text-right px-2"
                                  valueCents={c.unitPriceCents}
                                  onChangeCents={(unitPriceCents) => {
                                    // Obtener el precio original del producto para comparar
                                    const product = allProducts.find((p) => p.id === c.productId) || results.find((p) => p.id === c.productId)
                                    const originalPriceCents = product?.priceCents || c.unitPriceCents
                                    setCart((p) =>
                                      p.map((x) =>
                                        x.lineId === c.lineId
                                          ? {
                                            ...x,
                                            unitPriceCents,
                                            wasPriceOverridden: unitPriceCents !== originalPriceCents,
                                          }
                                          : x
                                      )
                                    )
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">{formatRD(c.unitPriceCents)}</div>
                            )}
                          </div>
                          {c.productKind === "RECIPE" ? (
                            <div className="mt-2 text-xs text-muted-foreground">Disponibilidad validada por insumos al guardar la venta.</div>
                          ) : !allowNegativeStock && c.qty > c.stock ? (
                            <div className="mt-2 text-xs font-medium text-destructive">
                              Existencia insuficiente (Existencia: {formatQty(c.stock, c.unit)}). Ajustes → &quot;Permitir vender sin existencia&quot;.
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="text-sm font-semibold">{formatRD(c.unitPriceCents * c.qty)}</div>
                          {c.recipeItems.length > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openRecipeDialogForCartItem(c)}
                            >
                              Personalizar
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setCart((p) => p.filter((x) => x.lineId !== c.lineId))}
                            aria-label="Quitar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        {viewMode === "grid" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Productos</CardTitle>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Vaciar canasta
                </button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 ? (
                <div className="text-sm text-muted-foreground">Agrega productos para empezar.</div>
              ) : (
                <div className="space-y-3">
                  {cart.map((c) => {
                    const allowsDecimals = unitAllowsDecimals(c.unit)
                    const increment = allowsDecimals ? 0.5 : 1
                    const minQty = allowsDecimals ? 0.5 : 1

                    return (
                      <div key={c.lineId} className="space-y-2">
                        <div className="flex items-start gap-3">
                          <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                            {(() => {
                              const product = allProducts.find((p) => p.id === c.productId) || results.find((p) => p.id === c.productId)
                              if (product?.imageUrls && product.imageUrls.length > 0) {
                                return (
                                  <img
                                    src={product.imageUrls[0]}
                                    alt={c.name}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-contain"
                                  />
                                )
                              }
                              return (
                                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                              )
                            })()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{c.name}</div>
                            <div className="text-xs text-destructive">
                              {c.productKind === "RECIPE"
                                ? "Disponibilidad por insumos"
                                : `${formatQty(c.stock, c.unit)} Disponible${c.stock !== 1 ? "s" : ""}`}
                            </div>
                            {c.recipeItems.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {getRecipeVariantLabels(c.recipeAdjustments).map((label) => (
                                  <Badge
                                    key={`${c.lineId}-grid-${label}`}
                                    variant={label === "Normal" ? "secondary" : "outline"}
                                    className="text-[11px]"
                                  >
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => {
                                  setEditingQuantities((prev) => {
                                    const next = { ...prev }
                                    delete next[c.lineId]
                                    return next
                                  })
                                  setCart((p) =>
                                    p.map((x) =>
                                      x.lineId === c.lineId ? { ...x, qty: Math.max(minQty, x.qty - increment) } : x
                                    )
                                  )
                                }}
                              >
                                -
                              </Button>
                              <Input
                                type="text"
                                inputMode={allowsDecimals ? "decimal" : "numeric"}
                                className="h-8 w-16 text-center text-sm font-semibold"
                                value={editingQuantities[c.lineId] ?? formatQtyNumber(c.qty, c.unit)}
                                onChange={(e) => {
                                  let rawValue = e.target.value
                                  if (!allowsDecimals && rawValue.includes(".")) {
                                    rawValue = rawValue.replace(".", "")
                                  }
                                  if (!allowsDecimals) {
                                    rawValue = rawValue.replace(/[^\d]/g, "")
                                  }
                                  setEditingQuantities((prev) => ({ ...prev, [c.lineId]: rawValue }))
                                }}
                                onBlur={(e) => {
                                  const rawValue = e.target.value.trim()
                                  const newQty = parseQty(rawValue, c.unit)
                                  const finalQty = newQty < (allowsDecimals ? 0.01 : 1) ? (allowsDecimals ? 0.5 : 1) : newQty

                                  setCart((p) =>
                                    p.map((x) =>
                                      x.lineId === c.lineId ? { ...x, qty: finalQty } : x
                                    )
                                  )

                                  setEditingQuantities((prev) => {
                                    const next = { ...prev }
                                    delete next[c.lineId]
                                    return next
                                  })
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.currentTarget.blur()
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => {
                                  setEditingQuantities((prev) => {
                                    const next = { ...prev }
                                    delete next[c.lineId]
                                    return next
                                  })
                                  setCart((p) => p.map((x) => (x.lineId === c.lineId ? { ...x, qty: x.qty + increment } : x)))
                                }}
                              >
                                +
                              </Button>
                              {user && user.canOverridePrice ? (
                                <div className="w-32 ml-auto">
                                  <PriceInput
                                    className="text-right px-2"
                                    valueCents={c.unitPriceCents}
                                    onChangeCents={(unitPriceCents) => {
                                      // Obtener el precio original del producto para comparar
                                      const product = allProducts.find((p) => p.id === c.productId) || results.find((p) => p.id === c.productId)
                                      const originalPriceCents = product?.priceCents || c.unitPriceCents
                                      setCart((p) =>
                                        p.map((x) =>
                                          x.lineId === c.lineId
                                            ? {
                                              ...x,
                                              unitPriceCents,
                                              wasPriceOverridden: unitPriceCents !== originalPriceCents,
                                            }
                                            : x
                                        )
                                      )
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="ml-auto text-sm font-semibold">{formatRD(c.unitPriceCents)}</div>
                              )}
                              {c.recipeItems.length > 0 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => openRecipeDialogForCartItem(c)}
                                >
                                  Personalizar
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setCart((p) => p.filter((x) => x.lineId !== c.lineId))}
                                aria-label="Quitar"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Precio por {formatQty(c.qty, c.unit)}: {formatRD(c.unitPriceCents * c.qty)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-4xl font-semibold tracking-tight" suppressHydrationWarning>
              {formatRD(totalCents)}
            </div>
            <div className="grid gap-2">
              <div className="grid gap-2">
                <Label>Flete (opcional)</Label>
                <Input
                  value={shippingInput}
                  onChange={(e) => {
                    const value = e.target.value
                    // Solo permitir números y un punto decimal
                    const numericValue = value.replace(/[^\d.]/g, "")
                    // Evitar múltiples puntos decimales
                    const parts = numericValue.split(".")
                    const filteredValue = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : numericValue
                    setShippingInput(filteredValue)
                  }}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-1.5 text-sm">
              {discountTotalCents > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Descuento ({(effectiveDiscountPercentBp / 100).toFixed(2)}%)</span>
                  <span>-{formatRD(discountTotalCents)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatRD(showItbisOnReceipts ? subtotalCents : itemsTotalCents)}</span>
              </div>
              {!showItbisOnReceipts ? null : (
                <div className="flex justify-between text-muted-foreground">
                  <span>ITBIS</span>
                  <span>{formatRD(itbisCents)}</span>
                </div>
              )}
              {shippingCents > 0 && (
                <div className="flex justify-between">
                  <span>Envío</span>
                  <span>{formatRD(shippingCents)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>{formatRD(totalCents)}</span>
              </div>
            </div>
            <Button
              type="button"
              className="w-full"
              size="lg"
              disabled={isSaving || cart.length === 0}
              onClick={onSave}
            >
              {isSaving ? "Guardando…" : "Guardar e imprimir"}
            </Button>
            <div className="text-xs text-muted-foreground">
              {salePricesIncludeItbis
                ? "Precios incluyen ITBIS. Factura tamaño carta con serie A."
                : "Precios no incluyen ITBIS. Factura tamaño carta con serie A."}
            </div>
          </CardContent>
        </Card>

        {cart.length === 0 && (
          <Card>
            <CardContent className="py-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <img
                  src="/barcodereader.webp"
                  alt="Lector de código de barras"
                  className="w-32 h-32 object-contain"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Agrega productos rápidamente usando
                  </p>
                  <p className="text-sm font-medium">
                    tu lector de código de barras
                  </p>
                </div>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Escanea el código de barras del producto en el campo de búsqueda y se agregará automáticamente al carrito
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showChangeDialog} onOpenChange={setShowChangeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Calcula el cambio de tu venta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Valor de la venta</Label>
              <Input
                value={formatRD(totalCents)}
                readOnly
                disabled
                className="bg-muted"
              />
            </div>
            <div className="grid gap-2">
              <Label>¿Con cuánto paga tu cliente?</Label>
              <Input
                value={amountPaidInput}
                onChange={(e) => {
                  const value = e.target.value
                  // Solo permitir números y un punto decimal
                  const numericValue = value.replace(/[^\d.]/g, "")
                  // Evitar múltiples puntos decimales
                  const parts = numericValue.split(".")
                  const filteredValue = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : numericValue
                  setAmountPaidInput(filteredValue)
                }}
                inputMode="decimal"
                placeholder="0.00"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && changeCents >= 0) {
                    doSave()
                  }
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>Valor a devolver</Label>
              {changeCents < 0 ? (
                <button
                  type="button"
                  onClick={() => setAmountPaidInput(exactAmountInput)}
                  className="text-left text-2xl font-semibold text-destructive underline-offset-2 hover:underline"
                  title="Haz clic para usar el monto exacto de la factura"
                >
                  {`Falta: ${formatRD(Math.abs(changeCents))}`}
                </button>
              ) : (
                <div className="text-2xl font-semibold text-foreground">
                  {formatRD(changeCents)}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowChangeDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={doSave}
              disabled={isSaving || changeCents < 0 || amountPaidCents === 0}
            >
              {isSaving ? "Guardando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSplitPaymentDialog} onOpenChange={setShowSplitPaymentDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dividir pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Total de la venta</Label>
              <Input
                value={formatRD(totalCents)}
                readOnly
                disabled
                className="bg-muted text-lg font-semibold"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Métodos de pago</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPaymentSplits([...paymentSplits, { method: PaymentMethod.EFECTIVO, amountCents: 0, transferBankName: null }])
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar método
                </Button>
              </div>

              {paymentSplits.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                  No hay métodos de pago agregados. Haz clic en &quot;Agregar método&quot; para comenzar.
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentSplits.map((split, index) => {
                    const amountInput = editingPaymentAmounts[index] ?? (split.amountCents > 0 ? (split.amountCents / 100).toFixed(2) : "")

                    return (
                      <div key={index} className="flex items-start gap-3 p-3 border rounded-md">
                        <div className="flex-1 grid gap-2">
                          <Label>Método</Label>
                          <select
                            className="h-10 rounded-md border bg-background px-3 text-sm"
                            value={split.method}
                            onChange={(e) => {
                              const newSplits = [...paymentSplits]
                              newSplits[index].method = e.target.value as PaymentMethod
                              if (newSplits[index].method !== PaymentMethod.TRANSFERENCIA) {
                                newSplits[index].transferBankName = null
                              }
                              setPaymentSplits(newSplits)
                            }}
                          >
                            <option value={PaymentMethod.EFECTIVO}>Efectivo</option>
                            <option value={PaymentMethod.TRANSFERENCIA}>Transferencia</option>
                            <option value={PaymentMethod.TARJETA}>Tarjeta</option>
                            <option value={PaymentMethod.OTRO}>Otro</option>
                          </select>
                        </div>
                        {split.method === PaymentMethod.TRANSFERENCIA && (
                          <div className="flex-1 grid gap-2">
                            <Label>Banco</Label>
                            <select
                              className="h-10 rounded-md border bg-background px-3 text-sm"
                              value={split.transferBankName ?? ""}
                              onChange={(e) => {
                                const newSplits = [...paymentSplits]
                                newSplits[index].transferBankName = e.target.value || null
                                setPaymentSplits(newSplits)
                              }}
                            >
                              <option value="">Selecciona un banco</option>
                              {DOMINICAN_BANKS.map((bankName) => (
                                <option key={bankName} value={bankName}>
                                  {bankName}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="flex-1 grid gap-2">
                          <Label>Monto (RD$)</Label>
                          <Input
                            value={amountInput}
                            onChange={(e) => {
                              const value = e.target.value
                              const numericValue = value.replace(/[^\d.]/g, "")
                              const parts = numericValue.split(".")
                              const filteredValue = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : numericValue

                              // Actualizar estado temporal mientras el usuario escribe
                              setEditingPaymentAmounts((prev) => ({ ...prev, [index]: filteredValue }))
                            }}
                            onBlur={(e) => {
                              // Parsear y validar el valor al perder el foco
                              const rawValue = e.target.value.trim()
                              const amountCents = toCents(rawValue)

                              const newSplits = [...paymentSplits]
                              newSplits[index].amountCents = amountCents
                              setPaymentSplits(newSplits)

                              // Limpiar el estado de edición
                              setEditingPaymentAmounts((prev) => {
                                const next = { ...prev }
                                delete next[index]
                                return next
                              })
                            }}
                            onKeyDown={(e) => {
                              // Permitir Enter para confirmar
                              if (e.key === "Enter") {
                                e.currentTarget.blur()
                              }
                            }}
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mt-8"
                          onClick={() => {
                            setPaymentSplits(paymentSplits.filter((_, i) => i !== index))
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 border-t space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total pagado:</span>
                <span className="font-semibold">
                  {formatRD(paymentSplits.reduce((sum, s) => sum + s.amountCents, 0))}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total de la venta:</span>
                <span className="font-semibold">{formatRD(totalCents)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Diferencia:</span>
                <span className={totalCents - paymentSplits.reduce((sum, s) => sum + s.amountCents, 0) === 0 ? "text-green-600" : "text-destructive"}>
                  {formatRD(totalCents - paymentSplits.reduce((sum, s) => sum + s.amountCents, 0))}
                </span>
              </div>
              {paymentSplits.length > 0 && paymentSplits.reduce((sum, s) => sum + s.amountCents, 0) !== totalCents && (
                <div className="text-xs text-destructive mt-2">
                  La suma de los pagos debe ser igual al total de la venta.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSplitPaymentDialog(false)
                setPaymentSplits([])
                setEditingPaymentAmounts({})
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={doSave}
              disabled={
                isSaving ||
                paymentSplits.length === 0 ||
                paymentSplits.reduce((sum, s) => sum + s.amountCents, 0) !== totalCents ||
                paymentSplits.some((s) => s.amountCents <= 0 || (s.method === PaymentMethod.TRANSFERENCIA && !s.transferBankName))
              }
            >
              {isSaving ? "Guardando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!recipeDialogCartItem}
        onOpenChange={(open) => {
          if (!open) {
            closeRecipeDialog()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustes de receta — {recipeDialogCartItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-sm text-muted-foreground">
              Selecciona el modo y marca los ingredientes que quieras ajustar. Los ajustes ya aplicados se mantienen
              al cambiar de modo.
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={recipeDialogMode === "SIN" ? "default" : "outline"}
                onClick={() => setRecipeDialogMode("SIN")}
              >
                Sin
              </Button>
              <Button
                type="button"
                variant={recipeDialogMode === "EXTRA" ? "default" : "outline"}
                onClick={() => setRecipeDialogMode("EXTRA")}
              >
                Extra
              </Button>
            </div>
            {recipeDialogCartItem && recipeDialogCartItem.qty > 1 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Aplicar a:</div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={recipeApplyScope === "ONE" ? "default" : "outline"}
                    onClick={() => setRecipeApplyScope("ONE")}
                  >
                    Solo 1 unidad
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={recipeApplyScope === "ALL" ? "default" : "outline"}
                    onClick={() => setRecipeApplyScope("ALL")}
                  >
                    Todas las unidades
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(recipeDialogCartItem?.recipeItems ?? []).map((item) => {
                const current = recipeDraftByIngredient[item.ingredientId]
                const checked = Boolean(current)
                return (
                  <label
                    key={item.ingredientId}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm cursor-pointer"
                  >
                    <div>
                      <div className="font-medium">{item.ingredientName}</div>
                      {current && (
                        <div className="text-xs text-muted-foreground">Aplicado: {current === "SIN" ? "Sin" : "Extra"}</div>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!recipeDialogMode}
                      onChange={() => {
                        if (!recipeDialogMode) return
                        setRecipeDraftByIngredient((prev) => {
                          const next = { ...prev }
                          if (next[item.ingredientId] === recipeDialogMode) {
                            delete next[item.ingredientId]
                          } else {
                            next[item.ingredientId] = recipeDialogMode
                          }
                          return next
                        })
                      }}
                    />
                  </label>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (recipeDialogCartItem) {
                  const scope = resolveRecipeApplyScope(recipeDialogCartItem, recipeApplyScope)
                  const adjustments = (recipeDialogCartItem.recipeItems ?? []).flatMap((item) => {
                    const adjustmentType = recipeDraftByIngredient[item.ingredientId]
                    if (!adjustmentType) return []
                    return [
                      {
                        ingredientId: item.ingredientId,
                        ingredientName: item.ingredientName,
                        adjustmentType,
                      } as RecipeAdjustment,
                    ]
                  })
                  applyRecipeAdjustmentsToCartLine(recipeDialogCartItem.lineId, adjustments, scope)
                  const variantLabel =
                    adjustments.length > 0 ? adjustments.map(formatAdjustmentLabel).join(", ") : "Normal"
                  const description =
                    adjustments.length === 0
                      ? scope === "ONE"
                        ? "Se dejó 1 unidad en versión normal."
                        : "Se dejó toda la línea en versión normal."
                      : scope === "ONE"
                        ? `Se personalizó 1 unidad: ${variantLabel}.`
                        : `Se personalizó toda la línea: ${variantLabel}.`
                  toast({
                    title: "Personalización aplicada",
                    description,
                  })
                }
                closeRecipeDialog()
              }}
            >
              Aplicar ajustes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNavigationDialog} onOpenChange={setShowNavigationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              ¿Desea guardar el pedido para después?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-4">
              <img src="/pausa.webp" alt="Pausa" className="h-64 w-64 object-contain" />
              <p className="text-base font-medium text-center">
                Tienes {cart.length} producto{cart.length !== 1 ? "s" : ""} en tu carrito.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowNavigationDialog(false)
                setPendingNavigation(null)
              }}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingNavigation) {
                  // No guardar, solo limpiar el estado y navegar
                  localStorage.removeItem("posCartState")
                  setShowNavigationDialog(false)
                  router.push(pendingNavigation)
                  setPendingNavigation(null)
                }
              }}
              className="w-full sm:w-auto"
            >
              No
            </Button>
            <Button
              onClick={() => {
                if (pendingNavigation) {
                  try {
                    // Guardar estado antes de navegar - asegurarse de que todos los valores sean serializables
                    const serializableCart = cart.map(serializeCartItem)

                    const state = {
                      cart: serializableCart,
                      customerId,
                      saleType,
                      paymentMethod,
                      transferBankName,
                      paymentSplits,
                      shippingInput,
                      discountMode,
                      manualDiscountInput,
                      timestamp: Date.now(),
                    }
                    localStorage.setItem("posCartState", JSON.stringify(state))
                  } catch (error) {
                    console.error("Error guardando estado del carrito:", error)
                  }
                  setShowNavigationDialog(false)
                  router.push(pendingNavigation)
                  setPendingNavigation(null)
                }
              }}
              className="w-full sm:w-auto"
            >
              Sí
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

