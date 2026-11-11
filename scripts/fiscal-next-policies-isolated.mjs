// Crea una base local nueva y ficticia; nunca modifica ni elimina la base fiscal existente.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const config = dotenv.parse(fs.readFileSync('.env.fiscal-test'))
const stage4Only = process.env.FISCAL_STAGE4_ONLY === '1' || process.argv.includes('--stage4')
const stage78Only = process.argv.includes('--stage78') || process.env.FISCAL_STAGE78_CHECKS === '1'
const stage6Only = process.env.FISCAL_STAGE6_ONLY === '1' || process.argv.includes('--stage6') || stage78Only
const source = new URL(config.TEST_DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(source.hostname) || source.port !== '55439' || source.pathname !== '/movopos_fiscal_test_2' || [...source.searchParams.keys()].some(k => k !== 'schema')) throw new Error('Instancia fiscal local no autorizada')
const identities = [config.FISCAL_TEST_CLERK_USER_A, config.FISCAL_TEST_CLERK_USER_B]
if (identities.some(id => !/^user_[a-zA-Z0-9]+$/.test(id || '')) || identities[0] === identities[1] || !config.FISCAL_TEST_PIN || config.FISCAL_TEST_ALLOW_LIVE_IDENTITY_LOOKUP !== 'true') throw new Error('Identidades de prueba no autorizadas')
const name = `cash_test_fiscal_next_${Date.now()}`
if (!/^cash_test_fiscal_next_\d+$/.test(name)) throw new Error('Nombre de prueba inválido')
const adminUrl = new URL(source); adminUrl.pathname = '/postgres'; adminUrl.search = ''
const testUrl = new URL(source); testUrl.pathname = `/${name}`
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
try {
  const exists = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname=${name}`
  if (exists.length) throw new Error('La base ya existe; nunca se reemplaza')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)
} finally { await admin.$disconnect() }

const setupEnv = { ...process.env, DATABASE_URL: testUrl.toString(), TEST_DATABASE_URL: testUrl.toString() }
const sensitive = /^(CLERK|NEXT_PUBLIC_CLERK|LEMON|RESEND|WHATSAPP|UPLOADTHING|OPENAI|SUPABASE|KAPSO|META|EXPO)/i
// No pasar credenciales de servicios a los procesos que solo preparan la base ficticia.
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) if (fs.existsSync(file)) for (const key of Object.keys(dotenv.parse(fs.readFileSync(file)))) if (sensitive.test(key)) setupEnv[key] = ''
for (const key of Object.keys(setupEnv)) if (sensitive.test(key)) setupEnv[key] = ''
const setup = spawnSync(process.execPath, ['scripts/setup-fiscal-baseline-db.mjs'], { env: setupEnv, stdio: 'inherit', windowsHide: true, ...((stage4Only || stage6Only) ? { timeout: 45000 } : {}) })
if (setup.error || setup.status !== 0) throw new Error('No se pudo preparar la base aislada')
if (stage6Only && setupEnv.FISCAL_TEST_MIGRATE_FULL !== '1') {
  // db push no instala triggers ni índices parciales: probar las migraciones reales en la base recién creada.
  const replaceIndex = sql => sql.replace(/CREATE UNIQUE INDEX "(Sale|Purchase|Return|OperatingExpense)_accountId_id_key"/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "$1_accountId_id_key"')
  // El fixture reconstruye el esquema de etapa 6: el código actual también lee estos orígenes posteriores.
  // Las columnas de compatibilidad solo permiten probar ventas; no acreditan las restricciones de esas migraciones.
  // La restricción histórica de cuatro orígenes rechaza las notas actuales; igualar el check vigente del esquema.
  const compatibility = 'ALTER TABLE "FiscalDocument" ADD COLUMN "adjustmentId" TEXT, ADD COLUMN "payableId" TEXT, ADD COLUMN "supplierPaymentId" TEXT;\nALTER TABLE "FiscalDocument" DROP CONSTRAINT "FiscalDocument_one_source";\nALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_one_source" CHECK (num_nonnulls("saleId", "purchaseId", "returnId", "expenseId", "adjustmentId", "payableId", "supplierPaymentId") = 1);\n'
  const sql = 'DROP TABLE "FiscalPreparationOperation", "FiscalDocumentRevision", "FiscalSequenceEvent", "FiscalNumberAllocation", "FiscalSequence", "FiscalDocumentLine", "FiscalDocumentReference", "FiscalDocumentEvent", "FiscalDocument" CASCADE;\n' + replaceIndex(fs.readFileSync('prisma/migrations/20261109170000_fiscal_document_core/migration.sql','utf8')) + '\n' + ['20261109180000_fiscal_sequences','20261110120000_fiscal_preparation','20261110130000_fiscal_sequence_rollover'].map(dir => fs.readFileSync(`prisma/migrations/${dir}/migration.sql`,'utf8')).join('\n') + '\n' + compatibility
  const applied = spawnSync(path.resolve('tmp/fiscal-postgres17/pgsql/bin/psql.exe'), ['-X','-1','-v','ON_ERROR_STOP=1','-h',source.hostname,'-p',source.port,'-U',decodeURIComponent(source.username),'-d',name], { input: sql, encoding:'utf8', windowsHide:true, timeout:45000, env:{...setupEnv, PGPASSWORD:decodeURIComponent(source.password), PGSSLMODE:'disable'} })
  if (applied.error || applied.status !== 0) throw new Error(`No se pudieron aplicar las migraciones fiscales: ${applied.error?.message || applied.stderr}`)
}
const db = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } })
try {
  const hash = await bcrypt.hash(config.FISCAL_TEST_PIN, 10)
  for (const [index, accountId] of ['baseline-account-rd', 'baseline-account-doprep'].entries()) {
    await db.account.update({ where: { id: accountId }, data: { clerkUserId: identities[index], engagementEmailsEnabled: false } })
    await db.user.updateMany({ where: { accountId, isOwner: true }, data: { username: 'dueno', passwordHash: hash } })
    await db.user.updateMany({ where: { accountId, isOwner: false }, data: { username: 'cajero', passwordHash: hash } })
  }
  // El perfil activo solo existe en el fixture de políticas; la etapa 4 usa dos perfiles apagados.
  if (stage6Only) {
    await db.fiscalSettings.create({ data: { accountId:'baseline-account-doprep', enabled:true, jurisdiction:'DO', regime:'DO_ECF', environment:'TEST', configurationStatus:'VALIDATED', legalName:'Emisor prueba', taxId:'123456789', fiscalAddress:'Dirección prueba', fiscalEmail:'prueba@example.test' } })
    await db.product.update({where:{id:'prod-doprep-item'},data:{name:'Producto prueba',fiscalItemType:'BIEN',fiscalUnit:'UNIDAD',fiscalTaxTreatment:'GRAVADO'}})
    await db.sale.create({ data: { id:'stage6-mobile-source', accountId:'baseline-account-doprep', userId:'user-doprep-owner', customerId:'cust-doprep-general', invoiceNumber:999998, invoiceCode:'STAGE6-MOBILE', soldAt:new Date('2026-11-10T12:00:00Z'), type:'CONTADO', paymentMethod:'EFECTIVO', subtotalCents:10000, itbisCents:1800, totalCents:11800, items:{create:{productId:'prod-doprep-item',qty:1,unitPriceCents:11800,costCents:7500,itbisRateBp:1800,lineTotalCents:11800}} } })
    await db.$executeRaw`INSERT INTO "FiscalSequence" (id,"accountId",type,"rangeStart","rangeEnd","lastNumber","expiresOn",active,"updatedAt") VALUES ('stage6-mobile-sequence','baseline-account-doprep','E31',1,100,0,'2099-12-31',true,now())`
    if (stage78Only) {
      await db.treasuryAccount.create({data:{id:'treasury-doprep-banco',accountId:'baseline-account-doprep',name:'Banco prueba',type:'BANCO',createdByUserId:'user-doprep-owner'}})
      await db.customer.create({data:{id:'cust-doprep-credit',accountId:'baseline-account-doprep',visualId:2,name:'Cliente crédito prueba',fiscalLegalName:'Cliente crédito prueba',fiscalIdentification:'101111111',fiscalIdentificationCountry:'DO',fiscalIdentificationType:'RNC',fiscalPreferredReceiptType:'E31',creditEnabled:true,creditDays:30}})
      await db.product.create({data:{id:'prod-doprep-service',accountId:'baseline-account-doprep',productId:2,name:'Servicio prueba',priceCents:15000,costCents:1000,itbisRateBp:1800,stock:20,isActive:true,isAvailableForSale:true,fiscalItemType:'SERVICIO',fiscalUnit:'UNIDAD',fiscalTaxTreatment:'GRAVADO'}})
      for (const type of ['E32','E33','E34','E44','E45','E46']) await db.$executeRaw`INSERT INTO "FiscalSequence" (id,"accountId",type,"rangeStart","rangeEnd","lastNumber","expiresOn",active,"updatedAt") VALUES (${`stage78-${type}`},'baseline-account-doprep',${type},1,100,0,${['E32','E34'].includes(type)?null:new Date('2099-12-31T00:00:00Z')},true,now())`
    }
  } else if (stage4Only) {
    for (const [index, accountId] of ['baseline-account-rd', 'baseline-account-doprep'].entries()) {
      await db.fiscalSettings.create({ data: { accountId, enabled: false, jurisdiction: 'DO', regime: 'DO_ECF', environment: 'TEST', legalName: `Emisor fiscal prueba ${index + 1}`, taxId: `12345678${index + 1}` } })
    }
    await db.sale.create({ data: { id: 'stage4-reference-sale', accountId: 'baseline-account-rd', userId: 'user-rd-owner', invoiceNumber: 999999, invoiceCode: 'TEST-FISCAL-REFERENCE', type: 'CONTADO', subtotalCents: 10000, itbisCents: 1800, totalCents: 11800 } })
    await db.fiscalDocument.create({ data: { id: 'stage4-reference-document', accountId: 'baseline-account-rd', saleId: 'stage4-reference-sale', type: 'E31', state: 'PREPARADO_PENDIENTE_CONEXION', policyVersion: 1, ruleVersion: 'fixture', snapshot: { issueDate: '2026-11-09', buyer: { identification: '101000001', country: 'DO' }, currency:{operation:'DOP'}, totals:{gross:'118.00'}, lines:[{description:'Artículo de prueba',kind:'BIEN',unit:'UNIDAD',quantity:'1',unitPrice:'118.00',taxTreatment:'GRAVADO_18',priceIncludesTax:true,gross:'118.00'}] } } })
  } else await db.fiscalSettings.create({ data: { accountId: 'baseline-account-doprep', enabled: true, jurisdiction: 'DO', regime: 'DO_ECF', environment: 'TEST' } })
} finally { await db.$disconnect() }

// La suite móvil ampliada compila también devoluciones; evitar cortar el proceso mientras conserva su límite interno.
const run = spawnSync(process.execPath, ['scripts/fiscal-clerk-temporary.mjs', '--next'], { env: { ...process.env, FISCAL_NEXT_ISOLATED_URL: testUrl.toString(), ...(stage4Only ? { FISCAL_STAGE4_ONLY:'1' } : {}), ...(stage6Only ? { FISCAL_STAGE6_ONLY:'1' } : {}), ...(stage78Only ? { FISCAL_STAGE78_CHECKS:'1' } : {}) }, stdio: 'inherit', windowsHide: true, ...((stage4Only || stage6Only) ? { timeout: 240000 } : {}) })
if (run.error || run.status !== 0) throw new Error('Falló la comprobación HTTP aislada')
console.log(`Comprobación terminada en base local aislada ${name}`)
