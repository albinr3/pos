// Solo acepta la base efímera creada por fiscal-next-policies-isolated.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

const name=process.argv[2]
if(!/^cash_test_fiscal_next_\d+$/.test(name||'')) throw new Error('Indica la base fiscal aislada')
const config=dotenv.parse(fs.readFileSync('.env.fiscal-test')),url=new URL(config.TEST_DATABASE_URL)
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='55439'||url.pathname!=='/movopos_fiscal_test_2')throw new Error('Servidor local no autorizado')
url.pathname=`/${name}`
const db=new PrismaClient({datasources:{db:{url:url.toString()}}})
try {
  const settings=await db.fiscalSettings.findUnique({where:{accountId:'baseline-account-doprep'}})
  if(!settings?.enabled||settings.regime!=='DO_ECF'||settings.environment!=='TEST'||settings.configurationStatus!=='VALIDATED')throw new Error('La base no tiene el perfil de prueba activo')
  // Los reintentos reutilizan la ficha aislada sin borrar ventas ni inventario previos.
  await db.product.upsert({where:{id:'prod-stage8-exento'},update:{name:'Bien exento prueba'},create:{id:'prod-stage8-exento',accountId:'baseline-account-doprep',productId:9002,name:'Bien exento prueba',priceCents:10000,costCents:3000,itbisRateBp:0,stock:10,isActive:true,isAvailableForSale:true,fiscalItemType:'BIEN',fiscalUnit:'UNIDAD',fiscalTaxTreatment:'EXENTO'}})
} finally {await db.$disconnect()}
const result=spawnSync(process.execPath,['scripts/fiscal-clerk-temporary.mjs','--next'],{env:{...process.env,FISCAL_NEXT_ISOLATED_URL:url.toString(),FISCAL_STAGE6_ONLY:'1',FISCAL_STAGE8_REUSE_ONLY:'1'},stdio:'inherit',windowsHide:true,timeout:90000})
if(result.error||result.status!==0)throw new Error(`La comprobación no terminó correctamente: ${result.error?.message||result.status}`)
