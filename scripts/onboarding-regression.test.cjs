// Sin base de datos externa: ejercita el servicio compartido y los handlers HTTP reales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function fixture({ completed = false, actor = { accountId: 'A', isOwner: true } } = {}) {
  let row = { accountId: 'A', completedAt: completed ? new Date('2026-11-06T12:00:00Z') : null, demoProductsSeededAt: new Date(), demoCheckoutCompletedAt: null, mobileAutoStartEligible: true };
  const products = [
    { id: 'real', accountId: 'A', isActive: true, isAvailableForSale: true, isOnboardingDemo: false, name: 'Real', costCents: 100, priceCents: 200 },
    { id: 'demo', accountId: 'A', isActive: true, isAvailableForSale: true, isOnboardingDemo: true, name: 'Demo', history: ['sale-1'] },
    { id: 'foreign', accountId: 'B', isActive: true, isAvailableForSale: true, isOnboardingDemo: false },
  ];
  let conditionalWrites = 0;
  const matches = (p, where) => Object.entries(where).every(([key, value]) => value && typeof value === 'object' && 'gt' in value ? p[key] > value.gt : p[key] === value);
  const db = {
    $queryRaw: async () => [],
    accountOnboarding: {
      findUnique: async () => ({ ...row }), findUniqueOrThrow: async () => ({ ...row }),
      upsert: async ({ update }) => { row = { ...row, ...update }; return { ...row }; },
      updateMany: async ({ where, data }) => { if (matches(row, where)) { row = { ...row, ...data }; conditionalWrites++; return { count: 1 }; } return { count: 0 }; },
    },
    product: {
      findFirst: async ({ where }) => products.find(p => matches(p, where)) ?? null,
      count: async ({ where }) => products.filter(p => matches(p, where)).length,
      updateMany: async ({ where, data }) => { products.filter(p => matches(p, where)).forEach(p => Object.assign(p, data)); },
    },
    sale: { findFirst: async () => null, count: async () => 0 },
    $transaction: async callback => callback(db),
  };
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, Date, console, require: name => {
      if (name === '@/lib/db') return { prisma: db };
      if (name === '@/lib/account-onboarding') return load('src/lib/account-onboarding.ts');
      if (name.endsWith('/_helpers/auth')) return { getCurrentUserFromRequest: async () => actor };
      if (name === 'next/cache') return { revalidatePath() {} };
      if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } };
      throw Error('Dependencia inesperada '+name);
    } }, { filename: file });
    return exports;
  }
  return { load, products, get row() { return row; }, get writes() { return conditionalWrites; } };
}
test('Completar desde móvil hace que la fase web sea COMPLETED sin practicar en web', async () => {
  const f = fixture(), service = f.load('src/lib/account-onboarding.ts');
  await service.completeAccountOnboarding('A', 'real');
  const state = await service.getAccountOnboardingStateForAccount('A');
  assert.equal(state.phase, 'COMPLETED'); assert.equal(state.demoCheckoutCompletedAt, null);
});
test('El estado móvil reconoce una finalización web y devuelve la elegibilidad del alta', async () => {
  const f = fixture({ completed: true });
  const state = await f.load('src/lib/account-onboarding.ts').getMobileOnboardingState('A');
  assert.equal(state.completedAt, '2026-11-06T12:00:00.000Z'); assert.equal(state.mobileAutoStartEligible, true);
  assert.equal(state.completionProductId, 'real'); assert.equal(f.writes, 0);
});
test('Finalizaciones concurrentes conservan el primer timestamp y no borran historial', async () => {
  const f = fixture(), service = f.load('src/lib/account-onboarding.ts');
  const results = await Promise.all([service.completeAccountOnboarding('A', 'real'), service.completeAccountOnboarding('A', 'real')]);
  assert.equal(results[0].completedAt, results[1].completedAt); assert.equal(f.writes, 1);
  const demo = f.products.find(p => p.id === 'demo');
  assert.equal(demo.isActive, false); assert.equal(demo.isAvailableForSale, false); assert.deepEqual(demo.history, ['sale-1']);
});
test('Un producto demo o de otra cuenta no puede completar el tutorial', async () => {
  for (const id of ['demo', 'foreign', 'missing']) {
    const f = fixture(), service = f.load('src/lib/account-onboarding.ts');
    await assert.rejects(() => service.completeAccountOnboarding('A', id), /producto real/);
    assert.equal(f.row.completedAt, null);
  }
});
test('El endpoint exige sesión, propietario y productId válido', async () => {
  const request = body => ({ json: async () => body });
  assert.equal((await fixture({ actor: null }).load('src/app/api/onboarding/complete/route.ts').POST(request({ productId: 'real' }))).status, 401);
  assert.equal((await fixture({ actor: { accountId: 'A', isOwner: false } }).load('src/app/api/onboarding/complete/route.ts').POST(request({ productId: 'real' }))).status, 403);
  assert.equal((await fixture().load('src/app/api/onboarding/complete/route.ts').POST(request({ productId: 12 }))).status, 400);
  const invalid = await fixture().load('src/app/api/onboarding/complete/route.ts').POST(request({ productId: 'foreign' }));
  assert.equal(invalid.status, 422); assert.equal(invalid.body.code, 'ONBOARDING_PRODUCT_INVALID');
  assert.equal((await fixture().load('src/app/api/onboarding/complete/route.ts').POST(request({ productId: 'real' }))).status, 200);
});
