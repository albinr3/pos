// Probar permisos y navegación con sesiones simuladas, sin acceder a datos del negocio.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const jsxRuntime = require("react/jsx-runtime")
const cards = Object.fromEntries(["Card", "CardHeader", "CardTitle", "CardContent"].map((name) => [name, name]))

function loadModule(relativePath, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    ...globals,
    require(name) {
      if (name === "react/jsx-runtime") return jsxRuntime
      assert.ok(name in mocks, `Importación sin mock: ${name}`)
      return mocks[name]
    },
  }, { filename: relativePath })
  return exports
}

const permissions = loadModule("src/lib/permissions.ts")
const fallback = permissions.getDashboardFallbackPath

// Cada entrada prueba tanto el permiso aislado como su prioridad frente a los siguientes.
const destinations = [
  ["canAccessSales", "/sales"],
  ["canManageQuotes", "/quotes"],
  ["canAccessReturns", "/returns"],
  ["canManageCustomers", "/customers"],
  ["canAccessProducts", "/products"],
  ["canManageCategories", "/categories"],
  ["canManageSuppliers", "/suppliers"],
  ["canManagePurchases", "/purchases"],
  ["canCancelPurchases", "/purchases/list"],
  // El acceso a cuentas por pagar es un permiso de módulo, no una acción aislada.
  ["canAccessAccountsPayable", "/ap"],
  ["canAccessAccountsReceivable", "/ar"],
  ["canAccessPayments", "/payments/list"],
  ["canAccessDailyClose", "/daily-close"],
  ["canOperateCashShifts", "/daily-close"],
  ["canViewAllCashShifts", "/daily-close"],
  ["canManageCashShifts", "/daily-close"],
  ["canAccessReports", "/reports"],
  ["canAccessShippingLabels", "/shipping-labels"],
  ["canManageExpenses", "/operating-expenses"],
  ["canCancelExpenses", "/operating-expenses"],
  ["canViewTreasury", "/treasury"],
  ["canManageTreasuryAccounts", "/treasury"],
  ["canCreateTreasuryTransfers", "/treasury"],
  ["canReverseTreasuryTransfers", "/treasury"],
  ["canAccessBilling", "/billing"],
  ["canAccessSettings", "/settings"],
]

test("El destino usa permisos reales y respeta el orden del menú", () => {
  for (let i = 0; i < destinations.length; i++) {
    const [permission, expected] = destinations[i]
    assert.equal(fallback({ [permission]: true }), expected, permission)
    const user = Object.fromEntries(destinations.slice(i).map(([key]) => [key, true]))
    assert.equal(fallback(user), expected, `Prioridad: ${permission}`)
  }
})

test("Permisos de acciones aisladas, backups y rol ADMIN no conceden acceso implícito", () => {
  assert.equal(fallback({}), null)
  assert.equal(fallback({ role: "ADMIN" }), null)
  const accessPermissions = new Set(destinations.map(([key]) => key))
  for (const permission of permissions.ALL_PERMISSION_KEYS) {
    if (!accessPermissions.has(permission)) assert.equal(fallback({ [permission]: true }), null, permission)
  }
  assert.equal(fallback({ canAccessSales: false, canAccessProducts: true }), "/products")
})

function dashboardHarness(user) {
  const queries = []
  const NoModuleAccess = () => null
  const page = loadModule("src/app/(app)/dashboard/page.tsx", {
    "next/link": { default: "a" },
    "next/navigation": { redirect(destination) { throw new Error(`REDIRECT:${destination}`) } },
    "lucide-react": Object.fromEntries(["DollarSign", "CreditCard", "TrendingUp", "Receipt", "Wallet", "AlertTriangle", "Clock3"].map((name) => [name, name])),
    "@/components/ui/card": cards,
    "@/components/ui/button": { Button: "button" },
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/permissions": permissions,
    "@/lib/money": { formatRD: () => "RD$0" },
    "@/lib/utils": { cn: (...args) => args.join(" ") },
    "./actions": {
      getDashboardStats: async () => { queries.push("stats"); return {} },
      getSalesChartData: async () => { queries.push("chart"); return [] },
    },
    "../onboarding/actions": { getAccountOnboardingState: async () => { queries.push("onboarding"); return { phase: "COMPLETE" } } },
    "./sales-chart": { SalesChart: "SalesChart" },
    "./onboarding-card": { OnboardingCard: "OnboardingCard" },
    "./onboarding-activation-modal": { OnboardingActivationModal: "OnboardingActivationModal" },
    "./no-module-access": { NoModuleAccess },
  }).default
  return { render: () => page({ searchParams: Promise.resolve({}) }), queries, NoModuleAccess }
}

test("Dashboard redirige antes de consultar estadísticas, gráfica u onboarding", async () => {
  for (const [user, destination] of [
    [{ canAccessSales: true }, "/sales"],
    [{ canAccessProducts: true }, "/products"],
    [{ canCancelPurchases: true }, "/purchases/list"],
    [null, "/select-user"],
  ]) {
    const harness = dashboardHarness(user)
    await assert.rejects(harness.render(), { message: `REDIRECT:${destination}` })
    assert.deepEqual(harness.queries, [])
  }
})

test("Sin módulos muestra el aviso sin consultar datos ni redirigir", async () => {
  const harness = dashboardHarness({ canAccessDashboard: false, canAccessSales: false })
  const result = await harness.render()
  assert.equal(result.type, harness.NoModuleAccess)
  assert.deepEqual(harness.queries, [])
})

test("Con permiso de dashboard o siendo dueño conserva la carga normal", async () => {
  for (const user of [{ canAccessDashboard: true, canAccessSales: true }, { isOwner: true, canAccessDashboard: false }]) {
    const harness = dashboardHarness(user)
    const result = await harness.render()
    assert.equal(result.type, "div")
    assert.deepEqual(harness.queries, ["stats", "chart", "onboarding"])
  }
})

function findElement(element, predicate) {
  if (!element || typeof element !== "object") return null
  if (predicate(element)) return element
  const children = [element.props?.children].flat(Infinity)
  for (const child of children) {
    const match = findElement(child, predicate)
    if (match) return match
  }
  return null
}

function accessNoticeHarness(fetchImpl) {
  const states = []
  const requests = []
  const navigations = []
  let cursor = 0
  const component = loadModule("src/app/(app)/dashboard/no-module-access.tsx", {
    react: {
      useState(initial) {
        const index = cursor++
        if (!(index in states)) states[index] = initial
        return [states[index], (value) => { states[index] = value }]
      },
    },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/card": cards,
  }, {
    fetch: (...args) => { requests.push(args); return fetchImpl(...args) },
    window: { location: { assign: (destination) => navigations.push(destination) } },
  }).NoModuleAccess
  return {
    render() { cursor = 0; return component() },
    requests,
    navigations,
  }
}

const buttonIn = (tree) => findElement(tree, (element) => element.type === "button")

test("Cambiar usuario espera el cierre de sesión y bloquea el botón mientras procesa", async () => {
  let finishRequest
  const harness = accessNoticeHarness(() => new Promise((resolve) => { finishRequest = resolve }))
  const tree = harness.render()
  assert.ok(findElement(tree, (element) => element.props?.children === "No tienes módulos habilitados. Contacta al administrador."))
  const pending = buttonIn(tree).props.onClick()
  assert.equal(buttonIn(harness.render()).props.disabled, true)
  assert.deepEqual(harness.navigations, [])
  assert.equal(harness.requests[0][0], "/api/auth/logout-subuser")
  assert.equal(harness.requests[0][1].method, "POST")
  finishRequest({ ok: true })
  await pending
  assert.deepEqual(harness.navigations, ["/select-user"])
})

test("Un error HTTP o de red muestra aviso, permite reintentar y no navega", async () => {
  for (const fail of [async () => ({ ok: false }), async () => { throw new Error("Sin conexión") }]) {
    let attempts = 0
    const harness = accessNoticeHarness(() => ++attempts === 1 ? fail() : Promise.resolve({ ok: true }))
    await buttonIn(harness.render()).props.onClick()
    const failedTree = harness.render()
    assert.deepEqual(harness.navigations, [])
    assert.equal(buttonIn(failedTree).props.disabled, false)
    assert.equal(findElement(failedTree, (element) => element.props?.role === "alert").props.children, "No se pudo cambiar de usuario. Intenta de nuevo.")
    await buttonIn(failedTree).props.onClick()
    assert.deepEqual(harness.navigations, ["/select-user"])
  }
})
