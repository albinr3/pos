import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

export async function runStage6Checks({sessions,clerk,dbUrl}) {
  const credentials=await Promise.all(sessions.map(async session=>({
    'X-Clerk-Authorization':`Bearer ${(await clerk.sessions.getToken(session.sessionId)).jwt}`,
    'X-SubUser-Token':session.token,'Content-Type':'application/json'
  })))
  const read=new PrismaClient({datasources:{db:{url:dbUrl}}})
  const req=(route,headers,method='GET',body)=>fetch(`http://localhost:3100${route}`,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)})
  try {
    const originalFiscalSales=await read.sale.count({where:{accountId:sessions[1].accountId}})
    const originalFiscalStock=await read.product.findUniqueOrThrow({where:{id:'prod-doprep-item'},select:{stock:true}})
    const noSession=await req('/api/fiscal/documents',{});assert.equal(noSession.status,401)
    const fiscalInput={type:'E31',issueDate:'2026-11-10',expectedPolicyVersion:1,issuer:{id:'baseline-account-doprep',name:'Emisor prueba',identification:'123456789',country:'DO'},buyer:{name:'Cliente prueba',identification:'101000001',country:'DO'},source:{kind:'SALE',id:'stage6-mobile-source'},incomeType:'01',payment:{type:'CONTADO'},currency:{operation:'DOP',reporting:'DOP'},lines:[{productId:'prod-doprep-item',description:'Producto prueba',kind:'BIEN',unit:'UNIDAD',quantity:'1',unitPrice:'118',taxTreatment:'GRAVADO_18',priceIncludesTax:true}]}
    const command={operationId:'mobile-stage6-create-01',document:fiscalInput}
    const created=await req('/api/fiscal/documents',credentials[1],'POST',command);assert.equal(created.status,201,`Crear borrador: HTTP ${created.status}`);const doc=await created.json();assert.equal(doc.revision,1)
    const repeated=await req('/api/fiscal/documents',credentials[1],'POST',command);assert.equal(repeated.status,201);assert.equal((await repeated.json()).id,doc.id)
    const conflict=await req('/api/fiscal/documents',credentials[1],'POST',{...command,document:{...fiscalInput,issueDate:'2026-11-11'}});assert.equal(conflict.status,409);assert.equal((await conflict.json()).error.code,'OPERATION_CONFLICT')
    const foreign=await req(`/api/fiscal/documents/${doc.id}`,credentials[0]);assert.equal(foreign.status,404)
    const update=await req(`/api/fiscal/documents/${doc.id}`,credentials[1],'PUT',{operationId:'mobile-stage6-update-01',expectedRevision:1,document:fiscalInput});assert.equal(update.status,200);assert.equal((await update.json()).revision,2)
    const preparation={operationId:'mobile-stage6-prepare-01',expectedRevision:2}
    const prepared=await req(`/api/fiscal/documents/${doc.id}/prepare`,credentials[1],'POST',preparation);assert.equal(prepared.status,200,`Preparación: HTTP ${prepared.status}`);const result=await prepared.json();assert.equal(result.state,'PREPARADO_PENDIENTE_CONEXION');assert.equal(result.eNcf,'E310000000001')
    const retry=await req(`/api/fiscal/documents/${doc.id}/prepare`,credentials[1],'POST',preparation);assert.equal(retry.status,200);assert.deepEqual(await retry.json(),result)
    const recovered=await req(`/api/fiscal/operations/${preparation.operationId}`,credentials[1]);assert.equal(recovered.status,200);assert.equal((await recovered.json()).result.eNcf,result.eNcf)
    const listed=await req('/api/fiscal/documents?source=SALE&type=E31',credentials[1]);assert.equal(listed.status,200);assert.equal((await listed.json()).data.length,1)
    const detail=await req(`/api/fiscal/documents/${doc.id}`,credentials[1]);assert.equal(detail.status,200);const document=await detail.json();assert.equal(document.revisions.length,2);assert.equal(document.allocation.eNcf,result.eNcf)
    const history=await req(`/api/fiscal/documents/${doc.id}/history`,credentials[1]);assert.equal(history.status,200);assert.ok((await history.json()).data.length>=4)
    assert.equal(Number((await read.$queryRaw`SELECT count(*) AS n FROM "FiscalNumberAllocation" WHERE "accountId"=${sessions[1].accountId} AND "documentId"=${doc.id}`)[0].n),1)
    assert.equal(await read.sale.count({where:{accountId:sessions[1].accountId}}),originalFiscalSales)
    assert.equal(Number((await read.product.findUniqueOrThrow({where:{id:'prod-doprep-item'},select:{stock:true}})).stock),Number(originalFiscalStock.stock))
    if (process.env.FISCAL_STAGE78_CHECKS === '1') {
      const { runStage78Checks } = await import('./fiscal-stage78-real-check.mjs')
      await runStage78Checks({ sessions, credentials, read, req })
    }
    const settingsResponse=await req('/api/fiscal/settings',credentials[1]);assert.equal(settingsResponse.status,200)
    const settings=await settingsResponse.json()
    const disabled=await req('/api/fiscal/settings',credentials[1],'PUT',{expectedVersion:settings.version,jurisdiction:'DO',regime:'DO_ECF',environment:'TEST',enabled:false,legalName:'Emisor prueba',taxId:'123456789',fiscalAddress:'Dirección prueba',fiscalEmail:'prueba@example.test',fiscalPhone:null})
    assert.equal(disabled.status,200,'No se pudo desactivar el perfil de prueba');assert.equal((await disabled.json()).enabled,false)
    const disabledDetail=await req(`/api/fiscal/documents/${doc.id}`,credentials[1]);assert.equal(disabledDetail.status,200);assert.equal((await disabledDetail.json()).state,'PREPARADO_PENDIENTE_CONEXION')
    const disabledRecovery=await req(`/api/fiscal/operations/${preparation.operationId}`,credentials[1]);assert.equal(disabledRecovery.status,200);assert.equal((await disabledRecovery.json()).status,'COMPLETED')
    console.log('Etapa 6: creación, revisión, confirmación, reintento, recuperación, consulta y aislamiento móviles comprobados')
    const stock=await read.product.findUniqueOrThrow({where:{id:'prod-rd-gravado'},select:{stock:true}})
    const countBefore=await read.sale.count({where:{accountId:sessions[0].accountId}})
    const saleId=`stage6-sale-${randomBytes(12).toString('hex')}`
    const saleCommand={kind:'sale',payload:{customerId:null,type:'CONTADO',paymentMethod:'EFECTIVO',treasuryAccountId:'treasury-rd-caja',items:[{productId:'prod-rd-gravado',qty:1,unitPriceCents:10000,wasPriceOverridden:false}]},cashOperation:{accountId:sessions[0].accountId,userId:sessions[0].userId,clientOperationId:saleId,cashShiftId:null,clientSequence:null,fiscalPolicyVersion:0}}
    const first=await req('/api/cash-shifts/operations',credentials[0],'POST',saleCommand);assert.equal(first.status,200,`Venta: HTTP ${first.status}`);const sale=(await first.json()).result
    const again=await req('/api/cash-shifts/operations',credentials[0],'POST',saleCommand);assert.equal(again.status,200);assert.equal((await again.json()).result.id,sale.id)
    const saleDetail=await req(`/api/sales/${sale.id}`,credentials[0]);assert.equal(saleDetail.status,200);const saleData=await saleDetail.json();assert.equal(saleData.totalCents,10000);assert.equal(saleData.subtotalCents,8475);assert.equal(saleData.itbisCents,1525);assert.equal(saleData.paymentMethod,'EFECTIVO');assert.equal(saleData.treasuryAccountId,'treasury-rd-caja')
    assert.equal(await read.sale.count({where:{accountId:sessions[0].accountId}}),countBefore+1)
    assert.equal(Number((await read.product.findUniqueOrThrow({where:{id:'prod-rd-gravado'},select:{stock:true}})).stock),Number(stock.stock)-1)
    assert.equal(await read.fiscalDocument.count({where:{accountId:sessions[0].accountId,saleId:sale.id}}),0)
    const cancel=await req(`/api/sales/${sale.id}`,credentials[0],'PUT',{cancel:true,cancellationReason:'Anulación de prueba local'});assert.equal(cancel.status,200,`Anulación: HTTP ${cancel.status}`)
    const afterCancel=await read.sale.findUniqueOrThrow({where:{id:sale.id}});assert.ok(afterCancel.cancelledAt)
    assert.equal(Number((await read.product.findUniqueOrThrow({where:{id:'prod-rd-gravado'},select:{stock:true}})).stock),Number(stock.stock))
    console.log('Módulo apagado: venta, importes, caja asignada, reintento, detalle, inventario y anulación comprobados')
  } finally {await read.$disconnect()}
}
