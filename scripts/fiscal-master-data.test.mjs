import assert from 'node:assert/strict'
import fs from 'node:fs'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { fiscalFields, customerFiscalFields, productFiscalFields, encodePreferredReceiptTypes, parsePreferredReceiptTypes, validateFiscalCatalogFields } from '../src/lib/fiscal/core/master-data.ts'

const url = new URL(dotenv.parse(fs.readFileSync('.env.fiscal-test')).TEST_DATABASE_URL)
if (!['localhost','127.0.0.1'].includes(url.hostname) || !/^\/movopos_fiscal_test(?:_\d+)?$/.test(url.pathname) || (url.searchParams.get('schema') && url.searchParams.get('schema') !== 'public')) throw Error('Solo se admite la base fiscal local de prueba')
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
const rollback = new Error('ROLLBACK_TEST')
try {
  const accounts = await db.account.findMany({ take: 2, select: { id: true } })
  assert.equal(accounts.length, 2)
  await db.$transaction(async tx => {
    const [a,b] = accounts
    const customer = await tx.customer.create({ data: { accountId: a.id, visualId: 1999999999, name: 'Prueba fiscal', ...fiscalFields({ fiscalIdentification: 'AB-123/X', fiscalIdentificationCountry: 'US' }, customerFiscalFields) } })
    await tx.customer.update({ where: { id: customer.id }, data: { fiscalPreferredReceiptType: encodePreferredReceiptTypes(['E31', 'E32']) } })
    await tx.customer.update({ where: { id: customer.id }, data: { name: 'Actualizado', ...fiscalFields({}, customerFiscalFields) } })
    assert.deepEqual(parsePreferredReceiptTypes((await tx.customer.findUnique({ where: { id: customer.id } })).fiscalPreferredReceiptType), ['E31', 'E32'])
    assert.equal((await tx.customer.findUnique({ where: { id: customer.id } })).fiscalIdentification, 'AB-123/X')
    assert.equal(await tx.customer.count({ where: { id: customer.id, accountId: b.id } }), 0)
    const supplier = await tx.supplier.create({ data: { accountId: a.id, name: 'Prueba fiscal', fiscalIdentification: 'EX-123', fiscalDeclaredCondition: null } })
    assert.equal(supplier.fiscalDeclaredCondition, null)
    const product = await tx.product.create({ data: { accountId: a.id, productId: 1999999999, name: 'Prueba fiscal', priceCents: 100, costCents: 100, itbisRateBp: 0 } })
    assert.equal(product.fiscalTaxTreatment, null)
    await tx.product.update({ where: { id: product.id }, data: fiscalFields({ fiscalTaxTreatment: 'TASA_CERO' }, productFiscalFields) })
    assert.equal((await tx.product.findUnique({ where: { id: product.id } })).fiscalTaxTreatment, 'TASA_CERO')
    await tx.product.update({ where: { id: product.id }, data: fiscalFields({ fiscalTaxTreatment: 'EXENTO' }, productFiscalFields) })
    assert.equal((await tx.product.findUnique({ where: { id: product.id } })).fiscalTaxTreatment, 'EXENTO')
    const concept = await tx.fiscalConcept.create({ data: { accountId: a.id, name: 'Servicio de prueba', kind: 'SERVICIO' } })
    assert.equal(await tx.fiscalConcept.count({ where: { id: concept.id, accountId: b.id } }), 0)
    assert.throws(() => validateFiscalCatalogFields(fiscalFields({ fiscalTaxTreatment: 'otro' }, productFiscalFields)))
    throw rollback
  }).catch(e => { if (e !== rollback) throw e })
  console.log('Datos maestros: guardado, compatibilidad, tasa cero/exento y aislamiento aprobados (transacción revertida)')
} finally { await db.$disconnect() }
