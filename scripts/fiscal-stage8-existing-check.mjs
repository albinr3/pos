import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

export async function runStage8ExistingChecks({sessions,clerk,dbUrl}) {
  const headers=await Promise.all(sessions.map(async s=>({'X-Clerk-Authorization':`Bearer ${(await clerk.sessions.getToken(s.sessionId)).jwt}`,'X-SubUser-Token':s.token,'Content-Type':'application/json'})))
  const actor=sessions[1],db=new PrismaClient({datasources:{db:{url:dbUrl}}})
  const request=async(path,method='GET',body,expected=200,credentials=headers[1])=>{
    const response=await fetch(`http://localhost:3100${path}`,{method,headers:credentials,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)})
    const result=await response.json().catch(()=>({}));assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(result)}`);return result
  }
  try {
    const {policy}=await request('/api/fiscal/capabilities'),version=policy.version
    const cash=()=>({accountId:actor.accountId,userId:actor.userId,clientOperationId:`existing-${randomBytes(10).toString('hex')}`,cashShiftId:null,clientSequence:null,fiscalPolicyVersion:version})
    async function ordinary(productId,price,customerId=null){
      const payload={customerId,type:'CONTADO',paymentMethod:'EFECTIVO',treasuryAccountId:'treasury-doprep-caja',items:[{productId,qty:1,unitPriceCents:price,wasPriceOverridden:false}],applyLegalTip:false,salePricesIncludeItbis:true,soldAt:'2026-11-10T12:00:00Z',fiscal:null}
      return (await request('/api/cash-shifts/operations','POST',{kind:'sale',payload,cashOperation:cash()})).result
    }
    const definitions=[
      {type:'E44',product:'prod-stage8-exento',price:10000,command:{buyer:{name:'Comprador especial',identification:'101000001',country:'DO'},special:{regime:'Régimen prueba',exemptionReference:'Soporte prueba'}}},
      {type:'E45',product:'prod-doprep-item',price:15000,customer:'cust-doprep-credit',command:{special:{governmentEntity:true,purchaseOrder:'OC-8'}}},
      {type:'E46',product:'prod-stage8-exento',price:10000,command:{buyer:{name:'Importador',identification:'PASS-8',country:'US'},special:{exportMode:'EXPORTACION',destinationCountry:'US'}}},
    ]
    for (const entry of definitions) {
      const sale=await ordinary(entry.product,entry.price,entry.customer), beforeStock=Number((await db.product.findUniqueOrThrow({where:{id:entry.product}})).stock), beforeCount=await db.sale.count({where:{accountId:actor.accountId}})
      const command={type:entry.type,expectedPolicyVersion:version,...entry.command},path=`/api/fiscal/sales/${sale.id}`
      await request(`${path}/preview`,'POST',{...command,special:{}},422)
      await request(`${path}/preview`,'POST',{...command,currency:'USD'},422)
      let preview=await request(`${path}/preview`,'POST',command)
      assert.equal(preview.totals.gross,(entry.price/100).toFixed(2));assert.match(preview.sourceFingerprint,/^[a-f0-9]{64}$/)
      if(entry.type==='E44'){
        // Una ficha cambiada con el mismo total exige otra revisión antes de preparar.
        await db.product.update({where:{id:entry.product},data:{name:'Bien exento revisado'}})
        await request(`${path}/prepare`,'POST',{operationId:'stage8-stale-source',expectedSourceFingerprint:preview.sourceFingerprint,fiscal:command},409)
        preview=await request(`${path}/preview`,'POST',command)
      }
      const commandWithTotal={...command,expectedTotalCents:entry.price},body={operationId:`existing-${randomBytes(10).toString('hex')}`,expectedSourceFingerprint:preview.sourceFingerprint,fiscal:commandWithTotal}
      const prepared=await request(`${path}/prepare`,'POST',body),repeated=await request(`${path}/prepare`,'POST',body)
      assert.equal(prepared.id,repeated.id);assert.match(prepared.eNcf,new RegExp(`^${entry.type}`))
      assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:entry.product}})).stock),beforeStock)
      assert.equal(await db.sale.count({where:{accountId:actor.accountId}}),beforeCount)
      assert.equal(await db.fiscalDocument.count({where:{accountId:actor.accountId,saleId:sale.id}}),1)
      const detail=await request(`/api/fiscal/documents/${prepared.id}`);assert.equal(detail.snapshot.totals.gross,preview.totals.gross)
    }
    const service=await ordinary('prod-doprep-service',15000)
    await request(`/api/fiscal/sales/${service.id}/preview`,'POST',{type:'E46',expectedPolicyVersion:version,special:{exportMode:'EXPORTACION',destinationCountry:'US'}},422)
    // El contrato ordinario de la otra empresa sigue sin requerir bloque fiscal.
    const regular={kind:'sale',payload:{customerId:null,type:'CONTADO',paymentMethod:'EFECTIVO',treasuryAccountId:'treasury-rd-caja',items:[{productId:'prod-rd-gravado',qty:1,unitPriceCents:10000,wasPriceOverridden:false}]},cashOperation:{accountId:sessions[0].accountId,userId:sessions[0].userId,clientOperationId:`stage8-off-${randomBytes(10).toString('hex')}`,cashShiftId:null,clientSequence:null,fiscalPolicyVersion:0}}
    const off=await request('/api/cash-shifts/operations','POST',regular,200,headers[0]);assert.ok(off.result.id);assert.equal('fiscal' in off.result,false)
    console.log('Etapa 8: venta existente E44/E45/E46, datos incompletos, incompatibilidades, cambio de ficha, reintento y módulo apagado comprobados')
  } finally {await db.$disconnect()}
}
