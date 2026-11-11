// Defensa adicional para procesos Node de pruebas: no sustituye un cortafuegos del sistema.
/* eslint-disable @typescript-eslint/no-require-imports -- NODE_OPTIONS --require carga este preload de forma síncrona como CommonJS. */
const net = require('node:net')
const originalConnect = net.Socket.prototype.connect
let tracedConnections = 0
net.Socket.prototype.connect = function (...args) {
  // net.connect normaliza sus argumentos dentro de un arreglo antes de llegar aquí.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0]
  const options = first && typeof first === 'object' ? first : null
  // Resolver localhost nosotros mismos impide que DNS o el archivo hosts lo redirijan.
  if (options && !options.lookup && (options.host || options.hostname) === 'localhost') {
    if (options.host) options.host = '127.0.0.1'
    else options.hostname = '127.0.0.1'
  }
  const host = options?.host || options?.hostname
  const port = Number(options?.port)
  if (process.env.FISCAL_TEST_TRACE_NODE === '1' && tracedConnections++ < 12) console.error(`Fiscal red: ${['127.0.0.1', '::1'].includes(host) ? 'local' : 'otra'}:${Number.isFinite(port) ? port : 'sin-puerto'}`)
  // No permitir sockets de archivo, DNS externo ni otros puertos aunque sean locales.
  // CDP escucha en un puerto efímero local que solo la prueba de navegador puede declarar después de arrancarlo.
  const devtoolsPort = Number(process.env.FISCAL_TEST_DEVTOOLS_PORT)
  if (!options || options.path || options.lookup || !['127.0.0.1', '::1'].includes(host) || !([3100, 55439].includes(port) || (Number.isInteger(devtoolsPort) && devtoolsPort > 0 && port === devtoolsPort))) {
    const error = new Error(`Conexión bloqueada por el entorno fiscal de prueba (${options?.path ? 'socket' : ['127.0.0.1', '::1'].includes(host) ? 'local' : 'externa'}:${Number.isFinite(port) ? port : 'sin-puerto'})`)
    error.code = 'FISCAL_TEST_NETWORK_BLOCKED'
    throw error
  }
  return originalConnect.apply(this, args)
}
