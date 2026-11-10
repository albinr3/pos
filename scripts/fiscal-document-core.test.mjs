import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const cache = new Map()
function load(path) {
  if (cache.has(path)) return cache.get(path)
  const source = fs.readFileSync(`src/lib/fiscal/${path}.ts`, 'utf8')
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}; cache.set(path, exports)
  vm.runInNewContext(out, { exports, require: name => name === '@prisma/client/runtime/library' ? require(name) : name === '../profiles/do-ecf/rules' ? load('profiles/do-ecf/rules') : name === '../profiles/do-ecf/catalog' || name === './catalog' ? load('profiles/do-ecf/catalog') : name === './countries' ? load('core/countries') : require(name), Date, RegExp, console }, { filename: path })
  return exports
}
const { calculateFiscalDocument: calc } = load('core/document')
const party = { name: 'Empresa prueba', identification: '123456789', country: 'DO' }
const buyer = { name: 'Cliente prueba', identification: '101000001', country: 'DO' }
const supplier = { name: 'Proveedor prueba', identification: 'EX123', country: 'US' }
function example(type) {
  const treatment = ['E43', 'E44', 'E47'].includes(type) ? 'EXENTO' : type === 'E46' ? 'TASA_CERO' : 'GRAVADO_18'
  return { type, issueDate: '2026-11-09', issuer: party, ...(type !== 'E43' ? { buyer } : {}), ...(type === 'E41' ? { supplier:{...supplier,declaredCondition:'NO_REGISTRADO'} } : type === 'E47' ? {supplier:{...supplier,residence:'US'}} : {}), ...(['E33','E34'].includes(type) ? { reference: { documentId: 'fixture', issueDate: '2026-11-01', modificationCode: '3' } } : {}), ...(!['E41','E43','E47'].includes(type) ? {incomeType:'01'} : {}), ...(!['E43','E47'].includes(type) ? {payment:{type:'CONTADO'}} : {}), currency: { operation: 'DOP', reporting: 'DOP' }, lines: [{ description: 'Ejemplo', kind: type === 'E47' ? 'SERVICIO' : 'BIEN', unit: 'UNIDAD', quantity: '1.00', unitPrice: '118.00', taxTreatment: treatment, priceIncludesTax: true, ...(type === 'E34' ? {originalLine:1} : {}), ...(['E41','E47'].includes(type) ? {retentionAgent:'1'} : {}), ...(type === 'E47' ? { withholdings: [{ kind: 'ISR', rate: '10' }] } : type === 'E41' ? {withholdings:[{kind:'ITBIS',rate:'100'}]} : {}) }] }
}
for (const type of ['E31','E32','E33','E34','E41','E43','E44','E45','E46','E47']) test(`${type}: ejemplo determinista sin estado externo`, () => {
  const result = calc(example(type), 2)
  assert.equal(result.type, type); assert.equal(result.externalResult, null); assert.equal(result.policyVersion, 2)
  if (type === 'E34') assert.equal(result.lines[0].originalLine,1)
  assert.equal(result.totals.gross, '118.00')
  assert.equal(result.totals.withheld, type === 'E47' ? '11.80' : type === 'E41' ? '18.00' : '0.00')
})
test('descuento global por residuos y bases de distintas tasas concilian', () => {
  const input = example('E31')
  input.lines = ['GRAVADO_18','GRAVADO_16','EXENTO'].map(taxTreatment => ({ description: taxTreatment, kind:'BIEN', unit:'UNIDAD', quantity:'1', unitPrice:'10.00', taxTreatment, priceIncludesTax:false }))
  input.globalDiscount = '0.01'
  const r = calc(input, 1)
  assert.equal(r.lines.map(x => x.globalDiscount).join(','), '0.01,0.00,0.00')
  assert.equal(r.totals.gross, '33.39'); assert.equal(r.totals.tax, '3.40')
})
test('rechaza precisión excesiva, campos arbitrarios e incompatibilidad fiscal', () => {
  const input = example('E31'); input.lines[0].quantity = '1.001'
  assert.throws(() => calc(input, 1), e => e.status === 422 && e.issues[0].field === 'lines.0.quantity')
  input.lines[0].quantity = '1'; input.externalResult = 'ACEPTADO'
  assert.throws(() => calc(input, 1), e => e.status === 400)
  const invalid = example('E44'); invalid.lines[0].taxTreatment = 'GRAVADO_18'
  assert.throws(() => calc(invalid, 1), e => e.status === 422)
})
test('precios incluidos, descuentos y retenciones no usan float binario', () => {
  const input = example('E41'); input.lines[0].kind = 'SERVICIO'; input.lines[0].unitPrice = '118.00'; input.lines[0].discount = '11.80'; input.lines[0].withholdings = [{kind:'ISR', rate:'10'}, {kind:'ITBIS', rate:'100'}]
  const r = calc(input, 1)
  assert.equal(r.lines[0].base, '90.00'); assert.equal(r.totals.tax, '16.20'); assert.equal(r.totals.withheld, '25.20'); assert.equal(r.totals.net, '81.00')
  assert.equal(r.totals.withheldByKind.ISR, '9.00'); assert.equal(r.totals.withheldByKind.ITBIS, '16.20')
})
test('líneas exentas con agente conservan ITBIS retenido cero cuando el tipo lo admite', () => {
  for (const type of ['E31','E33','E34','E41']) {
    const input=example(type); input.lines[0].taxTreatment='EXENTO'; input.lines[0].retentionAgent='1'; input.lines[0].withholdings=[{kind:'ISR',rate:'10'}]
    if (type === 'E41') input.lines[0].kind='SERVICIO'
    const line=calc(input,1).lines[0]; assert.equal(line.withholdings.find(w=>w.kind==='ITBIS').amount,'0.00'); assert.equal(line.withholdings.find(w=>w.kind==='ISR').amount,'11.80')
  }
  const abroad=calc(example('E47'),1); assert.equal(abroad.lines[0].withholdings.some(w=>w.kind==='ITBIS'),false)
})
test('moneda extranjera requiere tasa y fecha y calcula DOP', () => {
  const input = example('E31'); input.currency = { operation:'USD', reporting:'DOP', rate:'60.5000', rateDate:'2026-11-09' }
  const r = calc(input, 1); assert.equal(r.reportingTotals.gross, '7139.00')
  delete input.currency.rateDate; assert.throws(() => calc(input,1), e => e.status === 422)
})
test('E34 conserva ITBIS documentado pero excluye su devolución después del día 30', () => {
  const input = example('E34'); input.reference.issueDate = '2026-11-09'; input.issueDate = '2026-12-09'
  input.issueDate = '2026-12-08'; assert.equal(calc(input,1).reference.creditIndicator,0)
  input.issueDate = '2026-12-09'
  let r = calc(input, 1); assert.equal(r.reference.creditIndicator, 0); assert.equal(r.totals.net, '118.00'); assert.equal(r.totals.taxNotCreditable, '0.00')
  input.issueDate = '2026-12-10'; r = calc(input, 1)
  assert.equal(r.reference.creditIndicator, 1); assert.equal(r.lines[0].taxTreatment, 'GRAVADO_18'); assert.equal(r.totals.tax, '18.00'); assert.equal(r.totals.taxNotCreditable, '18.00'); assert.equal(r.totals.gross, '118.00'); assert.equal(r.totals.creditEligible, '100.00'); assert.equal(r.totals.net, '100.00')
  input.lines[0].priceIncludesTax = false; input.lines[0].unitPrice = '100.00'; r = calc(input, 1)
  assert.equal(r.totals.taxNotCreditable, '18.00'); assert.equal(r.totals.net, '100.00')
  input.lines[0].discount='10.00'; r = calc(input,1); assert.equal(r.totals.taxNotCreditable,'16.20'); assert.equal(r.totals.net,'90.00')
  input.lines[0].retentionAgent = '1'; input.lines[0].withholdings = [{kind:'ITBIS',rate:'30'}]
  assert.throws(() => calc(input, 1), e => e.status === 422 && e.issues[0].field === 'lines.0.withholdings')
})
test('condiciones de crédito, ingreso, umbral E32 y retención E41', () => {
  const e31 = example('E31'); e31.payment = {type:'CREDITO',dueDate:'2026-11-08'}
  assert.throws(() => calc(e31,1), e => e.issues[0].field === 'payment.dueDate')
  e31.payment.dueDate = '2026-12-09'; assert.equal(calc(e31,1).payment.type,'CREDITO')
  delete e31.incomeType; assert.throws(() => calc(e31,1), e => e.issues[0].field === 'incomeType')
  const e32 = example('E32'); delete e32.buyer; e32.lines[0].unitPrice = '250000.00'; e32.lines[0].taxTreatment = 'EXENTO'
  assert.throws(() => calc(e32,1), e => e.issues[0].field === 'buyer')
  e32.lines[0].unitPrice = '249999.99'; assert.equal(calc(e32,1).buyer,null)
  const e41 = example('E41'); e41.lines[0].taxTreatment='EXENTO'; const zero=calc(e41,1).lines[0].withholdings.find(x=>x.kind==='ITBIS'); assert.equal(zero.amount,'0.00')
  e41.lines[0].taxTreatment='GRAVADO_18'; e41.lines[0].withholdings=[{kind:'ITBIS',rate:'30'}]; assert.throws(()=>calc(e41,1),e=>e.issues[0].field==='lines.0.withholdings')
  e41.lines[0].withholdings=[{kind:'ITBIS',rate:'100'}]; e41.supplier.declaredCondition='REGISTRADO'; assert.throws(()=>calc(e41,1),e=>e.issues[0].field==='supplier.declaredCondition')
  const e44 = example('E44'); e44.lines[0].retentionAgent='1'; assert.throws(() => calc(e44,1),e=>e.issues[0].field==='lines.0.withholdings')
  const e43=example('E43'); e43.payment={type:'CREDITO'}; assert.equal(calc(e43,1).payment.dueDate,null)
  const e47=example('E47'); e47.payment={type:'CREDITO'}; assert.equal(calc(e47,1).payment.dueDate,null)
  const e46=example('E46'); e46.lines[0].kind='SERVICIO'; assert.throws(()=>calc(e46,1),e=>e.issues[0].field==='lines.0.kind')
})
test('entrega gratuita advierte que no da crédito fiscal ni representa un cobro', () => {
  const input=example('E31'); input.payment={type:'GRATUITO'}
  const result=calc(input,1); assert.ok(result.warnings.some(w=>w.includes('no da derecho a crédito fiscal') && w.includes('no representa un cobro')))
  input.payment={type:'CONTADO'}; assert.equal(calc(input,1).warnings.some(w=>w.includes('entrega gratuita')),false)
})
test('E47 rechaza países inexistentes y el perfil DO exige emisor dominicano', () => {
  const e47 = example('E47'); e47.supplier = {...e47.supplier,country:'ZZ'}
  assert.throws(() => calc(e47,1),e=>e.issues[0].field==='supplier.country')
  e47.supplier = {...e47.supplier,country:'US',residence:'DO'}; assert.throws(()=>calc(e47,1),e=>e.issues[0].field==='supplier.residence')
  const e31 = example('E31'); e31.issuer = {...e31.issuer,country:'US'}
  assert.throws(() => calc(e31,1),e=>e.issues[0].field==='issuer.country')
})
test('identificación dominicana exige estructura y la extranjera conserva su texto', () => {
  const input=example('E31'); input.buyer={...input.buyer,identification:'12-345'}
  assert.throws(()=>calc(input,1),e=>e.issues[0].field==='buyer.identification')
  input.buyer={name:'Cliente extranjero',identification:'AB-12/34',country:'US'}
  assert.throws(()=>calc(input,1),e=>e.issues[0].field==='buyer.country')
  const consumption=example('E32'); consumption.buyer=input.buyer; assert.equal(calc(consumption,1).buyer.identification,'AB-12/34')
  const government=example('E45'); government.buyer=input.buyer; assert.throws(()=>calc(government,1),e=>e.issues[0].field==='buyer.country')
  input.issuer={...input.issuer,identification:'123'}; assert.throws(()=>calc(input,1),e=>e.issues[0].field==='issuer.identification')
})
test('E34 con código 2 exige líneas a cero y no genera crédito ni reembolso', () => {
  const input = example('E34'); input.reference.modificationCode = '2'
  assert.throws(()=>calc(input,1),e=>e.issues[0].field==='lines.0.unitPrice')
  input.lines[0].unitPrice='0.00'
  let r = calc(input,1); assert.equal(r.totals.gross,'0.00'); assert.equal(r.totals.creditEligible,'0.00'); assert.equal(r.totals.net,'0.00'); assert.equal(r.reportingTotals.net,'0.00')
  input.issueDate='2026-12-20'; r=calc(input,1); assert.equal(r.reference.creditIndicator,1); assert.equal(r.totals.taxNotCreditable,'0.00'); assert.equal(r.totals.net,'0.00')
})
