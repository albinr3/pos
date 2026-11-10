import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

export async function runStage78Checks({ sessions, credentials, read, req }) {
  const owner = sessions[1], headers = credentials[1]
  const operation = () => ({ accountId:owner.accountId,userId:owner.userId,clientOperationId:`stage78-${randomBytes(10).toString('hex')}`,cashShiftId:null,clientSequence:null,fiscalPolicyVersion:1 })
  const item = {productId:'prod-doprep-item',qty:1,unitPriceCents:15000,wasPriceOverridden:false}
  const base = {customerId:null,type:'CONTADO',paymentMethod:'EFECTIVO',treasuryAccountId:'treasury-doprep-caja',items:[item],applyLegalTip:false,salePricesIncludeItbis:true,soldAt:'2026-11-10T12:00:00.000Z'}
  const buyer = {name:'Comprador temporal',identification:'101000001',country:'DO'}
  const fiscal = (type, extra={}) => ({type,expectedPolicyVersion:1,incomeType:'01',...extra})
  const json = async (path,method,body,expected=200,auth=headers) => {
    const response=await req(path,auth,method,body), payload=await response.json().catch(()=>({}))
    assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(payload)}`)
    return payload
  }
  const sale = async (payload, viaDirect=false) => {
    const cashOperation=operation(), command=viaDirect?{...payload,cashOperation}:{kind:'sale',payload,cashOperation}
    const path=viaDirect?'/api/sales':'/api/cash-shifts/operations'
    const first=await json(path,'POST',command,viaDirect?201:200)
    const second=await json(path,'POST',command,viaDirect?201:200)
    const result=viaDirect?first:first.result, retried=viaDirect?second:second.result
    assert.equal(result.id,retried.id);assert.equal(result.fiscal.eNcf,retried.fiscal.eNcf)
    return result
  }
  await json('/api/fiscal/sales/context','GET',undefined,409,credentials[0])
  const context=await json('/api/fiscal/sales/context','GET')
  assert.equal(context.policyVersion,1);assert.ok(context.sequences.some(sequence=>sequence.type==='E32'&&sequence.usable))
  const match=await json('/api/fiscal/sales/customer?identification=101-11111-1','GET')
  assert.equal(match.matches.length,1);assert.equal(match.matches[0].id,'cust-doprep-credit')
  const e32={...base,paymentMethod:null,paymentSplits:[{method:'EFECTIVO',amountCents:7500,treasuryAccountId:'treasury-doprep-caja'},{method:'TARJETA',amountCents:7500,treasuryAccountId:'treasury-doprep-banco'}],fiscal:fiscal('E32')}
  const preview32=await json('/api/fiscal/sales/preview','POST',e32)
  assert.equal(preview32.totals.gross,'150.00');assert.equal(preview32.buyer,null)
  const count=await read.sale.count({where:{accountId:owner.accountId}}), stock=Number((await read.product.findUniqueOrThrow({where:{id:item.productId}})).stock)
  const prepared32=await sale(e32)
  assert.equal(prepared32.fiscal.type,'E32');assert.match(prepared32.fiscal.eNcf,/^E32/)
  assert.equal(await read.sale.count({where:{accountId:owner.accountId}}),count+1)
  assert.equal(Number((await read.product.findUniqueOrThrow({where:{id:item.productId}})).stock),stock-1)
  const copy32=await json(`/api/fiscal/documents/${prepared32.fiscal.id}`,'GET')
  assert.equal(copy32.snapshot.totals.gross,'150.00');assert.equal(copy32.snapshot.sale.payments.length,2)
  await json(`/api/fiscal/documents/${prepared32.fiscal.id}`,'GET',undefined,404,credentials[0])
  const detail=await json(`/api/sales/${prepared32.id}`,'GET');assert.equal(detail.fiscal.eNcf,prepared32.fiscal.eNcf)
  const search=await json(`/api/sales?query=${prepared32.fiscal.eNcf}`,'GET');assert.ok(search.data.some(row=>row.id===prepared32.id))
  const threshold={...base,items:[{...item,unitPriceCents:25000000,wasPriceOverridden:true}],fiscal:fiscal('E32')}
  await json('/api/fiscal/sales/preview','POST',threshold,422)
  const foreign=await json('/api/fiscal/sales/preview','POST',{...threshold,fiscal:fiscal('E32',{buyer:{name:'Visitante',identification:'PASS123',country:'US'}})})
  assert.equal(foreign.buyer.country,'US')
  const e31=await sale({...base,fiscal:fiscal('E31',{buyer})})
  assert.equal(e31.fiscal.type,'E31')
  const credit=await sale({...base,customerId:'cust-doprep-credit',type:'CREDITO',paymentMethod:null,treasuryAccountId:null,fiscal:fiscal('E31',{dueDate:'2026-12-10'})})
  const creditDoc=await json(`/api/fiscal/documents/${credit.fiscal.id}`,'GET');assert.equal(creditDoc.snapshot.payment.dueDate,'2026-12-10')
  const ar=await read.accountReceivable.findUniqueOrThrow({where:{saleId:credit.id}})
  const paymentCommand={kind:'payment',payload:{arId:ar.id,amountCents:5000,method:'EFECTIVO',treasuryAccountId:'treasury-doprep-caja'},cashOperation:operation()}
  const payment=await json('/api/cash-shifts/operations','POST',paymentCommand);const paymentRetry=await json('/api/cash-shifts/operations','POST',paymentCommand)
  assert.equal(payment.result.paymentId,paymentRetry.result.paymentId);assert.equal((await read.accountReceivable.findUniqueOrThrow({where:{id:ar.id}})).balanceCents,10000)
  for (const [type,special] of [
    ['E44',{regime:'Régimen prueba',exemptionReference:'Soporte prueba'}],
    ['E45',{governmentEntity:true,purchaseOrder:'OC-01'}],
    ['E46',{exportMode:'EXPORTACION',destinationCountry:'US'}],
  ]) {
    const customer = type==='E45'?'cust-doprep-credit':null
    const saleBuyer = type==='E44'?buyer:type==='E46'?{name:'Importador',identification:'EX-42',country:'US'}:undefined
    const payload={...base,customerId:customer,fiscal:fiscal(type,{...(saleBuyer?{buyer:saleBuyer}:{}),special})}
    const p=await json('/api/fiscal/sales/preview','POST',payload)
    assert.equal(p.totals.gross,type==='E45'?'150.00':'127.12')
    await json('/api/fiscal/sales/preview','POST',{...payload,fiscal:fiscal(type,{...(saleBuyer?{buyer:saleBuyer}:{}),special:{}})},422)
    await json('/api/fiscal/sales/preview','POST',{...payload,fiscal:{...payload.fiscal,currency:'USD'}},422)
    const result=await sale(payload,type==='E45')
    const doc=await json(`/api/fiscal/documents/${result.fiscal.id}`,'GET')
    assert.equal(doc.type,type);assert.equal(doc.snapshot.totals.gross,p.totals.gross);assert.deepEqual(doc.snapshot.sale.special,special)
  }
  await json('/api/fiscal/sales/preview','POST',{...base,items:[{...item,productId:'prod-doprep-service'}],fiscal:fiscal('E46',{special:{exportMode:'EXPORTACION',destinationCountry:'US'}})},422)
  await json('/api/fiscal/sales/preview','POST',{...base,fiscal:{...fiscal('E32'),totals:{gross:'1'}}},422)
  const protectedSale=await req(`/api/sales/${prepared32.id}`,headers,'PUT',{cancel:true,cancellationReason:'Prueba'})
  assert.notEqual(protectedSale.status,200,'La venta fiscal preparada no puede anularse directamente')
  console.log('Etapas 7–8: previsualización y ventas móviles de cinco tipos, reglas, secuencias, reintento, crédito, pagos, búsqueda y aislamiento comprobados')
}
