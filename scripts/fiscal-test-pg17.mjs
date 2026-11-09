import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'

const root = path.resolve('tmp/fiscal-postgres17')
const data = path.resolve('tmp/fiscal-postgres17-data')
const config = dotenv.parse(fs.readFileSync('.env.fiscal-pg17'))
if (config.FISCAL_PG17_PORT !== '55439' || !config.FISCAL_PG17_PASSWORD || !fs.existsSync(path.join(data, 'PG_VERSION'))) throw new Error('Instancia local de prueba no configurada')
if (fs.readFileSync(path.join(data, 'PG_VERSION'), 'utf8').trim() !== '17') throw new Error('El directorio no corresponde a PostgreSQL 17')
const command = process.argv[2]
let args
if (command === 'start') args = ['-D', data, '-l', path.resolve('tmp/fiscal-postgres17.log'), '-o', '-p 55439 -h 127.0.0.1', '-w', 'start']
else if (command === 'status') args = ['-D', data, 'status']
else if (command === 'stop') args = ['-D', data, '-m', 'fast', '-w', 'stop']
else throw new Error('Usa start, status o stop')
// pg_ctl recibe siempre el directorio concreto de la instancia aislada, no una ruta arbitraria.
const result = spawnSync(path.join(root, 'pgsql/bin/pg_ctl.exe'), args, { stdio: 'inherit', windowsHide: true })
if (result.error) throw result.error
if (result.status !== 0) process.exitCode = result.status ?? 1
