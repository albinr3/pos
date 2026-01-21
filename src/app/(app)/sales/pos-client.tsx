"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { SaleType, PaymentMethod, UnitType } from "@prisma/client"
import { Plus, Search, Trash2, Grid3x3, List, AlertCircle, X, WifiOff } from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { PriceInput } from "@/components/app/price-input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { formatRD, calcItbisIncluded, toCents } from "@/lib/money"
import { formatQty, formatQtyNumber, parseQty, decimalToNumber, unitAllowsDecimals, getUnitInfo } from "@/lib/units"
import { toast } from "@/hooks/use-toast"
import { useOnlineStatus } from "@/hooks/use-online-status"
import {
  savePendingSale,
  searchProductsCache,
  getProductsCache,
  getCustomersCache,
  getPendingCounts,
  findProductByBarcodeCache,
} from "@/lib/indexed-db"
import { syncPendingData } from "@/lib/sync-manager"
import {
  syncProductsToIndexedDB,
  syncCustomersToIndexedDB,
} from "@/app/(app)/sync/actions"

import type { CurrentUser } from "@/lib/auth"

import { createSale, listCustomers, searchProducts, listAllProductsForSale, findProductByBarcode } from "./actions"

type ProductResult = Awaited<ReturnType<typeof searchProducts>>[number]

type CartItem = {
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
}

type Customer = Awaited<ReturnType<typeof listCustomers>>[number]

export function PosClient() {
  const isOnline = useOnlineStatus()
  const [mounted, setMounted] = useState(false)
  const [query, setQuery] = useState("")
  
  // Evitar error de hidratación: solo mostrar indicador después de montar
  useEffect(() => {
    setMounted(true)
  }, [])
  const [results, setResults] = useState<ProductResult[]>([])
  const [isSearching, startSearch] = useTransition()
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [allProducts, setAllProducts] = useState<ProductResult[]>([])
  const [isLoadingProducts, startLoadingProducts] = useTransition()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string | null>("generic")
  const [saleType, setSaleType] = useState<SaleType>(SaleType.CONTADO)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(PaymentMethod.EFECTIVO)
  const [pendingCounts, setPendingCounts] = useState({ sales: 0, payments: 0 })

  const [cart, setCart] = useState<CartItem[]>([])
  const [shippingInput, setShippingInput] = useState("")
  const [user, setUser] = useState<CurrentUser | null>(null)
  // Usar el permiso del usuario para vender sin stock
  const allowNegativeStock = useMemo(() => user?.canSellWithoutStock || user?.role === "ADMIN" || false, [user])
  const [isSaving, startSave] = useTransition()
  const [showChangeDialog, setShowChangeDialog] = useState(false)
  const [amountPaidInput, setAmountPaidInput] = useState("")
  const [showSplitPaymentDialog, setShowSplitPaymentDialog] = useState(false)
  const [paymentSplits, setPaymentSplits] = useState<Array<{method: PaymentMethod, amountCents: number}>>([])
  const [editingPaymentAmounts, setEditingPaymentAmounts] = useState<Record<number, string>>({})
  // Estado temporal para valores de cantidad en edición (productId -> string)
  const [editingQuantities, setEditingQuantities] = useState<Record<string, string>>({})
  const [showNavigationDialog, setShowNavigationDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  
  // Ref para rastrear el tiempo de la primera y última tecla (para detectar escaneo de código de barras)
  const firstKeyPressTime = useRef<number>(0)
  const lastKeyPressTime = useRef<number>(0)
  
  const router = useRouter()
  const pathname = usePathname()

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
    const loadInitialData = async () => {
      // Pre-cargar datos a IndexedDB si hay conexión
      if (isOnline) {
        try {
          const [productsData, customersData] = await Promise.all([
            syncProductsToIndexedDB(),
            syncCustomersToIndexedDB(),
          ])
          
          // Guardar en IndexedDB
          const { saveProductsCache, saveCustomersCache } = await import("@/lib/indexed-db")
          await saveProductsCache(productsData)
          await saveCustomersCache(customersData)
        } catch (error) {
          console.error("Error pre-cargando datos:", error)
        }
      }

      const loadCustomersFromCache = async () => {
        const cached = await getCustomersCache()
        setCustomers(cached)
        if (cached.length === 0) {
          toast({
            title: "Sin datos offline",
            description: "Con‚ctate y precarga clientes/productos para vender sin internet.",
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
        return cached
      }

      // Cargar clientes (desde servidor o cache)
      if (isOnline) {
        listCustomers()
          .then(setCustomers)
          .catch(async () => {
            await loadCustomersFromCache()
          })
      } else {
        await loadCustomersFromCache()
      }

      // Cargar preferencia de vista desde localStorage
      const savedViewMode = localStorage.getItem("posViewMode") as "list" | "grid" | null
      if (savedViewMode) {
        setViewMode(savedViewMode)
      }
      
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
            setCustomers(customersList)
            
            // Validar que el cliente aún existe
            const validCustomerId = state.customerId === "generic" || 
              customersList.some(c => c.id === state.customerId) 
              ? state.customerId 
              : "generic"
            
            setCustomerId(validCustomerId)
            setSaleType(state.saleType)
            setPaymentMethod(state.paymentMethod)
            setShippingInput(state.shippingInput || "")
            
            // Validar y limpiar el carrito antes de restaurarlo
            // Asegurarse de que todos los valores sean serializables (números, strings, etc.)
            const cleanedCart = state.cart.map((item: any) => ({
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
    
    loadInitialData()
    
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
    if (cart.length > 0) {
      try {
        // Asegurarse de que todos los valores sean serializables
        const serializableCart = cart.map((item) => ({
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
        }))
        
        const state = {
          cart: serializableCart,
          customerId,
          saleType,
          paymentMethod,
          shippingInput,
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
  }, [cart, customerId, saleType, paymentMethod, shippingInput])

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
          const serializableCart = cart.map((item) => ({
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
          }))
          
          const state = {
            cart: serializableCart,
            customerId,
            saleType,
            paymentMethod,
            shippingInput,
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
  }, [cart, customerId, saleType, paymentMethod, shippingInput, pathname])

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

  const itemsTotalCents = useMemo(() => cart.reduce((s, i) => s + i.unitPriceCents * i.qty, 0), [cart])
  // Calcular ITBIS por línea basado en el itbisRateBp de cada producto
  const { subtotalCents, itbisCents } = useMemo(() => {
    let totalSubtotal = 0
    let totalItbis = 0
    for (const item of cart) {
      const lineTotal = item.unitPriceCents * item.qty
      const { subtotalCents: lineSub, itbisCents: lineItbis } = calcItbisIncluded(lineTotal, item.itbisRateBp)
      totalSubtotal += lineSub
      totalItbis += lineItbis
    }
    return { subtotalCents: totalSubtotal, itbisCents: totalItbis }
  }, [cart])
  const shippingCents = useMemo(() => toCents(shippingInput), [shippingInput])
  const totalCents = useMemo(() => itemsTotalCents + shippingCents, [itemsTotalCents, shippingCents])

  function addToCart(p: ProductResult) {
    const productUnit = (p.saleUnit as UnitType) ?? "UNIDAD"
    const stockNum = decimalToNumber(p.stock)
    
    setCart((prev) => {
      const existing = prev.find((x) => x.productId === p.id)
      if (existing) {
        // Para productos con medidas, incrementar en 0.5; para unidades, incrementar en 1
        const increment = unitAllowsDecimals(productUnit) ? 0.5 : 1
        return prev.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + increment } : x))
      }
      return [
        ...prev,
        {
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
        },
      ]
    })
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
        addToCart(normalized as any)
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

    // Si es dividir pago, mostrar diálogo de división
    if (saleType === SaleType.CONTADO && paymentMethod === PaymentMethod.DIVIDIR_PAGO) {
      setPaymentSplits([])
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

    const saveSaleOffline = async () => {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      await savePendingSale({
        tempId,
        customerId: customerId === "generic" ? null : customerId,
        type: saleType,
        paymentMethod: saleType === SaleType.CONTADO && paymentMethod !== PaymentMethod.DIVIDIR_PAGO ? paymentMethod : null,
        paymentSplits: paymentSplits.length > 0 ? paymentSplits : undefined,
        items: cart.map((c) => ({
          productId: c.productId,
          qty: c.qty,
          unitPriceCents: c.unitPriceCents,
          wasPriceOverridden: c.wasPriceOverridden,
        })),
        shippingCents: shippingCents > 0 ? shippingCents : undefined,
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
              paymentSplits: paymentSplits.length > 0 ? paymentSplits : undefined,
              items: cart.map((c) => ({
                productId: c.productId,
                qty: c.qty,
                unitPriceCents: c.unitPriceCents,
                wasPriceOverridden: c.wasPriceOverridden,
              })),
              shippingCents: shippingCents > 0 ? shippingCents : undefined,
              username: user.username,
            })

            toast({ title: "Venta guardada", description: `Factura ${sale.invoiceCode}` })

            // Thermal receipt by default
            window.open(`/receipts/sale/${sale.invoiceCode}`, "_blank")
          } catch (e) {
            if (isLikelyOfflineError(e)) {
              await saveSaleOffline()
            } else {
              throw e
            }
          }
        }

        setCart([])
        setShippingInput("")
        setQuery("")
        setResults([])
        setShowChangeDialog(false)
        setShowSplitPaymentDialog(false)
        setAmountPaidInput("")
        setPaymentSplits([])
        setEditingPaymentAmounts({})
        // Limpiar el estado guardado al completar la venta
        localStorage.removeItem("posCartState")
        if (saleType === SaleType.CONTADO) {
          setPaymentMethod(PaymentMethod.EFECTIVO)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error guardando venta"
        toast({ title: "No se pudo guardar", description: msg })
      }
    })
  }

  const amountPaidCents = useMemo(() => toCents(amountPaidInput), [amountPaidInput])
  const changeCents = useMemo(() => amountPaidCents - totalCents, [amountPaidCents, totalCents])

  // Función helper para obtener la cantidad de un producto en el carrito
  function getCartQuantity(productId: string): number {
    const item = cart.find((c) => c.productId === productId)
    return item?.qty ?? 0
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
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Cliente</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={customerId ?? ""}
                onChange={(e) => setCustomerId(e.target.value || null)}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.isGeneric ? "(General) " : ""}{c.name}
                  </option>
                ))}
              </select>
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
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value={PaymentMethod.EFECTIVO}>Efectivo</option>
                  <option value={PaymentMethod.TRANSFERENCIA}>Transferencia</option>
                  <option value={PaymentMethod.TARJETA}>Tarjeta</option>
                  <option value={PaymentMethod.DIVIDIR_PAGO}>Dividir pago</option>
                </select>
              </div>
            )}

            <Separator />

            <div className="grid gap-2">
              <Label>Buscar producto (descripción / código / referencia)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                <Input
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
                  placeholder="Ej: alfombra / 12345 / REF-01"
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
                          onClick={() => addToCart(p)}
                          className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              Código: {p.sku ?? "—"} · Ref: {p.reference ?? "—"} · Existencia: {formatQty(decimalToNumber(p.stock), (p.saleUnit as UnitType) ?? "UNIDAD")}
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
                          onClick={() => addToCart(p)}
                          className="group relative flex flex-col rounded-lg border-2 border-border hover:border-purple-primary transition-colors bg-card shadow-sm"
                        >
                          <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden rounded-t-lg">
                            {p.imageUrls && p.imageUrls.length > 0 ? (
                              <img
                                src={p.imageUrls[0]}
                                alt={p.name}
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
                            <div className="text-sm font-semibold text-purple-primary">{formatRD(p.priceCents)}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.stock} disponible{p.stock !== 1 ? "s" : ""}
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
                            onClick={() => addToCart(p)}
                            className="group relative flex flex-col rounded-lg border-2 border-border hover:border-purple-primary transition-colors bg-card shadow-sm"
                          >
                            <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden rounded-t-lg">
                              {p.imageUrls && p.imageUrls.length > 0 ? (
                                <img
                                  src={p.imageUrls[0]}
                                  alt={p.name}
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
                              <div className="text-sm font-semibold text-purple-primary">{formatRD(p.priceCents)}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatQty(decimalToNumber(p.stock), (p.saleUnit as UnitType) ?? "UNIDAD")} disponible
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
                      <div key={c.productId} className="flex items-start justify-between gap-3 rounded-md border p-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            Código: {c.sku ?? "—"} · Ref: {c.reference ?? "—"}
                            {c.unit !== "UNIDAD" && <span className="ml-2 text-purple-primary">({unitInfo.abbr})</span>}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                // Limpiar estado de edición antes de decrementar
                                setEditingQuantities((prev) => {
                                  const next = { ...prev }
                                  delete next[c.productId]
                                  return next
                                })
                                setCart((p) =>
                                  p.map((x) =>
                                    x.productId === c.productId ? { ...x, qty: Math.max(minQty, x.qty - increment) } : x
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
                              value={editingQuantities[c.productId] ?? formatQtyNumber(c.qty, c.unit)}
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
                                
                                setEditingQuantities((prev) => ({ ...prev, [c.productId]: rawValue }))
                              }}
                              onBlur={(e) => {
                                // Parsear y validar el valor al perder el foco
                                const rawValue = e.target.value.trim()
                                const newQty = parseQty(rawValue, c.unit)
                                const finalQty = newQty < (allowsDecimals ? 0.01 : 1) ? (allowsDecimals ? 0.5 : 1) : newQty
                                
                                setCart((p) =>
                                  p.map((x) =>
                                    x.productId === c.productId ? { ...x, qty: finalQty } : x
                                  )
                                )
                                
                                // Limpiar el estado de edición
                                setEditingQuantities((prev) => {
                                  const next = { ...prev }
                                  delete next[c.productId]
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
                                  delete next[c.productId]
                                  return next
                                })
                                setCart((p) => p.map((x) => (x.productId === c.productId ? { ...x, qty: x.qty + increment } : x)))
                              }}
                            >
                              +
                            </Button>
                            <div className="ml-2 text-sm text-muted-foreground">x</div>
                            {user && user.canOverridePrice ? (
                              <div className="w-28">
                                <PriceInput
                                  valueCents={c.unitPriceCents}
                                  onChangeCents={(unitPriceCents) => {
                                    // Obtener el precio original del producto para comparar
                                    const product = allProducts.find((p) => p.id === c.productId) || results.find((p) => p.id === c.productId)
                                    const originalPriceCents = product?.priceCents || c.unitPriceCents
                                    setCart((p) =>
                                      p.map((x) =>
                                        x.productId === c.productId
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
                          {!allowNegativeStock && c.qty > c.stock && (
                            <div className="mt-2 text-xs font-medium text-destructive">
                              Existencia insuficiente (Existencia: {formatQty(c.stock, c.unit)}). Ajustes → "Permitir vender sin existencia".
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="text-sm font-semibold">{formatRD(c.unitPriceCents * c.qty)}</div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setCart((p) => p.filter((x) => x.productId !== c.productId))}
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
                    const unitInfo = getUnitInfo(c.unit)
                    
                    return (
                      <div key={c.productId} className="space-y-2">
                        <div className="flex items-start gap-3">
                          <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                            {(() => {
                              const product = allProducts.find((p) => p.id === c.productId) || results.find((p) => p.id === c.productId)
                              if (product?.imageUrls && product.imageUrls.length > 0) {
                                return <img src={product.imageUrls[0]} alt={c.name} className="w-full h-full object-contain" />
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
                              {formatQty(c.stock, c.unit)} Disponible{c.stock !== 1 ? "s" : ""}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() =>
                                  setCart((p) =>
                                    p.map((x) =>
                                      x.productId === c.productId ? { ...x, qty: Math.max(minQty, x.qty - increment) } : x
                                    )
                                  )
                                }
                              >
                                -
                              </Button>
                              <div className="w-12 text-center text-sm font-semibold">{formatQty(c.qty, c.unit)}</div>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() =>
                                  setCart((p) => p.map((x) => (x.productId === c.productId ? { ...x, qty: x.qty + increment } : x)))
                                }
                              >
                                +
                              </Button>
                              <div className="ml-auto text-sm font-semibold">{formatRD(c.unitPriceCents)}</div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setCart((p) => p.filter((x) => x.productId !== c.productId))}
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
            <div className="grid gap-1 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span suppressHydrationWarning>{formatRD(subtotalCents)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>ITBIS (18% incluido)</span>
                <span suppressHydrationWarning>{formatRD(itbisCents)}</span>
              </div>
              {shippingCents > 0 && (
                <div className="flex items-center justify-between">
                  <span>Flete</span>
                  <span suppressHydrationWarning>{formatRD(shippingCents)}</span>
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between text-base font-semibold text-foreground">
                <span>Total</span>
                <span suppressHydrationWarning>{formatRD(totalCents)}</span>
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
              Precios incluyen ITBIS. Factura tamaño carta con serie A.
            </div>
          </CardContent>
        </Card>

        {cart.length === 0 && (
          <Card>
            <CardContent className="py-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <img 
                  src="/barcodereader.png" 
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
              <div className={`text-2xl font-semibold ${changeCents < 0 ? "text-destructive" : "text-foreground"}`}>
                {changeCents < 0 ? `Falta: ${formatRD(Math.abs(changeCents))}` : formatRD(changeCents)}
              </div>
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
                    setPaymentSplits([...paymentSplits, { method: PaymentMethod.EFECTIVO, amountCents: 0 }])
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar método
                </Button>
              </div>

              {paymentSplits.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                  No hay métodos de pago agregados. Haz clic en "Agregar método" para comenzar.
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentSplits.map((split, index) => {
                    const amountInput = editingPaymentAmounts[index] ?? (split.amountCents > 0 ? (split.amountCents / 100).toFixed(2) : "")
                    const remainingCents = totalCents - paymentSplits.reduce((sum, s, i) => i !== index ? sum + s.amountCents : sum, 0)
                    
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
                              setPaymentSplits(newSplits)
                            }}
                          >
                            <option value={PaymentMethod.EFECTIVO}>Efectivo</option>
                            <option value={PaymentMethod.TRANSFERENCIA}>Transferencia</option>
                            <option value={PaymentMethod.TARJETA}>Tarjeta</option>
                            <option value={PaymentMethod.OTRO}>Otro</option>
                          </select>
                        </div>
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
                paymentSplits.some(s => s.amountCents <= 0)
              }
            >
              {isSaving ? "Guardando…" : "Confirmar"}
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
              <img src="/pausa.png" alt="Pausa" className="h-64 w-64 object-contain" />
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
                    const serializableCart = cart.map((item) => ({
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
                    }))
                    
                    const state = {
                      cart: serializableCart,
                      customerId,
                      saleType,
                      paymentMethod,
                      shippingInput,
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
