// Reutiliza solo una base de prueba aislada ya creada por fiscal-next-policies-isolated.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

const name=process.argv[2]
if(!/^cash_test_fiscal_next_\d+$/.test(name||'')) throw new Error('Indica la base aislada creada por la prueba fiscal')
const config=dotenv.parse(fs.readFileSync('.env.fiscal-test'))
const url=new URL(config.TEST_DATABASE_URL)
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='55439'||url.pathname!=='/movopos_fiscal_test_2') throw new Error('Servidor local de prueba no autorizado')
url.pathname=`/${name}`
const db=new PrismaClient({datasources:{db:{url:url.toString()}}})
try {
  const settings=await db.fiscalSettings.findUnique({where:{accountId:'baseline-account-doprep'}})
  const sequence=await db.fiscalSequence.findFirst({where:{accountId:'baseline-account-doprep',type:'E32',active:true}})
  if(!settings || settings.enabled || settings.jurisdiction!=='DO' || settings.regime!=='DO_ECF' || settings.environment!=='TEST' || settings.configurationStatus!=='VALIDATED' || !sequence || sequence.lastNumber>=sequence.rangeEnd) throw new Error('La base aislada no tiene la configuración de la prueba anterior')
  // La política cambia de versión para que ningún pendiente anterior se reasigne al reactivar.
  await db.fiscalSettings.update({where:{accountId:'baseline-account-doprep'},data:{enabled:true,version:{increment:1},effectiveFrom:new Date()}})
} finally { await db.$disconnect() }
const result=spawnSync(process.execPath,['scripts/fiscal-clerk-temporary.mjs','--next'],{env:{...process.env,FISCAL_NEXT_ISOLATED_URL:url.toString(),FISCAL_STAGE6_ONLY:'1',FISCAL_STAGE78_OFFLINE_ONLY:'1'},stdio:'inherit',windowsHide:true,timeout:75000})
if(result.error||result.status!==0) throw new Error(`La comprobación offline no terminó correctamente: ${result.error?.message||result.status}`)
