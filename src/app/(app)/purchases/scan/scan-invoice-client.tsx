"use client"

import { useRef, useState, useTransition, useEffect } from "react"
import { Camera, Upload, X, Loader2, Check, AlertCircle, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatRD, toCents } from "@/lib/money"
import { resolvePurchaseSalePricing } from "@/lib/purchase-pricing"

import { processInvoiceImage, createPurchaseFromOCR, ExtractedInvoiceData, ExtractedProduct } from "../ocr-actions"
import { getAllSuppliers } from "../../suppliers/actions"
import { getSettings } from "../../settings/actions"

type ReviewProduct = ExtractedProduct & {
  createNew: boolean
  netCostCents: number
  salePriceCents: number
  saleMarginBp: number
}

export function ScanInvoiceClient() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isProcessing, startProcessing] = useTransition()
  const [isSaving, startSaving] = useTransition()
  const [cameraActive, setCameraActive] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)

  // Datos extraídos
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null)
  const [reviewProducts, setReviewProducts] = useState<ReviewProduct[]>([])
  const [supplierId, setSupplierId] = useState<string>("")
  const [supplierName, setSupplierName] = useState("")
  const [suppliers, setSuppliers] = useState<Awaited<ReturnType<typeof getAllSuppliers>>>([])
  const [updateCost, setUpdateCost] = useState(true)
  const [updatePrice, setUpdatePrice] = useState(true)
  const [defaultProfitMarginBp, setDefaultProfitMarginBp] = useState(3000)
  const [itbisRateBp, setItbisRateBp] = useState(1800)
  const [salePricesIncludeItbis, setSalePricesIncludeItbis] = useState(true)
  // Estado para los valores de los inputs de costo unitario mientras se escriben
  const [unitPriceInputs, setUnitPriceInputs] = useState<Record<number, string>>({})
  const [saleMarginInputs, setSaleMarginInputs] = useState<Record<number, string>>({})
  const [salePriceInputs, setSalePriceInputs] = useState<Record<number, string>>({})
  // Estado para los descuentos por producto
  const [productDiscounts, setProductDiscounts] = useState<Record<number, number>>({})

  // Paso actual: "capture" | "review"
  const [step, setStep] = useState<"capture" | "review">("capture")
  const selectedSupplier = supplierId ? suppliers.find((s) => s.id === supplierId) ?? null : null

  function getPurchaseItbisRateBp() {
    if (selectedSupplier?.chargesItbis) return selectedSupplier.itbisRateBp ?? itbisRateBp
    return itbisRateBp
  }

  // Cargar proveedores al montar
  useEffect(() => {
    Promise.all([getAllSuppliers(), getSettings()])
      .then(([supplierList, settings]) => {
        setSuppliers(supplierList)
        setDefaultProfitMarginBp(settings.defaultProfitMarginBp)
        setItbisRateBp(settings.itbisRateBp)
        setSalePricesIncludeItbis(settings.salePricesIncludeItbis)
      })
      .catch(() => {})
  }, [])

  function resolveLinePricing(product: ReviewProduct, discountBp: number, overrides?: { saleMarginBp?: number; salePriceCents?: number }) {
    const purchaseIncludesItbis = selectedSupplier ? (selectedSupplier.chargesItbis ?? false) : true
    const purchaseItbisRateBp = getPurchaseItbisRateBp()
    const saleItbisRateBp = product.matchedProductItbisRateBp > 0
      ? product.matchedProductItbisRateBp
      : (product.isNewProduct
        ? (selectedSupplier ? (selectedSupplier.chargesItbis ? purchaseItbisRateBp : 0) : purchaseItbisRateBp)
        : 0)

    return resolvePurchaseSalePricing({
      unitCostCents: product.unitPrice,
      discountPercentBp: discountBp,
      purchaseIncludesItbis,
      purchaseItbisRateBp,
      productItbisRateBp: saleItbisRateBp,
      defaultSaleMarginBp: defaultProfitMarginBp,
      salePricesIncludeItbis,
      saleMarginBp: overrides && "salePriceCents" in overrides ? undefined : (overrides?.saleMarginBp ?? product.saleMarginBp),
      salePriceCents: overrides?.salePriceCents,
    })
  }

  function recalculateProduct(product: ReviewProduct, discountBp: number, overrides?: { saleMarginBp?: number; salePriceCents?: number }) {
    const pricing = resolveLinePricing(product, discountBp, overrides)

    return {
      ...product,
      netCostCents: pricing.netCostCents,
      salePriceCents: pricing.salePriceCents,
      saleMarginBp: pricing.saleMarginBp,
      matchedProductItbisRateBp: pricing.appliedItbisRateBp > 0 ? pricing.appliedItbisRateBp : product.matchedProductItbisRateBp,
    }
  }

  function applySupplierSelection(nextSupplierId: string) {
    setSupplierId(nextSupplierId)
    const supplier = suppliers.find((s) => s.id === nextSupplierId)

    if (!supplier) {
      setSupplierName("")
      const discounts: Record<number, number> = {}
      reviewProducts.forEach((_, index) => {
        discounts[index] = 0
      })
      setProductDiscounts(discounts)
      setReviewProducts((prev) => prev.map((product) => recalculateProduct(product, 0)))
      return
    }

    setSupplierName(supplier.name)
    const supplierDiscount = supplier.discountPercentBp
    const discounts: Record<number, number> = {}
    reviewProducts.forEach((_, index) => {
      discounts[index] = supplierDiscount
    })
    setProductDiscounts(discounts)
    setReviewProducts((prev) => prev.map((product) => recalculateProduct(product, supplierDiscount)))
  }

  // Calcular totales con descuento e ITBIS
  const totals = (() => {
    const includedProducts = reviewProducts.filter((p) => p.included)
    
    // Subtotal sin descuento ni ITBIS
    const subtotalCents = includedProducts.reduce((sum, p) => sum + p.unitPrice * p.quantity, 0)
    
    // Calcular descuentos y costos netos
    let totalDiscountCents = 0
    let totalNetCents = 0
    let totalPurchaseNoItbisCents = 0
    
    includedProducts.forEach((product, index) => {
      const discountBp = productDiscounts[index] ?? 0
      const pricing = resolveLinePricing(product, discountBp)
      const lineDiscount = (pricing.unitCostCents - pricing.discountedCostCents) * product.quantity
      const lineNetCost = pricing.netCostCents * product.quantity

      totalDiscountCents += lineDiscount
      totalNetCents += lineNetCost
      totalPurchaseNoItbisCents += pricing.purchaseNoItbisCents * product.quantity
    })
    
    const itbisCents = totalNetCents - totalPurchaseNoItbisCents
    
    return {
      subtotalCents,
      discountCents: totalDiscountCents,
      itbisCents,
      totalCents: totalNetCents,
    }
  })()

  // Abrir cámara
  async function openCamera() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      })
      setStream(mediaStream)
      setCameraActive(true)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch {
      toast({
        title: "Error",
        description: "No se pudo acceder a la cámara. Verifica los permisos.",
      })
    }
  }

  // Cerrar cámara
  function closeCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }
    setCameraActive(false)
  }

  // Capturar foto
  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8)
    setImagePreview(dataUrl)
    closeCamera()
  }

  // Cargar archivo
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Por favor selecciona una imagen" })
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  // Limpiar imagen
  function clearImage() {
    setImagePreview(null)
    setExtractedData(null)
    setReviewProducts([])
    setStep("capture")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Procesar imagen con OCR
  function processImage() {
    if (!imagePreview) return

    startProcessing(async () => {
      try {
        const result = await processInvoiceImage(imagePreview)
        setExtractedData(result)
        setSupplierName(result.supplierName || "")

        // Convertir a productos para revisión
        const products: ReviewProduct[] = result.products.map((p) => ({
          ...recalculateProduct({
            ...p,
            createNew: p.isNewProduct,
            netCostCents: p.unitPrice,
            salePriceCents: p.unitPrice,
            saleMarginBp: defaultProfitMarginBp,
          }, selectedSupplier?.discountPercentBp ?? 0),
        }))
        setReviewProducts(products)
        
        const discounts: Record<number, number> = {}
        products.forEach((_, index) => {
          discounts[index] = selectedSupplier?.discountPercentBp ?? 0
        })
        setProductDiscounts(discounts)
        
        setStep("review")

        toast({
          title: "Factura procesada",
          description: `Se encontraron ${result.products.length} productos`,
        })
      } catch (error) {
        toast({
          title: "Error al procesar",
          description: error instanceof Error ? error.message : "No se pudo procesar la imagen",
        })
      }
    })
  }

  // Actualizar producto en revisión
  function updateProduct<K extends keyof ReviewProduct>(index: number, field: K, value: ReviewProduct[K]) {
    setReviewProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    )
  }

  // Eliminar producto de la lista
  function removeProduct(index: number) {
    setReviewProducts((prev) => prev.filter((_, i) => i !== index))
    setProductDiscounts((prev) => {
      const newState: Record<number, number> = {}
      Object.keys(prev).forEach((key) => {
        const keyNum = parseInt(key, 10)
        if (keyNum < index) {
          newState[keyNum] = prev[keyNum]
        } else if (keyNum > index) {
          newState[keyNum - 1] = prev[keyNum]
        }
      })
      return newState
    })
    // Limpiar el estado del input de este producto
    setUnitPriceInputs((prev) => {
      const newState: Record<number, string> = {}
      Object.keys(prev).forEach((key) => {
        const keyNum = parseInt(key, 10)
        if (keyNum < index) {
          newState[keyNum] = prev[keyNum]
        } else if (keyNum > index) {
          newState[keyNum - 1] = prev[keyNum]
        }
      })
      return newState
    })
    setSaleMarginInputs((prev) => {
      const newState: Record<number, string> = {}
      Object.keys(prev).forEach((key) => {
        const keyNum = parseInt(key, 10)
        if (keyNum < index) {
          newState[keyNum] = prev[keyNum]
        } else if (keyNum > index) {
          newState[keyNum - 1] = prev[keyNum]
        }
      })
      return newState
    })
    setSalePriceInputs((prev) => {
      const newState: Record<number, string> = {}
      Object.keys(prev).forEach((key) => {
        const keyNum = parseInt(key, 10)
        if (keyNum < index) {
          newState[keyNum] = prev[keyNum]
        } else if (keyNum > index) {
          newState[keyNum - 1] = prev[keyNum]
        }
      })
      return newState
    })
  }

  // Guardar compra
  function savePurchase() {
    if (!supplierId) {
      toast({ title: "Proveedor requerido", description: "Debes seleccionar un proveedor para guardar la compra." })
      return
    }

    const includedProducts = reviewProducts.filter((p) => p.included)
    if (!includedProducts.length) {
      toast({ title: "Error", description: "Debe incluir al menos un producto" })
      return
    }

    startSaving(async () => {
      try {
        await createPurchaseFromOCR({
          supplierId: supplierId || null,
          supplierName: supplierName || null,
          products: includedProducts.map((p) => {
            const originalIndex = reviewProducts.findIndex((prod) => prod === p)
            const discountBp = productDiscounts[originalIndex] ?? 0
            const pricing = resolveLinePricing(p, discountBp, {
              saleMarginBp: p.saleMarginBp,
              salePriceCents: p.salePriceCents,
            })
            return {
              productId: p.matchedProductId,
              sku: p.sku,
              reference: p.reference,
              description: p.description,
              quantity: p.quantity,
              unitCostCents: p.unitPrice,
              discountPercentBp: discountBp,
              netCostCents: pricing.netCostCents,
              saleMarginBp: pricing.saleMarginBp,
              createNew: p.isNewProduct && p.createNew,
              sellPriceCents: pricing.salePriceCents,
            }
          }),
          updateProductCost: updateCost,
          updateProductPrice: updatePrice,
        })

        toast({ title: "Compra registrada", description: "La compra se guardó correctamente" })
        router.push("/purchases/list")
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "No se pudo guardar la compra",
        })
      }
    })
  }

  return (
    <div className="grid gap-6">
      {/* Paso 1: Captura de imagen */}
      {step === "capture" && (
        <Card>
          <CardHeader>
            <CardTitle>Capturar Factura</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            {/* Cámara activa */}
            {cameraActive && (
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full rounded-lg border"
                />
                <div className="mt-4 flex gap-2">
                  <Button onClick={capturePhoto} className="flex-1">
                    <Camera className="mr-2 h-4 w-4" /> Capturar
                  </Button>
                  <Button onClick={closeCamera} variant="outline">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Preview de imagen */}
            {imagePreview && !cameraActive && (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Vista previa"
                  className="w-full max-h-96 object-contain rounded-lg border"
                />
                <Button
                  onClick={clearImage}
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Botones de captura */}
            {!imagePreview && !cameraActive && (
              <div className="grid grid-cols-2 gap-4">
                <Button onClick={openCamera} variant="outline" className="h-32">
                  <div className="flex flex-col items-center gap-2">
                    <Camera className="h-8 w-8" />
                    <span>Abrir Cámara</span>
                  </div>
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="h-32"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8" />
                    <span>Subir Imagen</span>
                  </div>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}

            {/* Botón procesar */}
            {imagePreview && !cameraActive && (
              <Button onClick={processImage} disabled={isProcessing} size="lg">
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando con IA...
                  </>
                ) : (
                  "Procesar Factura"
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Canvas oculto para captura */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Paso 2: Revisión de datos */}
      {step === "review" && extractedData && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Revisión de Datos</span>
                <Button variant="outline" size="sm" onClick={() => setStep("capture")}>
                  Volver a escanear
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              {/* Datos del proveedor */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Proveedor</Label>
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={supplierId}
                    onChange={(e) => {
                      applySupplierSelection(e.target.value)
                    }}
                  >
                    <option value="">Sin proveedor / Escribir nombre</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.discountPercentBp > 0 ? `(${(s.discountPercentBp / 100).toFixed(2)}% desc.)` : ""}
                      </option>
                    ))}
                  </select>
                  {!supplierId && (
                    <Input
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="O escribir nombre del proveedor"
                    />
                  )}
                  {supplierId && (
                    <div className="text-xs text-muted-foreground">
                      {(() => {
                        const supplier = suppliers.find((s) => s.id === supplierId)
                        return supplier?.discountPercentBp
                          ? `Descuento automático: ${(supplier.discountPercentBp / 100).toFixed(2)}%`
                          : "Sin descuento configurado"
                      })()}
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>Fecha de factura</Label>
                  <Input value={extractedData.invoiceDate || "No detectada"} disabled />
                </div>
              </div>

              <Separator />

              {/* Tabla de productos */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base">Productos detectados</Label>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <Check className="h-4 w-4" /> Existente
                    </span>
                    <span className="inline-flex items-center gap-1 text-yellow-600">
                      <AlertCircle className="h-4 w-4" /> Nuevo
                    </span>
                  </div>
                </div>

                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <span className="sr-only">Incluir</span>
                        </TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead className="text-right">Costo Unit.</TableHead>
                        <TableHead className="text-right">Descuento (%)</TableHead>
                        <TableHead className="text-right">Ganancia (%)</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Precio Venta</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewProducts.map((product, index) => (
                        <TableRow
                          key={index}
                          className={!product.included ? "opacity-50" : ""}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={product.included}
                              onChange={(e) =>
                                updateProduct(index, "included", e.target.checked)
                              }
                              className="h-4 w-4"
                            />
                          </TableCell>
                          <TableCell>
                            {product.isNewProduct ? (
                              <div className="flex items-center gap-1">
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700">
                                  <Plus className="h-3 w-3" /> Nuevo
                                </span>
                                <input
                                  type="checkbox"
                                  checked={product.createNew}
                                  onChange={(e) =>
                                    updateProduct(index, "createNew", e.target.checked)
                                  }
                                  title="Crear producto"
                                  className="h-3 w-3"
                                />
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                                <Check className="h-3 w-3" /> {product.matchedProductName}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={product.description}
                              onChange={(e) =>
                                updateProduct(index, "description", e.target.value)
                              }
                              className="min-w-[200px]"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={product.sku || ""}
                              onChange={(e) =>
                                updateProduct(index, "sku", e.target.value || null)
                              }
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={product.reference || ""}
                              onChange={(e) =>
                                updateProduct(index, "reference", e.target.value || null)
                              }
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              value={product.quantity}
                              onChange={(e) =>
                                updateProduct(index, "quantity", parseInt(e.target.value) || 1)
                              }
                              className="w-16 text-right"
                              min={1}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={unitPriceInputs[index] ?? (product.unitPrice / 100).toFixed(2)}
                              onChange={(e) => {
                                let newValue = e.target.value
                                
                                // Guardar el valor en el estado local
                                setUnitPriceInputs((prev) => ({ ...prev, [index]: newValue }))
                                
                                // Solo permitir números y un punto decimal
                                if (newValue === "") {
                                  setReviewProducts((prev) =>
                                    prev.map((p, i) => {
                                      if (i !== index) return p
                                      return recalculateProduct({ ...p, unitPrice: 0 }, productDiscounts[index] ?? 0)
                                    })
                                  )
                                  return
                                }
                                
                                // Remover todo excepto números y un punto decimal
                                const cleaned = newValue.replace(/[^0-9.]/g, "")
                                const parts = cleaned.split(".")
                                
                                // Si hay más de un punto, mantener solo el primero
                                if (parts.length > 2) {
                                  newValue = parts[0] + "." + parts.slice(1).join("")
                                } else {
                                  newValue = cleaned
                                }
                                
                                // Limitar a 2 decimales
                                if (parts.length === 2 && parts[1].length > 2) {
                                  newValue = parts[0] + "." + parts[1].substring(0, 2)
                                }
                                
                                // Convertir a centavos
                                const priceCents = Math.round((parseFloat(newValue) || 0) * 100)
                                setReviewProducts((prev) =>
                                  prev.map((p, i) => {
                                    if (i !== index) return p
                                    return recalculateProduct({ ...p, unitPrice: priceCents }, productDiscounts[index] ?? 0)
                                  })
                                )
                              }}
                              onBlur={(e) => {
                                // Al perder el foco, formatear y limpiar el estado local
                                const priceCents = Math.round((parseFloat(e.target.value) || 0) * 100)
                                setReviewProducts((prev) =>
                                  prev.map((p, i) => {
                                    if (i !== index) return p
                                    return recalculateProduct({ ...p, unitPrice: priceCents }, productDiscounts[index] ?? 0)
                                  })
                                )
                                
                                setUnitPriceInputs((prev) => {
                                  const newState = { ...prev }
                                  delete newState[index]
                                  return newState
                                })
                              }}
                              onFocus={() => {
                                // Al enfocar, inicializar el estado local con el valor actual
                                const currentValue = (product.unitPrice / 100).toFixed(2)
                                setUnitPriceInputs((prev) => ({ ...prev, [index]: currentValue }))
                              }}
                              className="w-24 text-right"
                              placeholder="0.00"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={(() => {
                                const discountBp = productDiscounts[index] ?? 0
                                return (discountBp / 100).toFixed(2)
                              })()}
                              onChange={(e) => {
                                let newValue = e.target.value
                                
                                // Solo permitir números y un punto decimal
                                if (newValue === "") {
                                  setProductDiscounts((prev) => {
                                    const newState = { ...prev }
                                    delete newState[index]
                                    return newState
                                  })
                                  setReviewProducts((prev) =>
                                    prev.map((p, i) => (i === index ? recalculateProduct(p, 0) : p))
                                  )
                                  return
                                }
                                
                                // Remover todo excepto números y un punto decimal
                                const cleaned = newValue.replace(/[^0-9.]/g, "")
                                const parts = cleaned.split(".")
                                
                                // Si hay más de un punto, mantener solo el primero
                                if (parts.length > 2) {
                                  newValue = parts[0] + "." + parts.slice(1).join("")
                                } else {
                                  newValue = cleaned
                                }
                                
                                // Limitar a 2 decimales
                                if (parts.length === 2 && parts[1].length > 2) {
                                  newValue = parts[0] + "." + parts[1].substring(0, 2)
                                }
                                
                                // Limitar a máximo 100
                                const discountPercent = Math.min(parseFloat(newValue) || 0, 100)
                                const discountBp = Math.round(discountPercent * 100)
                                setProductDiscounts((prev) => ({ ...prev, [index]: discountBp }))
                                setReviewProducts((prev) =>
                                  prev.map((p, i) => (i === index ? recalculateProduct(p, discountBp) : p))
                                )
                              }}
                              onBlur={(e) => {
                                const discountPercent = Math.min(parseFloat(e.target.value) || 0, 100)
                                const discountBp = Math.round(discountPercent * 100)
                                setProductDiscounts((prev) => ({ ...prev, [index]: discountBp }))
                                setReviewProducts((prev) =>
                                  prev.map((p, i) => (i === index ? recalculateProduct(p, discountBp) : p))
                                )
                              }}
                              className="w-20 text-right"
                              placeholder="0.00"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={saleMarginInputs[index] ?? (product.saleMarginBp / 100).toFixed(2)}
                              onChange={(e) => {
                                let newValue = e.target.value
                                setSaleMarginInputs((prev) => ({ ...prev, [index]: newValue }))

                                if (newValue === "") {
                                  setReviewProducts((prev) =>
                                    prev.map((p, i) => (i === index ? recalculateProduct(p, productDiscounts[index] ?? 0, { saleMarginBp: 0 }) : p))
                                  )
                                  return
                                }

                                const cleaned = newValue.replace(/[^0-9.]/g, "")
                                const parts = cleaned.split(".")
                                if (parts.length > 2) {
                                  newValue = parts[0] + "." + parts.slice(1).join("")
                                } else {
                                  newValue = cleaned
                                }
                                if (parts.length === 2 && parts[1].length > 2) {
                                  newValue = parts[0] + "." + parts[1].substring(0, 2)
                                }

                                const marginPercent = Math.min(parseFloat(newValue) || 0, 500)
                                const marginBp = Math.round(marginPercent * 100)
                                setReviewProducts((prev) =>
                                  prev.map((p, i) => (i === index ? recalculateProduct(p, productDiscounts[index] ?? 0, { saleMarginBp: marginBp }) : p))
                                )
                              }}
                              onBlur={(e) => {
                                const marginPercent = Math.min(parseFloat(e.target.value) || 0, 500)
                                const marginBp = Math.round(marginPercent * 100)
                                setSaleMarginInputs((prev) => {
                                  const newState = { ...prev }
                                  delete newState[index]
                                  return newState
                                })
                                setReviewProducts((prev) =>
                                  prev.map((p, i) => (i === index ? recalculateProduct(p, productDiscounts[index] ?? 0, { saleMarginBp: marginBp }) : p))
                                )
                              }}
                              onFocus={() => {
                                setSaleMarginInputs((prev) => ({ ...prev, [index]: (product.saleMarginBp / 100).toFixed(2) }))
                              }}
                              className="w-20 text-right"
                              placeholder="0.00"
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <div>{formatRD(product.netCostCents * product.quantity)}</div>
                            <div className="text-[10px] font-semibold text-muted-foreground">
                              Desc: {((productDiscounts[index] ?? 0) / 100).toFixed(2)}% · Compra ITBIS: {selectedSupplier ? (selectedSupplier.chargesItbis ? "Si" : "No") : "Si"} · Venta ITBIS: {product.matchedProductItbisRateBp > 0 ? "Si" : "No"}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              NOTA: Si quieres que el producto se venda con o sin ITBIS debes modificar el perfil del producto y ponerlo como exento.
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              NOTA2: Si quieres que el producto su compra sea con o sin ITBIS debes modificar el perfil del proveedor.
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={salePriceInputs[index] ?? (product.salePriceCents / 100).toFixed(2)}
                              onChange={(e) => {
                                const value = e.target.value
                                setSalePriceInputs((prev) => ({ ...prev, [index]: value }))
                                const salePriceCents = toCents(value)
                                setReviewProducts((prev) =>
                                  prev.map((p, i) => (i === index ? recalculateProduct(p, productDiscounts[index] ?? 0, { salePriceCents }) : p))
                                )
                              }}
                              onBlur={(e) => {
                                const salePriceCents = toCents(e.target.value)
                                setSalePriceInputs((prev) => {
                                  const newState = { ...prev }
                                  delete newState[index]
                                  return newState
                                })
                                setReviewProducts((prev) =>
                                  prev.map((p, i) => (i === index ? recalculateProduct(p, productDiscounts[index] ?? 0, { salePriceCents }) : p))
                                )
                              }}
                              onFocus={() => {
                                setSalePriceInputs((prev) => ({ ...prev, [index]: (product.salePriceCents / 100).toFixed(2) }))
                              }}
                              className="w-24 text-right"
                              placeholder="0.00"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeProduct(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}

                      {reviewProducts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                            No se detectaron productos
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Desglose de totales */}
                <div className="mt-4 flex justify-end">
                  <div className="w-full max-w-sm rounded-md border p-4 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span>Subtotal</span>
                      <span>{formatRD(totals.subtotalCents)}</span>
                    </div>
                    {totals.discountCents > 0 && (
                      <div className="flex items-center justify-between mb-2 text-green-600">
                        <span>Descuento</span>
                        <span>-{formatRD(totals.discountCents)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <span>ITBIS compra</span>
                      <span>{formatRD(totals.itbisCents)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between text-base font-bold">
                      <span>Total</span>
                      <span>{formatRD(totals.totalCents)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Opciones y guardar */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="update-cost"
                      checked={updateCost}
                      onCheckedChange={setUpdateCost}
                    />
                    <Label htmlFor="update-cost">Actualizar costo de productos existentes</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="update-price"
                      checked={updatePrice}
                      onCheckedChange={setUpdatePrice}
                    />
                    <Label htmlFor="update-price">Actualizar precio de venta de productos existentes</Label>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => router.push("/purchases")}>
                    Cancelar
                  </Button>
                  <Button onClick={savePurchase} disabled={isSaving || !supplierId}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      "Confirmar Compra"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
