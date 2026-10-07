// Persian month/day keys come exclusively from the FamilyDWH snapshot calendar.
(()=>{
 const panel=document.createElement('section');panel.className='chart monthly-monitor';
 const style=document.createElement('style');style.textContent='.monthly-monitor{margin-bottom:28px}.monthly-monitor .monthly-scroll{overflow:auto;margin-top:16px}.monthly-monitor table{border-collapse:collapse;white-space:nowrap;width:100%}.monthly-monitor th,.monthly-monitor td{padding:9px 12px;border-bottom:1px solid #ffffff18;text-align:right}.monthly-monitor tr th:first-child{position:sticky;right:0;background:#20324c;z-index:1}';document.head.append(style);
 panel.innerHTML='<h2>پایش روزانه فاکتور شعب در ماه‌های شمسی</h2><div style="display:flex;gap:16px;flex-wrap:wrap"><label>ماه شمسی <select id="monitorMonth"></select></label><label>شعبه <select id="monitorInventory"></select></label></div><p id="monitorStatus" class="note"></p><div class="monthly-scroll"><table><thead id="monitorHead"></thead><tbody id="monitorBody"></tbody></table></div>';
 document.querySelector('main').prepend(panel);
 const month=panel.querySelector('#monitorMonth'),inventory=panel.querySelector('#monitorInventory');let table;
 const key=date=>String(date).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/\D/g,'');
 const number=new Intl.NumberFormat('fa-IR');
 function option(select,value,label){const node=document.createElement('option');node.value=value;node.textContent=label;select.append(node)}
 function cell(row,label,tag='td'){const node=document.createElement(tag);node.textContent=label;row.append(node)}
 function render(){
  if(!table)return;const days=table.dates.map((date,i)=>({date,i,key:key(date)})).filter(d=>d.key.slice(0,6)===month.value);
  const head=document.createElement('tr');cell(head,'شعبه','th');days.forEach(d=>cell(head,number.format(Number(d.key.slice(6))),'th'));cell(head,'جمع ماه','th');panel.querySelector('#monitorHead').replaceChildren(head);
  const fragment=document.createDocumentFragment();let total=0;
  table.inventories.forEach((meta,i)=>{if(inventory.value&&meta.id!==inventory.value)return;const row=document.createElement('tr');cell(row,meta.name||meta.id,'th');let sum=0;days.forEach(d=>{const count=table.daily[d.i][i][0];sum+=count;cell(row,number.format(count))});cell(row,number.format(sum));total+=sum;fragment.append(row)});
  panel.querySelector('#monitorBody').replaceChildren(fragment);
  panel.querySelector('#monitorStatus').textContent=`کل فاکتور: ${number.format(total)} · روز جاری ناقص است · آخرین دریافت: ${new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'short',timeStyle:'short'}).format(new Date(table.fetchedAt*1000))}`;
 }
 window.updateMonthlyMonitor=bundle=>{
  if(!bundle.table)return;table=bundle.table;const previous=month.value,branch=inventory.value;month.replaceChildren();inventory.replaceChildren();
  [...new Set(table.dates.map(d=>key(d).slice(0,6)))].forEach(m=>option(month,m,`${m.slice(0,4)}/${m.slice(4)}`));
  month.value=[...month.options].some(o=>o.value===previous)?previous:month.options[month.options.length-1]?.value;
  option(inventory,'','همه شعب');table.inventories.forEach(m=>option(inventory,m.id,`${m.name||m.id} (${m.id})`));inventory.value=[...inventory.options].some(o=>o.value===branch)?branch:'';render();
 };
 month.addEventListener('change',()=>{render();window.monitorChartMonth?.(month.value)});
 inventory.addEventListener('change',()=>{render();window.monitorChartInventory?.(inventory.value)});
})();
