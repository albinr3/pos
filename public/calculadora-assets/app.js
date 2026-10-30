(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const selects = ['brand','model','country','year','variant'];
  const names = ['marca','modelo','país','año','especificación'];
  const catalog = window.VEHICLE_CATALOG;
  let records = [];
  let taxTotal = null, auctionTotal = null;
  const usd = n => `US$ ${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const dop = n => `RD$ ${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const num = id => Math.max(0, Number($(id).value) || 0);
  const sort = (a,b) => String(a).localeCompare(String(b),'es',{numeric:true,sensitivity:'base'});
  function options(id, values, placeholder) {
    const el = $(id); el.replaceChildren(new Option(placeholder,''));
    for (const [value,label] of values) el.add(new Option(label,String(value)));
    el.disabled = !values.length;
  }
  function matching() { return records.filter(r => (!$('brand').value || r[0] === $('brand').value) && (!$('model').value || r[1] === $('model').value) && (!$('country').value || r[4] === $('country').value) && (!$('year').value || String(r[2]) === $('year').value)); }
  function refresh(from) {
    for (let i=from;i<selects.length;i++) options(selects[i],[],`Selecciona ${names[i] === 'año' ? 'el' : 'la'} ${names[i]}`);
    $('results').hidden=true; $('empty').hidden=false; taxTotal=null; updateSummary();
    if (from >= selects.length) return;
    const rows=matching();
    if (from===4) {
      options('variant',rows.map(r => [records.indexOf(r),`${r[3]} · ${r[5]} · ${r[6]} cc · ${r[7]} · ${usd(Number(r[8]))}`]),'Selecciona una especificación');
    } else {
      const col=[0,1,4,2][from];
      const values=[...new Set(rows.map(r=>r[col]).filter(Boolean))].sort(from===3?(a,b)=>b-a:sort);
      options(selects[from],values.map(v=>[v,v]),`Selecciona ${from===3?'el':'la'} ${names[from]}`);
    }
    $('results').hidden=true; $('empty').hidden=false;
  }
  if (catalog && Array.isArray(catalog.records) && catalog.records.length) {
    records=catalog.records.filter(r => Number(r[2])>=2021);
    $('catalogStatus').textContent=`${records.length.toLocaleString('es-DO')} registros disponibles`;
    refresh(0);
  } else { $('catalogStatus').textContent='No se pudo cargar el catálogo'; }
  selects.forEach((id,i)=>$(id).addEventListener('change',()=>refresh(i+1)));
  function calculateTax(scroll = false) {
    const r=records[Number($('variant').value)]; if (!r || $('variant').value==='') return;
    const fob=Number(r[8]); const cif=round(fob+num('freight')+round(fob*num('insurance')/100));
    const tradeMode=$('trade').value;
    const zeroTariff=tradeMode==='zero' || (tradeMode==='auto' && r[4]==='ESTADOS UNIDOS');
    const grav=zeroTariff?0:round(cif*num('tariff')/100);
    $('tradeNote').textContent=zeroTariff ? 'Gravamen 0 % simulado. El beneficio depende de la verificación de origen y documentación.' : 'Se aplicó el gravamen configurado.';
    const itbis=round((cif+grav)*.18); const service=num('service');
    const fixedImportFee=1000;
    const customs=round(grav+itbis+service+fixedImportFee);
    const plate=round(cif*.17), co2=round(cif*num('co2')/100), marbete=num('marbete'), plateTotal=plate+co2+marbete;
    const values={fob,cif,grav,itbis,serviceResult:service,fixedImportFee,customs,plate,co2Result:co2,marbeteResult:marbete,plateTotal,total:customs+plateTotal};
    Object.entries(values).forEach(([id,value])=>$(id).textContent=usd(value));
    const rate=num('exchange');
    $('customsDop').textContent=rate?`≈ ${dop(customs*rate)}`:'Introduce una tasa de cambio para ver pesos';
    $('plateDop').textContent=rate?`≈ ${dop(plateTotal*rate)}`:'';
    $('totalDop').textContent=rate?`≈ ${dop((customs+plateTotal)*rate)} · tasa ${rate.toFixed(2)}`:'';
    $('vehicleName').textContent=`${r[0]} ${r[1]} ${r[2]} · ${r[3]} · ${r[4]}`;
    $('empty').hidden=true; $('results').hidden=false;
    taxTotal=round(customs+plateTotal); updateSummary();
    if(scroll) $('results').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  $('vehicleForm').addEventListener('submit', event => { event.preventDefault(); calculateTax(true); });
  document.querySelectorAll('.settings input, #trade').forEach(el => el.addEventListener('input', () => {
    if (el.id==='freight' && $('shipping').value !== '') $('shipping').value=el.value;
    if (taxTotal !== null) calculateTax(); else updateSummary();
  }));
  function updateSummary() {
    const expenses = [...document.querySelectorAll('.expense')].reduce((sum, el) => sum + Math.max(0, Number(el.value) || 0), 0);
    const auction = auctionTotal === null ? 'Pendiente' : usd(auctionTotal);
    const tax = taxTotal === null ? 'Pendiente' : usd(taxTotal);
    $('summaryAuction').textContent = $('finalAuction').textContent = auction;
    $('summaryTax').textContent = $('finalTax').textContent = tax;
    // Ambas vistas usan la misma suma para evitar diferencias en el presupuesto.
    $('expensesSectionTotal').textContent = $('expensesTotal').textContent = usd(expenses);
    const complete = taxTotal !== null && auctionTotal !== null;
    $('summarySubtotal').textContent = complete ? usd(taxTotal + auctionTotal) : 'Pendiente';
    $('finalTotal').textContent = complete ? usd(taxTotal + auctionTotal + expenses) : 'Pendiente';
    $('summaryStatus').textContent = complete ? 'Subtotal sin gastos adicionales.' : 'Completa los dos cálculos para ver el subtotal.';
    $('finalStatus').textContent = complete ? 'Los gastos vacíos se consideran US$0. Confirma todas las tarifas antes de comprar.' : 'Completa los cálculos de impuestos y subasta. Los campos de gastos vacíos se consideran US$0.';
  }
  function calculateAuction() {
    const amount=num('bid');
    if (!amount) { auctionTotal=null; $('auctionResults').hidden=true; $('auctionEmpty').hidden=false; updateSummary(); return; }
    const tables=window.AUCTION_FEES;
    if (!tables) { $('auctionEmpty').textContent='No se pudieron cargar las tarifas de subasta.'; auctionTotal=null; updateSummary(); return; }
    const config=tables[$('preferred').checked?'preferential':'standard'][$('titleType').value];
    const fee=table=>{const tier=table.find(t=>amount<=t.max); return round(tier.percent ? amount*tier.percent : tier.val);};
    const buyer=fee(config.buyerFee), internet=fee(config.liveBid), gate=$('auctionHouse').value==='iaai'?105:config.gate;
    const fixedFee=200;
    const fees=round(buyer+internet+gate+config.env+config.title+fixedFee);
    auctionTotal=round(amount+fees);
    const fields={auctionBid:amount,buyerFee:buyer,internetFee:internet,gateFee:gate,environmentFee:config.env,titleFee:config.title,fixedAuctionFee:fixedFee,feesTotal:fees,auctionTotal};
    Object.entries(fields).forEach(([id,value])=>$(id).textContent=usd(value));
    $('gateLabel').textContent=$('auctionHouse').value==='iaai'?'Service Fee':'Gate Fee';
    $('auctionEmpty').hidden=true; $('auctionResults').hidden=false; updateSummary();
  }
  $('auctionForm').addEventListener('submit',event=>{event.preventDefault(); calculateAuction();});
  ['bid','auctionHouse','titleType','preferred'].forEach(id=>$(id).addEventListener('input',()=>{if(auctionTotal!==null) calculateAuction();}));
  document.querySelectorAll('.expense').forEach(el=>el.addEventListener('input',()=>{
    if (el.id==='shipping') {
      $('freight').value=el.value === '' ? '900' : el.value;
      if (taxTotal !== null) calculateTax();
    }
    updateSummary();
  }));
  updateSummary();
  $('print').addEventListener('click',()=>window.print());
})();
