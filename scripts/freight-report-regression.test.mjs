// Ejecuta el código real con Prisma y sesiones simuladas; nunca consulta ni escribe datos del negocio.
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
const reportPath = "src/app/(app)/reports/freight/"

function loadModule(relativePath, mocks = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, Date, Intl, URLSearchParams,
    console: { error() {} },
    require(name) {
      assert.ok(name in mocks, `Importación sin mock: ${name}`)
      return mocks[name]
    },
  }, { filename: relativePath })
  return exports
}

const dateTime = loadModule("src/lib/date-time.ts")
const dates = loadModule("src/lib/dates.ts")
const customerDisplay = loadModule("src/lib/customer-display.ts")
const permissions = loadModule("src/lib/permissions.ts")
const money = loadModule("src/lib/money.ts")
const model = loadModule(reportPath + "model.ts", { "@/lib/date-time": dateTime, "@/lib/dates": dates })
const exporters = loadModule(reportPath + "exports.ts", {
  jspdf: require("jspdf"), "jspdf-autotable": require("jspdf-autotable"),
  "@/lib/date-time": dateTime, "@/lib/money": money,
})
const filters = { from: "2026-10-01", to: "2026-10-31", customerId: "", type: "ALL", invoiceCode: "" }
const plain = (value) => JSON.parse(JSON.stringify(value))

test("Mes actual y atajos usan UTC-4 incluso en medianoche y cambio de año", () => {
  assert.deepEqual(plain(model.getFreightDateRange("month", new Date("2026-11-01T03:59:59Z"))), {
    from: "2026-10-01", to: "2026-10-31",
  })
  assert.deepEqual(plain(model.getFreightDateRange("today", new Date("2026-11-01T04:00:00Z"))), {
    from: "2026-11-01", to: "2026-11-01",
  })
  assert.deepEqual(plain(model.getFreightDateRange("previousMonth", new Date("2026-01-01T04:00:00Z"))), {
    from: "2025-12-01", to: "2025-12-31",
  })
  assert.deepEqual(plain(model.getFreightDateRange("previousMonth", new Date("2024-03-10T12:00:00Z"))), {
    from: "2024-02-01", to: "2024-02-29",
  })
  const defaults = model.parseFreightFilters({}, new Date("2026-10-18T12:00:00Z"))
  assert.equal(defaults.error, null)
  assert.equal(defaults.filters.from, "2026-10-01")
  assert.equal(defaults.filters.to, "2026-10-18")
})

test("Valida fechas reales, límites inclusivos, filtros y parámetros repetidos", () => {
  for (const invalid of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-04-31", "2026-1-01", "", "invalid"]) {
    assert.ok(model.parseFreightFilters({ ...filters, from: invalid }).error, invalid)
  }
  assert.equal(model.parseFreightFilters({ from: "2024-02-29", to: "2024-02-29" }).error, null)
  assert.ok(model.parseFreightFilters({ ...filters, from: "2026-11-01" }).error)
  assert.ok(model.parseFreightFilters({ ...filters, from: ["2026-10-01", "2026-09-01"] }).error)
  assert.ok(model.parseFreightFilters({ ...filters, type: "INVALID" }).error)
  assert.ok(model.parseFreightFilters({ ...filters, customerId: { accountId: "tenant-B" } }).error)
  for (const input of [null, [], "invalid"]) assert.ok(model.parseFreightFilters(input).error)
  const bounds = model.freightDateBounds(filters)
  assert.equal(bounds.gte.toISOString(), "2026-10-01T04:00:00.000Z")
  assert.equal(bounds.lte.toISOString(), "2026-11-01T03:59:59.999Z")
})

test("URL conserva filtros, codifica factura y vuelve a página 1 al aplicar", () => {
  const selected = { ...filters, customerId: "inactive", type: "CREDITO", invoiceCode: "A-00 & 1" }
  const page2 = new URL(model.freightReportHref(selected, 2), "https://example.test")
  assert.equal(page2.searchParams.get("customerId"), "inactive")
  assert.equal(page2.searchParams.get("invoiceCode"), "A-00 & 1")
  assert.equal(page2.searchParams.get("type"), "CREDITO")
  assert.equal(page2.searchParams.get("page"), "2")
  const firstPage = new URL(model.freightReportHref(selected), "https://example.test")
  assert.equal(firstPage.searchParams.get("page"), null)
})

function saleMatches(row, where = {}) {
  if (where.accountId !== undefined && row.accountId !== where.accountId) return false
  if (where.cancelledAt === null && row.cancelledAt !== null) return false
  if (where.shippingCents?.gt !== undefined && row.shippingCents <= where.shippingCents.gt) return false
  if (where.type && row.type !== where.type) return false
  if (where.soldAt?.gte && row.soldAt < where.soldAt.gte) return false
  if (where.soldAt?.lte && row.soldAt > where.soldAt.lte) return false
  if (where.customerId === null && row.customerId !== null) return false
  if (typeof where.customerId === "string" && row.customerId !== where.customerId) return false
  if (where.customerId?.in && !where.customerId.in.includes(row.customerId)) return false
  if (where.invoiceCode && !row.invoiceCode.toLowerCase().includes(where.invoiceCode.contains.toLowerCase())) return false
  if (where.OR && !where.OR.some((branch) => saleMatches(row, branch))) return false
  return true
}

function project(row, select) {
  if (row === null) return null
  return Object.fromEntries(Object.entries(select).map(([key, selection]) => [
    key, selection === true ? row[key] : project(row[key], selection.select),
  ]))
}

function harness({ user = { accountId: "tenant-A", name: "Ana", canAccessReports: true }, fail = false, count = 620 } = {}) {
  const queries = []
  const customers = [
    { id: "active", accountId: "tenant-A", name: 'María, "Importaciones"', visualId: 2, isActive: true, isGeneric: false },
    { id: "inactive", accountId: "tenant-A", name: "Tienda histórica", visualId: 3, isActive: false, isGeneric: false },
    { id: "general", accountId: "tenant-A", name: "Cliente general", visualId: 1, isActive: true, isGeneric: true },
    { id: "legacy", accountId: "tenant-A", name: " CLIENTE GENÉRICO ", visualId: 4, isActive: false, isGeneric: false },
    { id: "unused", accountId: "tenant-A", name: "Inactivo sin ventas", visualId: 5, isActive: false, isGeneric: false },
    { id: "other", accountId: "tenant-B", name: "Negocio ajeno", visualId: 2, isActive: true, isGeneric: false },
  ]
  const createSale = (id, overrides = {}) => {
    const customerId = ["active", "inactive", "general", "legacy", null][id % 5]
    return {
      id: String(id).padStart(7, "0"), accountId: "tenant-A", soldAt: new Date("2026-10-18T12:00:00Z"),
      invoiceCode: `A-${String(id).padStart(5, "0")}`, type: id % 2 === 0 ? "CONTADO" : "CREDITO",
      shippingCents: 10000 + id, totalCents: 50000 + id, cancelledAt: null, customerId,
      ...overrides,
    }
  }
  const validSales = Array.from({ length: count }, (_, i) => createSale(i + 1))
  validSales.push(createSale(90001, { soldAt: new Date("2026-10-01T04:00:00.000Z") }))
  validSales.push(createSale(90002, { soldAt: new Date("2026-11-01T03:59:59.999Z") }))
  const sales = [
    ...validSales,
    createSale(80001, { cancelledAt: new Date() }),
    createSale(80002, { shippingCents: 0 }), createSale(80003, { shippingCents: -1 }),
    createSale(80004, { accountId: "tenant-B", customerId: "other", shippingCents: 999999999 }),
    createSale(80005, { soldAt: new Date("2026-10-01T03:59:59.999Z") }),
    createSale(80006, { soldAt: new Date("2026-11-01T04:00:00.000Z") }),
  ].map((row) => ({ ...row, customer: customers.find((customer) => customer.id === row.customerId) || null }))

  const log = (method, query) => { queries.push({ method, query }); if (fail) throw new Error("DB unavailable") }
  const matchingCustomers = (where) => customers.filter((customer) => {
    if (customer.accountId !== where.accountId) return false
    if (where.id && customer.id !== where.id) return false
    return !where.OR || where.OR.some((branch) => branch.isActive === customer.isActive || (
      branch.sales && sales.some((sale) => sale.customerId === customer.id && sale.accountId === branch.sales.some.accountId)
    ))
  })
  const db = {
    sale: {
      async groupBy(query) {
        log("sale.groupBy", query)
        const selected = sales.filter((row) => saleMatches(row, query.where))
        return ["CONTADO", "CREDITO"].map((type) => {
          const rows = selected.filter((row) => row.type === type)
          return { type, _count: { _all: rows.length }, _sum: { shippingCents: rows.reduce((sum, row) => sum + row.shippingCents, 0) } }
        })
      },
      async findMany(query) {
        log("sale.findMany", query)
        const selected = sales.filter((row) => saleMatches(row, query.where)).sort((a, b) => (
          b.soldAt.getTime() - a.soldAt.getTime() || b.id.localeCompare(a.id)
        ))
        const start = query.skip ?? 0
        return selected.slice(start, query.take === undefined ? undefined : start + query.take).map((row) => project(row, query.select))
      },
    },
    customer: {
      async findMany(query) { log("customer.findMany", query); return matchingCustomers(query.where).map((row) => project(row, query.select)) },
      async findFirst(query) { log("customer.findFirst", query); return project(matchingCustomers(query.where)[0] || null, query.select) },
    },
    companySettings: {
      async findFirst(query) { log("companySettings.findFirst", query); return { name: "Tienda de prueba" } },
    },
    async $transaction(callback, options) { log("transaction", options); return callback(db) },
  }
  const access = loadModule("src/lib/module-access.ts", {
    "@/lib/auth": { async getCurrentUser() { return user } }, "@/lib/permissions": permissions,
    "next/navigation": { notFound() { throw new Error("NOT_FOUND") } },
  })
  const actions = loadModule(reportPath + "actions.ts", {
    "@/lib/module-access": access, "@/lib/db": { prisma: db },
    "@/lib/customer-display": customerDisplay, "./model": model,
  })
  return { actions, queries, sales, validSales, customers }
}

function expectedSummary(rows) {
  return {
    invoiceCount: rows.length,
    totalShippingCents: rows.reduce((sum, row) => sum + row.shippingCents, 0),
    cashShippingCents: rows.filter((row) => row.type === "CONTADO").reduce((sum, row) => sum + row.shippingCents, 0),
    creditShippingCents: rows.filter((row) => row.type === "CREDITO").reduce((sum, row) => sum + row.shippingCents, 0),
  }
}

test("Más de 500 ventas: totales completos, páginas estables de 50 y exportación íntegra", async () => {
  const h = harness()
  const first = await h.actions.getFreightReport(filters)
  const second = await h.actions.getFreightReport(filters, "2")
  assert.equal(first.error, null)
  assert.equal(first.rows.length, 50)
  assert.equal(second.rows.length, 50)
  assert.deepEqual(plain(first.summary), expectedSummary(h.validSales))
  assert.deepEqual(plain(second.summary), plain(first.summary))
  assert.equal(first.summary.invoiceCount, 622)
  assert.equal(first.pagination.totalPages, 13)
  assert.equal(first.rows[0].id, "0090002")
  assert.equal(new Set([...first.rows, ...second.rows].map((row) => row.id)).size, 100)
  const last = await h.actions.getFreightReport(filters, "999999999999999")
  assert.equal(last.pagination.page, 13)
  assert.equal(last.rows.length, 22)
  for (const invalidPage of ["no", "-1", "1.5", ["1", "2"]]) {
    assert.equal((await h.actions.getFreightReport(filters, invalidPage)).pagination.page, 1)
  }
  const download = await h.actions.getFreightReportForExport(filters)
  assert.equal(download.error, null)
  assert.equal(download.data.rows.length, 622)
  assert.deepEqual(plain(download.data.summary), plain(first.summary))
  assert.equal(download.data.companyName, "Tienda de prueba")
  assert.ok(download.data.rows.some((row) => row.id === "0090001"))
  assert.ok(download.data.rows.some((row) => row.id === "0090002"))
  assert.ok(!download.data.rows.some((row) => row.id.startsWith("008")))
  assert.ok(h.queries.filter((q) => q.method === "sale.findMany").every((q) => q.query.where.accountId === "tenant-A"))
  assert.ok(h.queries.filter((q) => q.method === "transaction").every((q) => q.query.isolationLevel === "RepeatableRead"))
})

test("Filtros individuales y combinados coinciden en tabla, totales y descargas", async () => {
  const h = harness()
  for (const selected of [
    { ...filters, customerId: "inactive" }, { ...filters, type: "CREDITO" },
    { ...filters, invoiceCode: "a-001" },
    { ...filters, customerId: "inactive", type: "CREDITO", invoiceCode: "a-001" },
    { ...filters, from: "2026-10-18", to: "2026-10-18" },
  ]) {
    const expected = h.validSales.filter((row) => (
      (!selected.customerId || row.customerId === selected.customerId)
      && (selected.type === "ALL" || row.type === selected.type)
      && row.invoiceCode.toLowerCase().includes(selected.invoiceCode.toLowerCase())
      && (selected.from !== "2026-10-18" || row.soldAt.toISOString() === "2026-10-18T12:00:00.000Z")
    ))
    const report = await h.actions.getFreightReport(selected)
    const download = await h.actions.getFreightReportForExport(selected)
    assert.deepEqual(plain(report.summary), expectedSummary(expected))
    assert.deepEqual(plain(download.data.summary), plain(report.summary))
    assert.equal(download.data.rows.length, expected.length)
  }
})

test("Cliente general reúne ventas sin cliente, genéricos y nombres históricos", async () => {
  const h = harness()
  const result = await h.actions.getFreightReportForExport({ ...filters, customerId: "GENERAL" })
  const expected = h.validSales.filter((row) => [null, "general", "legacy"].includes(row.customerId))
  assert.equal(result.data.rows.length, expected.length)
  assert.ok(result.data.rows.every((row) => row.customerName === "Cliente general"))
  assert.equal(result.data.customerLabel, "Cliente general")
  const report = await h.actions.getFreightReport({ ...filters, customerId: "GENERAL" })
  assert.deepEqual(plain(report.summary), expectedSummary(expected))
})

test("Opciones de clientes incluyen inactivos con ventas y excluyen otros negocios", async () => {
  const h = harness()
  const options = await h.actions.getFreightCustomers()
  assert.deepEqual(plain(options.map((row) => row.id)).sort(), ["active", "inactive"])
})

test("Sin permiso, sesión o con admin sin permiso, todas las acciones rechazan antes de consultar", async () => {
  for (const user of [null, { accountId: "tenant-A", canAccessReports: false }, { accountId: "tenant-A", role: "ADMIN", canAccessReports: false }]) {
    const h = harness({ user })
    await assert.rejects(h.actions.getFreightReport(filters), /NOT_FOUND/)
    await assert.rejects(h.actions.getFreightCustomers(), /NOT_FOUND/)
    await assert.rejects(h.actions.getFreightReportForExport(filters), /NOT_FOUND/)
    assert.equal(h.queries.length, 0)
  }
})

test("Un ID de cliente ajeno no revela ventas, opciones ni metadatos", async () => {
  const h = harness()
  const report = await h.actions.getFreightReport({ ...filters, customerId: "other" })
  const download = await h.actions.getFreightReportForExport({ ...filters, customerId: "other" })
  assert.equal(report.summary.invoiceCount, 0)
  assert.equal(download.data.rows.length, 0)
  assert.ok(!JSON.stringify(download).includes("Negocio ajeno"))
  assert.ok(h.queries.filter((q) => q.method === "customer.findFirst").every((q) => q.query.where.accountId === "tenant-A"))
})

test("Errores de filtros y de base de datos permiten volver a consultar", async () => {
  const h = harness()
  const invalid = { ...filters, from: "2026-02-31" }
  assert.ok((await h.actions.getFreightReport(invalid)).error)
  assert.ok((await h.actions.getFreightReportForExport(invalid)).error)
  assert.equal(h.queries.length, 0)
  const failed = harness({ fail: true })
  assert.match((await failed.actions.getFreightReport(filters)).error, /Intenta aplicar/)
  assert.match((await failed.actions.getFreightReportForExport(filters)).error, /Inténtalo nuevamente/)
  const empty = await h.actions.getFreightReport({ ...filters, invoiceCode: "NO-EXISTE" })
  assert.equal(empty.rows.length, 0)
  assert.equal(empty.summary.totalShippingCents, 0)
  assert.equal(empty.pagination.totalPages, 1)
})

test("CSV conserva acentos, comas, comillas, saltos, decimales y neutraliza fórmulas", async () => {
  const data = (await harness().actions.getFreightReportForExport(filters)).data
  const custom = {
    ...data, rows: [
      { ...data.rows[0], customerName: 'María, "Importaciones"\nCentro', shippingCents: 12345 },
      { ...data.rows[1], customerName: '=HYPERLINK("https://example.test")', shippingCents: 6789 },
    ], summary: { ...data.summary, totalShippingCents: 19134 },
  }
  const csv = exporters.createFreightCSV(custom)
  assert.ok(csv.startsWith("\uFEFF"))
  assert.ok(csv.includes('"María, ""Importaciones""\nCentro"'))
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'))
  assert.ok(csv.includes('"123.45"'))
  assert.ok(csv.endsWith('"191.34",""'))
  assert.equal(exporters.freightExportFilename(data, "csv"), "fletes_2026-10-01_2026-10-31.csv")
})

test("PDF real multipágina contiene todas las facturas, filtros y total", async () => {
  const data = (await harness().actions.getFreightReportForExport(filters)).data
  const doc = exporters.createFreightPDF(data)
  const pdf = doc.output()
  assert.ok(doc.getNumberOfPages() > 10)
  assert.ok(pdf.startsWith("%PDF-"))
  assert.ok(pdf.includes("Reporte de fletes"))
  assert.ok(pdf.includes("Tienda de prueba"))
  assert.ok(pdf.includes("2026-10-01 al 2026-10-31"))
  assert.ok(pdf.includes("TOTAL FLETE"))
  for (const row of data.rows) assert.ok(pdf.includes(row.invoiceCode), row.invoiceCode)
  const singleRows = data.rows.slice(0, 1)
  const onePage = exporters.createFreightPDF({ ...data, rows: singleRows, summary: model.summarizeFreightRows(singleRows) })
  assert.equal(onePage.getNumberOfPages(), 1)
  if (process.env.FREIGHT_REPORT_QA_DIR) {
    // Artefactos optativos para revisión visual local; las pruebas normales no crean archivos.
    const directory = path.resolve(process.env.FREIGHT_REPORT_QA_DIR)
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, "fletes-multipagina.pdf"), Buffer.from(doc.output("arraybuffer")))
    fs.writeFileSync(path.join(directory, "fletes-una-pagina.pdf"), Buffer.from(onePage.output("arraybuffer")))
    fs.writeFileSync(path.join(directory, "fletes.csv"), exporters.createFreightCSV(data))
  }
})

function clientHarness(report, exportAction = async () => ({ data: null, error: "Error de descarga" })) {
  const slots = []
  let index = 0
  const navigations = []
  const downloads = []
  const react = require("react")
  const primitives = {
    Button: "button", Card: "section", CardContent: "div", CardHeader: "header", CardTitle: "h2",
    Input: "input", Label: "label", Select: "select", SelectContent: "optgroup", SelectItem: "option",
    SelectTrigger: "span", SelectValue: "span", Table: "table", TableBody: "tbody", TableCell: "td",
    TableHead: "th", TableHeader: "thead", TableRow: "tr",
    Dialog: "dialog", DialogContent: "div", DialogDescription: "p", DialogHeader: "header",
    DialogTitle: "h2", DialogTrigger: "span",
  }
  const mocks = {
    react: {
      useState(initial) {
        const current = index++
        if (!(current in slots)) slots[current] = initial
        return [slots[current], (value) => { slots[current] = typeof value === "function" ? value(slots[current]) : value }]
      },
      useTransition() { return [false, (callback) => callback()] },
    },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { useRouter() { return { push: (url) => navigations.push(url) } } },
    "lucide-react": Object.fromEntries(["ArrowLeft", "Check", "ChevronLeft", "ChevronRight", "FileDown", "FileSpreadsheet", "Search"].map((name) => [name, () => null])),
    "@/lib/customer-display": customerDisplay,
    "@/lib/date-time": dateTime, "@/lib/money": money, "./model": model,
    "./actions": { getFreightReportForExport: exportAction },
    "./exports": { createFreightPDF: () => ({ save: (filename) => downloads.push(filename) }), freightExportFilename: exporters.freightExportFilename },
  }
  for (const component of ["button", "card", "dialog", "input", "label", "select", "table"]) {
    mocks[`@/components/ui/${component}`] = primitives
  }
  const { FreightReportClient } = loadModule(reportPath + "freight-report-client.tsx", mocks)
  function render() {
    index = 0
    const tree = FreightReportClient({ report, customers: [{ id: "inactive", label: "Tienda histórica" }] })
    const elements = []
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit)
      if (react.isValidElement(node)) { elements.push(node); visit(node.props.children) }
    }
    visit(tree)
    return elements
  }
  const byId = (id) => render().find((element) => element.props.id === id)
  const button = (text) => render().find((element) => element.type === "button" && (
    element.props["aria-label"] === text || (Array.isArray(element.props.children) ? element.props.children.includes(text) : element.props.children === text)
  ))
  return { render, byId, button, navigations, downloads }
}

test("Interfaz: aplicar valida fechas, conserva filtros y reinicia la paginación", async () => {
  const report = await harness().actions.getFreightReport(filters, 2)
  const ui = clientHarness(report)
  ui.byId("freight-from").props.onChange({ target: { value: "2026-11-01" } })
  ui.render().find((element) => element.type === "form").props.onSubmit({ preventDefault() {} })
  assert.equal(ui.navigations.length, 0)
  assert.ok(ui.render().some((element) => element.props.role === "alert"))
  ui.byId("freight-from").props.onChange({ target: { value: "2026-10-01" } })
  ui.render().find((element) => element.type === "select"
    && element.props.children.some((child) => child.props.id === "freight-type")).props.onValueChange("CREDITO")
  ui.byId("freight-invoice").props.onChange({ target: { value: "A-001" } })
  ui.render().find((element) => element.type === "form").props.onSubmit({ preventDefault() {} })
  const applied = new URL(ui.navigations.at(-1), "https://example.test")
  assert.equal(applied.searchParams.get("page"), null)
  assert.equal(applied.searchParams.get("invoiceCode"), "A-001")
  assert.equal(applied.searchParams.get("type"), "CREDITO")
})

test("Interfaz: paginar y descargar utilizan filtros aplicados; errores de descarga son recuperables", async () => {
  const data = await harness().actions.getFreightReportForExport(filters)
  const report = await harness().actions.getFreightReport(filters)
  let finish
  let received
  const ui = clientHarness(report, (input) => { received = input; return new Promise((resolve) => { finish = resolve }) })
  ui.byId("freight-invoice").props.onChange({ target: { value: "BORRADOR" } })
  ui.button("Página siguiente").props.onClick()
  const page = new URL(ui.navigations.at(-1), "https://example.test")
  assert.equal(page.searchParams.get("invoiceCode"), null)
  assert.equal(page.searchParams.get("page"), "2")
  const pending = ui.button("Descargar PDF").props.onClick()
  assert.deepEqual(plain(received), filters)
  assert.equal(ui.button("Descargar CSV").props.disabled, true)
  finish(data)
  await pending
  assert.equal(ui.downloads.length, 1)
  assert.equal(ui.button("Descargar PDF").props.disabled, false)
  const error = clientHarness(report)
  await error.button("Descargar PDF").props.onClick()
  assert.ok(error.render().some((element) => element.props.role === "alert" && element.props.children === "Error de descarga"))
  assert.equal(error.button("Descargar PDF").props.disabled, false)
})

test("Interfaz: atajos y limpiar conservan las reglas del período; sin resultados no se descarga", async () => {
  const report = await harness().actions.getFreightReport({ ...filters, invoiceCode: "NO-EXISTE" })
  const ui = clientHarness(report)
  assert.equal(ui.button("Descargar CSV").props.disabled, true)
  assert.equal(ui.button("Descargar PDF").props.disabled, true)
  ui.button("Mes anterior").props.onClick()
  const previous = new URL(ui.navigations.at(-1), "https://example.test")
  assert.equal(previous.searchParams.get("from"), model.getFreightDateRange("previousMonth").from)
  assert.equal(previous.searchParams.get("invoiceCode"), "NO-EXISTE")
  ui.button("Limpiar").props.onClick()
  const cleared = new URL(ui.navigations.at(-1), "https://example.test")
  assert.equal(cleared.searchParams.get("from"), model.defaultFreightFilters().from)
  assert.equal(cleared.searchParams.get("to"), model.defaultFreightFilters().to)
  assert.equal(cleared.searchParams.get("invoiceCode"), null)
})
