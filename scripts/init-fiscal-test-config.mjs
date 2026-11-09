import fs from 'node:fs'
import dotenv from 'dotenv'
import { randomInt } from 'node:crypto'

const target = '.env.fiscal-test'
if (fs.existsSync(target)) throw new Error('La configuración ya existe; no se sobrescribe')
const existing = dotenv.parse(fs.readFileSync('.env'))
const url = new URL(existing.DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('La conexión existente no es local; configura la conexión de prueba manualmente')
if (!existing.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') || !existing.CLERK_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Se necesitan claves Clerk de desarrollo')
url.pathname = '/movopos_fiscal_test'; url.search = ''
const quote = value => JSON.stringify(value)
const lines = [
  `TEST_DATABASE_URL=${quote(url.toString())}`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${quote(existing.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)}`,
  `CLERK_SECRET_KEY=${quote(existing.CLERK_SECRET_KEY)}`,
  'FISCAL_TEST_CLERK_USER_A=',
  'FISCAL_TEST_CLERK_USER_B=',
  `FISCAL_TEST_PIN=${randomInt(100000, 1000000)}`,
]
fs.writeFileSync(target, `${lines.join('\n')}\n`, { flag: 'wx', mode: 0o600 })
console.log('Configuración local creada; faltan las dos identidades de Clerk de prueba')
