const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Define TEST_DATABASE_URL para la base aislada de pruebas.');
const parsed = new URL(url);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/movopos_registration_test')
  throw new Error('Solo se permite la base local movopos_registration_test.');
const db = new PrismaClient({ datasources: { db: { url } } });
const root = process.env.REGISTRATION_TEST_ROOT || path.resolve(__dirname, '..');
const modules = new Map();
let notifications = 0, audits = 0;
let failAccountLookup = false;
function load(name, from = path.join(root, 'src/test.ts')) {
  if (name === '@/lib/db') return { prisma: db };
  if (name === '@/lib/super-admin-notifications') return { notifyNewAccountRegistered: async () => { notifications++; } };
  if (name === '@/lib/audit-log') return { logAuditEvent: async () => { audits++; } };
  if (name === '@/lib/meta/server') return {};
  if (name === '@/lib/account-owner-email') return {};
  if (name === '@/lib/auth') return {
    getClerkUserId: async () => 'web-user',
    getOrCreateAccount: async clerkUserId => failAccountLookup ? null : db.account.findUnique({ where: { clerkUserId } }),
    listSubUsers: async accountId => db.user.findMany({ where: { accountId, isActive: true } }),
    createSubUserSession: async () => 'fixture-session-token',
    authenticateSubUser: async (accountId, username, password) => {
      const user = await db.user.findUnique({ where: { accountId_username: { accountId, username } } });
      return user && await require('bcryptjs').compare(password, user.passwordHash) ? { success: true, user } : { success: false };
    },
  };
  if (name === '@clerk/nextjs/server') return { verifyToken: require('@clerk/backend').verifyToken,
    clerkClient: async () => ({ users: { getUser: async id => ({ id, emailAddresses: [{ id: 'email', emailAddress: 'test@example.test' }], primaryEmailAddressId: 'email' }) } }),
  };
  if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
  const file = name.startsWith('@/') ? path.join(root, 'src', name.slice(2) + '.ts') : path.resolve(path.dirname(from), name + '.ts');
  if (modules.has(file)) return modules.get(file);
  const exports = {}; modules.set(file, exports);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { exports, require: n => load(n, file), console, Date, Map, Set, Buffer, process, globalThis: {}, setTimeout, clearTimeout }, { filename: file });
  return exports;
}
async function main() {
  const { setupInitialAccount } = load('@/lib/initial-account-setup');
  const guard = load('@/lib/account-deletion-guard');
  const identity = 'test_' + randomUUID();
  const account = await db.account.create({ data: { name: 'Prueba', clerkUserId: identity } });
  const input = { clerkUserId: identity, account, businessName: 'Negocio', whatsappPhone: '8095550123', email: 'test@example.test' };
  const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => setupInitialAccount(input)));
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.ok(outcomes.filter(x => x.status === 'rejected').every(x => x.reason.code === 'configured'));
  assert.equal(await db.user.count({ where: { accountId: account.id } }), 1);
  assert.equal(await db.product.count({ where: { accountId: account.id } }), 3);
  assert.equal(await db.billingSubscription.count({ where: { accountId: account.id } }), 1);
  assert.equal(notifications, 1); assert.equal(audits, 1);
  const owner = await db.user.findFirstOrThrow({ where: { accountId: account.id } });
  assert.equal(owner.username, 'admin'); assert.equal(owner.hasTemporaryPin, true);
  assert.equal(await require('bcryptjs').compare('1234', owner.passwordHash), true);
  assert.equal((await db.accountOnboarding.findUniqueOrThrow({ where: { accountId: account.id } })).initialSetupCompletedAt !== null, true);
  const inactiveIdentity = 'test_' + randomUUID();
  const inactive = await db.account.create({ data: { name: 'Inactiva', clerkUserId: inactiveIdentity } });
  await db.user.create({ data: { accountId: inactive.id, username: 'old', name: 'Inactivo', passwordHash: 'x', isActive: false } });
  await assert.rejects(setupInitialAccount({ ...input, clerkUserId: inactiveIdentity, account: inactive }), e => e.code === 'configured');
  const deletedIdentity = 'test_' + randomUUID();
  const deleted = await db.account.create({ data: { name: 'Eliminada', clerkUserId: deletedIdentity } });
  await db.accountDeletion.create({ data: { accountId: deleted.id, clerkUserHash: guard.accountIdentityHash(deletedIdentity) } });
  await assert.rejects(setupInitialAccount({ ...input, clerkUserId: deletedIdentity, account: deleted }), e => e.code === 'deleted');
  await assert.rejects(setupInitialAccount({ ...input, clerkUserId: deletedIdentity }), e => e.code === 'deleted');
  await assert.rejects(setupInitialAccount({ ...input, clerkUserId: 'different_identity' }), e => e.code === 'deleted');
  assert.equal(notifications, 1); assert.equal(audits, 1);
  const { generateKeyPairSync } = require('node:crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.CLERK_JWT_KEY = publicKey.export({ type: 'spki', format: 'pem' });
  process.env.CLERK_SECRET_KEY = 'sk_test_fixture';
  const jwt = require('jsonwebtoken');
  const { requestClerkUserId } = load('@/lib/mobile-clerk-auth');
  const request = token => ({ headers: new Headers(token ? { 'X-Clerk-Authorization': `Bearer ${token}` } : {}) });
  const token = jwt.sign({ sub: 'clerk-user', sid: 'session' }, privateKey, { algorithm: 'RS256', expiresIn: '1m' });
  assert.equal(await requestClerkUserId(request(token)), 'clerk-user');
  const invalid = jwt.sign({ sub: 'victim', sid: 'session' }, 'incorrect-key', { algorithm: 'HS256', expiresIn: '1m' });
  assert.equal(await requestClerkUserId(request(invalid)), null);
  const expired = jwt.sign({ sub: 'clerk-user', sid: 'session' }, privateKey, { algorithm: 'RS256', expiresIn: '-1s' });
  assert.equal(await requestClerkUserId(request(expired)), null);
  const noSession = jwt.sign({ sub: 'clerk-user' }, privateKey, { algorithm: 'RS256', expiresIn: '1m' });
  assert.equal(await requestClerkUserId(request(noSession)), null);
  assert.equal(await requestClerkUserId(request(null)), 'web-user');
  assert.equal(await requestClerkUserId({ headers: new Headers({ 'X-Clerk-Authorization': '' }) }), null);
  assert.equal(await requestClerkUserId({ headers: new Headers({ Authorization: '' }) }), null);
  const setupRoute = load('@/app/api/auth/setup/route');
  const usersRoute = load('@/app/api/auth/subusers/route');
  const loginRoute = load('@/app/api/auth/subuser/login/route');
  const routeIdentity = 'test_' + randomUUID();
  const routeAccount = await db.account.create({ data: { clerkUserId: routeIdentity, name: 'API' } });
  const routeToken = jwt.sign({ sub: routeIdentity, sid: 'session' }, privateKey, { algorithm: 'RS256', expiresIn: '1m' });
  const http = (body, auth = routeToken) => ({ ...request(auth), json: async () => body });
  for (const route of [setupRoute, usersRoute, loginRoute]) {
    const preflight = await route.OPTIONS();
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
  }
  assert.equal((await setupRoute.POST(http({}, invalid))).status, 401);
  assert.equal((await setupRoute.POST(http({ businessName: ' ' }))).status, 400);
  let profiles = await (await usersRoute.GET(http())).json();
  assert.equal(profiles.needsInitialSetup, true);
  const response = await setupRoute.POST(http({ businessName: 'Negocio API', whatsappPhone: '8095550123', accountId: inactive.id }));
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.user.accountId, routeAccount.id); assert.equal(payload.user.passwordHash, undefined);
  const login = await (await loginRoute.POST(http({ username: 'admin', password: '1234' }))).json();
  assert.deepEqual(Object.keys(payload.user).sort(), Object.keys(login.user).sort());
  const afterCreateNotifications = notifications;
  assert.equal((await setupRoute.POST(http({ businessName: 'Reintento', whatsappPhone: '8095550123' }))).status, 409);
  assert.equal(notifications, afterCreateNotifications);
  profiles = await (await usersRoute.GET(http())).json(); assert.equal(profiles.needsInitialSetup, false);
  const inactiveToken = jwt.sign({ sub: inactiveIdentity, sid: 'session' }, privateKey, { algorithm: 'RS256', expiresIn: '1m' });
  profiles = await (await usersRoute.GET(http(null, inactiveToken))).json();
  assert.equal(profiles.needsInitialSetup, false); assert.equal(profiles.users.length, 0);
  const deletedToken = jwt.sign({ sub: deletedIdentity, sid: 'session' }, privateKey, { algorithm: 'RS256', expiresIn: '1m' });
  assert.equal((await setupRoute.POST(http({ businessName: 'Prohibido', whatsappPhone: '8095550123' }, deletedToken))).status, 410);
  failAccountLookup = true;
  assert.equal((await usersRoute.GET(http())).status, 500);
  assert.equal((await setupRoute.POST(http({ businessName: 'API', whatsappPhone: '8095550123' }))).status, 500);
  console.log('OK: concurrencia, tokens y rutas HTTP 201/400/401/409/410/500; contratos, CORS, inactivos y aislamiento.');
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
