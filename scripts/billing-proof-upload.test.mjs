// Ejecutar el flujo real con red, sesión y almacenamiento simulados evita
// subir comprobantes de prueba o consultar la base de datos de producción.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

function loadModule(relativePath, mocks = {}, globals = {}) {
  const source = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, File, FormData, Buffer, Response,
    require(name) {
      assert.ok(name in mocks, `Importación sin mock: ${name}`)
      return mocks[name]
    },
    ...globals,
  }, { filename: relativePath })
  return exports
}

const helperPath = "src/lib/billing-proof-upload.ts"
const helper = loadModule(helperPath)
const image = () => new File([new Uint8Array([1, 2, 3])], "pago móvil.png", { type: "image/png" })
const directError = { code: "UPLOAD_FAILED", message: "XHR failed 400" }

test("Un XHR 400 recupera el archivo original por el servidor, conservando nombre, MIME y bytes", async () => {
  const file = image()
  let calls = 0
  const { recoverPaymentProofUpload } = loadModule(helperPath, {}, {
    async fetch(url, options) {
      calls++
      assert.equal(url, "/api/billing/proofs/upload")
      assert.equal(options.method, "POST")
      assert.equal(options.headers, undefined, "El navegador debe generar el boundary multipart")
      const uploaded = options.body.get("file")
      assert.equal(uploaded.name, file.name)
      assert.equal(uploaded.type, file.type)
      assert.deepEqual(await uploaded.arrayBuffer(), await file.arrayBuffer())
      return Response.json({ url: "https://example.ufs.sh/f/proof" })
    },
  })
  const result = await recoverPaymentProofUpload(file, directError)
  assert.equal(result.url, "https://example.ufs.sh/f/proof")
  assert.equal(result.name, file.name)
  assert.equal(result.type, file.type)
  assert.equal(calls, 1)
})

test("No se reintentan errores de validación, archivos inválidos ni subidas sin archivo", async () => {
  const { recoverPaymentProofUpload } = loadModule(helperPath, {}, {
    fetch() { assert.fail("No debe iniciar una subida de respaldo") },
  })
  await assert.rejects(recoverPaymentProofUpload(image(), { code: "TOO_LARGE", message: "Límite" }), /Límite/)
  await assert.rejects(recoverPaymentProofUpload(null, directError), /XHR failed 400/)
  await assert.rejects(recoverPaymentProofUpload(new File([], "empty.png", { type: "image/png" }), directError), /vacío/)
  await assert.rejects(recoverPaymentProofUpload(new File(["text"], "proof.txt", { type: "text/plain" }), directError), /imágenes o PDF/)
  await assert.rejects(recoverPaymentProofUpload(new File([new Uint8Array(helper.MAX_PAYMENT_PROOF_SIZE_BYTES + 1)], "big.png", { type: "image/png" }), directError), /4 MB/)
})

test("La recuperación muestra errores de la API y tolera respuestas sin JSON o sin URL", async () => {
  for (const [response, expected] of [
    [Response.json({ error: "No autenticado" }, { status: 401 }), /No autenticado/],
    [Response.json({ error: "Error de almacenamiento. Referencia: test-123" }, { status: 502 }), /test-123/],
    [new Response("Bad Gateway", { status: 502 }), /No se pudo subir/],
    [Response.json({}), /No se pudo subir/],
  ]) {
    const { recoverPaymentProofUpload } = loadModule(helperPath, {}, { fetch: async () => response })
    await assert.rejects(recoverPaymentProofUpload(image(), directError), expected)
  }
  const { recoverPaymentProofUpload } = loadModule(helperPath, {}, {
    fetch: async () => { throw new Error("Failed to fetch") },
  })
  await assert.rejects(recoverPaymentProofUpload(image(), directError), /Revisa tu conexión/)
})

function routeHarness({ user = { id: "user-1", accountId: "account-1" }, result } = {}) {
  const uploads = []
  const logs = []
  const { POST } = loadModule("src/app/api/billing/proofs/upload/route.ts", {
    "next/server": { NextResponse: Response },
    "uploadthing/server": { UTApi: class {
      async uploadFiles(file) {
        uploads.push(file)
        return result ?? { data: { ufsUrl: "https://example.ufs.sh/f/proof" }, error: null }
      }
    } },
    "../../../_helpers/auth": { getCurrentUserFromRequest: async () => user },
    "@/lib/billing-proof-upload": helper,
    "@/lib/error-logger": {
      ErrorCodes: { EXTERNAL_UPLOAD_ERROR: "EXTERNAL_UPLOAD_ERROR" },
      async logError(error, context) { logs.push({ error, context }); return "test-log" },
    },
  })
  return { POST, uploads, logs }
}

function multipartRequest(file) {
  const body = new FormData()
  if (file) body.append("file", file)
  return new Request("https://example.com/api/billing/proofs/upload", { method: "POST", body })
}

test("La API exige sesión y rechaza archivos vacíos, inválidos o mayores a 4 MB antes de subir", async () => {
  const unauthorized = routeHarness({ user: null })
  assert.equal((await unauthorized.POST(multipartRequest(image()))).status, 401)
  assert.equal(unauthorized.uploads.length, 0)

  const harness = routeHarness()
  for (const file of [null, new File([], "empty.png", { type: "image/png" }),
    new File(["text"], "proof.txt", { type: "text/plain" }),
    new File([new Uint8Array(helper.MAX_PAYMENT_PROOF_SIZE_BYTES + 1)], "big.png", { type: "image/png" })]) {
    assert.equal((await harness.POST(multipartRequest(file))).status, 400)
  }
  assert.equal(harness.uploads.length, 0)
})

test("La API conserva compatibilidad con multipart y base64 para imágenes y PDF", async () => {
  const harness = routeHarness()
  for (const file of [image(), new File(["%PDF"], "proof.pdf", { type: "application/pdf" })]) {
    const response = await harness.POST(multipartRequest(file))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).url, "https://example.ufs.sh/f/proof")
  }
  const response = await harness.POST(new Request("https://example.com/api/billing/proofs/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ base64: "data:image/png;base64,AQID", fileName: "proof.png", mimeType: "image/png" }),
  }))
  assert.equal(response.status, 200)
  assert.equal(harness.uploads.length, 3)
  assert.equal(harness.uploads[2].size, 3)
})

test("Si UploadThing falla, la API registra contexto sin contenido y devuelve una referencia segura", async () => {
  const harness = routeHarness({ result: { data: null, error: { message: "Provider failed" } } })
  const response = await harness.POST(multipartRequest(image()))
  assert.equal(response.status, 502)
  const body = await response.json()
  assert.match(body.error, /Referencia: test-log/)
  assert.doesNotMatch(body.error, /Provider failed/)
  assert.equal(harness.logs.length, 1)
  assert.equal(harness.logs[0].context.accountId, "account-1")
  assert.equal(harness.logs[0].context.userId, "user-1")
  assert.equal(harness.logs[0].context.metadata.fileSize, 3)
  assert.equal(harness.logs[0].context.requestBody, undefined)
})
