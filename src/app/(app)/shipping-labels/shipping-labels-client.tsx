"use client"

import { useEffect, useState, useTransition } from "react"
import { Package, Printer, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ShippingLabel } from "@/components/app/shipping-label"
import { toast } from "@/hooks/use-toast"
import { DOMINICAN_PROVINCES } from "@/lib/provinces"

import { listCustomers } from "../customers/actions"
import { getSettings } from "../settings/actions"

type Customer = Awaited<ReturnType<typeof listCustomers>>[number]

export function ShippingLabelsClient() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoadingCustomers, startLoadingCustomers] = useTransition()
  const [customerQuery, setCustomerQuery] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // Form fields
  const [useExistingCustomer, setUseExistingCustomer] = useState(true)
  const [customerName, setCustomerName] = useState("")
  const [customerAddress, setCustomerAddress] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerProvince, setCustomerProvince] = useState("")
  const [senderName, setSenderName] = useState("")
  const [packageCount, setPackageCount] = useState("1")

  const [showLabel, setShowLabel] = useState(false)
  const [shippingLabelSize, setShippingLabelSize] = useState("4x6")

  function loadCustomers(q?: string) {
    startLoadingCustomers(async () => {
      try {
        const r = await listCustomers(q)
        setCustomers(r)
      } catch {
        setCustomers([])
      }
    })
  }

  useEffect(() => {
    loadCustomers("")
    // Cargar nombre de la empresa y tamaño de etiqueta como valores por defecto
    getSettings().then((settings) => {
      setSenderName(settings.name)
      setShippingLabelSize(settings.shippingLabelSize)
    })
  }, [])

  useEffect(() => {
    const q = customerQuery.trim()
    const t = setTimeout(() => loadCustomers(q), 200)
    return () => clearTimeout(t)
  }, [customerQuery])

  function handleCustomerSelect(customer: Customer) {
    setSelectedCustomer(customer)
    setCustomerName(customer.name)
    setCustomerAddress(customer.address ?? "")
    setCustomerPhone(customer.phone ?? "")
    setCustomerProvince(customer.province ?? "")
    setCustomerQuery("")
    setCustomers([])
  }

  function handleUseExistingChange(useExisting: boolean) {
    setUseExistingCustomer(useExisting)
    if (useExisting) {
      setSelectedCustomer(null)
      setCustomerName("")
      setCustomerAddress("")
      setCustomerPhone("")
      setCustomerProvince("")
    } else {
      setSelectedCustomer(null)
    }
  }

  function handleGenerateLabel() {
    if (!customerName.trim()) {
      toast({ title: "Error", description: "El nombre del cliente es requerido" })
      return
    }
    if (!senderName.trim()) {
      toast({ title: "Error", description: "El nombre del remitente es requerido" })
      return
    }
    const count = parseInt(packageCount) || 1
    if (count < 1) {
      toast({ title: "Error", description: "La cantidad de bultos debe ser al menos 1" })
      return
    }
    setShowLabel(true)
  }

  function handlePrintComplete() {
    setShowLabel(false)
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> Etiquetas de Envío
          </CardTitle>
          <div className="text-sm text-muted-foreground">Genera etiquetas para envío de pedidos</div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <Label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={useExistingCustomer}
                  onChange={() => handleUseExistingChange(true)}
                  className="h-4 w-4"
                />
                Seleccionar cliente existente
              </Label>
              <Label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!useExistingCustomer}
                  onChange={() => handleUseExistingChange(false)}
                  className="h-4 w-4"
                />
                Llenar datos manualmente
              </Label>
            </div>

            <Separator />

            {useExistingCustomer ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Buscar cliente</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                      placeholder="Buscar por nombre..."
                    />
                  </div>
                  {customerQuery && customers.length > 0 && (
                    <div className="border rounded-md max-h-60 overflow-y-auto">
                      {customers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleCustomerSelect(c)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b last:border-b-0"
                        >
                          <div className="font-medium">{c.name}</div>
                          {c.phone && <div className="text-sm text-muted-foreground">{c.phone}</div>}
                          {c.address && <div className="text-sm text-muted-foreground">{c.address}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedCustomer && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="font-medium text-blue-900">Cliente seleccionado: {selectedCustomer.name}</div>
                      {selectedCustomer.phone && (
                        <div className="text-sm text-blue-700">Tel: {selectedCustomer.phone}</div>
                      )}
                      {selectedCustomer.address && (
                        <div className="text-sm text-blue-700">Dir: {selectedCustomer.address}</div>
                      )}
                      {selectedCustomer.province && (
                        <div className="text-sm text-blue-700">Provincia: {selectedCustomer.province}</div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => handleUseExistingChange(false)}
                      >
                        Cambiar a datos manuales
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Nombre del cliente *</Label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Dirección</Label>
                  <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Teléfono</Label>
                  <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Provincia</Label>
                  <select
                    value={customerProvince}
                    onChange={(e) => setCustomerProvince(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Seleccionar provincia</option>
                    {DOMINICAN_PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <Separator />

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Remitente (quién envía) *</Label>
                <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Ej: Tejada Auto Adornos" />
              </div>
              <div className="grid gap-2">
                <Label>Cantidad de bultos *</Label>
                <Input
                  type="number"
                  min="1"
                  value={packageCount}
                  onChange={(e) => setPackageCount(e.target.value)}
                />
              </div>
            </div>

            <Button onClick={handleGenerateLabel} className="w-full" size="lg">
              <Printer className="mr-2 h-4 w-4" /> Generar Etiqueta
            </Button>
          </div>
        </CardContent>
      </Card>

      {showLabel && (
        <ShippingLabel
          customerName={customerName}
          customerAddress={customerAddress || null}
          customerPhone={customerPhone || null}
          customerProvince={customerProvince || null}
          senderName={senderName}
          packageCount={parseInt(packageCount) || 1}
          labelSize={shippingLabelSize}
          onPrintComplete={handlePrintComplete}
        />
      )}
    </div>
  )
}

