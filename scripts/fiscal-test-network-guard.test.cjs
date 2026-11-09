/* eslint-disable @typescript-eslint/no-require-imports -- Comprueba el mismo entorno CommonJS del preload de red. */
const assert = require('node:assert/strict')
const net = require('node:net')
const http = require('node:http')
const tls = require('node:tls')

// Comprobar varias rutas de salida antes de confiar en la defensa adicional.
for (const attempt of [
  () => net.connect({ host: '1.1.1.1', port: 443 }),
  () => net.connect({ host: '127.0.0.1', port: 80 }),
  () => net.connect({ path: '\\\\.\\pipe\\otra-aplicacion' }),
  () => net.connect({ host: 'localhost', port: 55439, lookup() {} }),
  () => net.connect({ host: '127.0.0.1', port: 55439, lookup() {} }),
  () => http.get('http://example.com/'),
  () => tls.connect({ host: 'example.com', port: 443 }),
]) assert.throws(attempt, { code: 'FISCAL_TEST_NETWORK_BLOCKED' })

;(async () => {
  await assert.rejects(fetch('https://example.com/'), error => error.cause?.code === 'FISCAL_TEST_NETWORK_BLOCKED')
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: 55439 })
    socket.once('connect', () => { socket.destroy(); resolve() })
    socket.once('error', reject)
  })
  console.log('Guardia Node: salidas no autorizadas bloqueadas; PostgreSQL local accesible')
})().catch(() => { console.error('Falló la comprobación de red'); process.exitCode = 1 })
