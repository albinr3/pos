import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as permissions from '../src/lib/permissions.ts'

const fiscalKeys = permissions.PERMISSION_MODULES.find(module => module.id === 'fiscal').permissions
const source = fs.readFileSync(new URL('../src/app/(app)/settings/users-actions.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

for (const enabled of [false, true]) {
  test(`permisos fiscales ${enabled ? 'visibles y actualizados' : 'ocultos y conservados'} en acciones masivas`, async () => {
    assert.equal(permissions.getVisiblePermissionModules(enabled).some(module => module.id === 'fiscal'), enabled)
    for (const key of fiscalKeys) assert.equal(permissions.getVisiblePermissionKeys(enabled).includes(key), enabled)
    let changed
    const exports = {}
    const currentUser = { id: 'owner', accountId: 'account', isOwner: true }
    vm.runInNewContext(compiled, { exports, require(name) {
      if (name === '@/lib/permissions') return permissions
      if (name === '@/lib/auth') return { getCurrentUser: async () => currentUser }
      if (name === '@/lib/db') return { prisma: { fiscalSettings: { findUnique: async ({ where }) => { assert.equal(where.accountId, 'account'); return { enabled } } }, user: { findUnique: async () => ({ id: 'target', accountId: 'account' }), update: async ({ data }) => { changed = data } } } }
      if (name === '@/lib/permission-guard') return { ensurePermission: async () => {}, logUnauthorizedAccess: async () => {} }
      if (name === '@/lib/audit-log') return { logAuditEvent: async () => {} }
      if (name === 'next/cache') return { revalidatePath: () => {} }
      if (name === 'bcryptjs') return {}
      if (name === '@/lib/resend' || name === '@/lib/resend/templates' || name === '@/lib/sanitize') return {}
      throw Error(`Dependencia inesperada: ${name}`)
    } })
    for (const value of [true, false]) {
      await exports.setAllUserPermissions('target', value)
      assert.equal(changed.canAccessSales, value)
      for (const key of fiscalKeys) assert.equal(Object.hasOwn(changed, key), enabled)
      if (enabled) for (const key of fiscalKeys) assert.equal(changed[key], value)
    }
  })
}
