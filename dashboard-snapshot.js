// A snapshot is shared; view state belongs exclusively to this browser tab.
const publicSnapshotMode=document.documentElement.dataset.hosting==='github-pages';
let snapshotBundle=null,snapshotETag='',snapshotReading=false,tablePrefix=null;
let hourlyPrefix=null;
let viewFilter={mode:'all',value:''};
try{viewFilter=JSON.parse(sessionStorage.getItem('factor-view')||'null')||viewFilter}catch{}
const snapshotKey=f=>f.mode==='all'?'all':`${f.mode}:${f.value}`;
const buckets=['total','low','mid','high','veryhigh'];
let additiveScopeCache=new Map();
function combineInventoryCharts(scope){
 const base=snapshotBundle.chartTemplate;if(!base)return null;
 const ids=scope.inventoryIds,chosen=new Set(ids),views=Object.values(snapshotBundle.charts).filter(v=>v.filter.mode!=='all');
 // Exact cached unions take precedence; never substitute the cube all member.
 const exact=views.find(v=>v.filter.inventoryIds.length===ids.length&&v.filter.inventoryIds.every(id=>chosen.has(id)));
 if(exact)return {...exact,filter:scope};
 const branches=ids.map(id=>snapshotBundle.charts[`inventory:${id}`]);if(branches.some(v=>!v))return null;
 if(ids.length>1){
  const certified=views.some(view=>{
   if(!ids.every(id=>view.filter.inventoryIds.includes(id)))return false;
   const key=snapshotKey(view.filter);if(additiveScopeCache.has(key))return additiveScopeCache.get(key);
   const members=view.filter.inventoryIds.map(id=>snapshotBundle.charts[`inventory:${id}`]);
   const valid=members.every(Boolean)&&['counts','selectedCounts','hours','selectedHours'].every(field=>view[field].every((value,i)=>Array.isArray(value)?value.every((n,j)=>members.reduce((sum,v)=>sum+v[field][i][j],0)===n):members.reduce((sum,v)=>sum+v[field][i],0)===value));
   additiveScopeCache.set(key,valid);return valid;
  });
  if(!certified)return null;
 }
 return {filter:scope,counts:base.days.map((_,i)=>branches.reduce((n,v)=>n+v.counts[i],0)),selectedCounts:base.days.map((_,i)=>branches.reduce((n,v)=>n+v.selectedCounts[i],0)),hours:base.days.map((d,i)=>d.hours.map((_,j)=>branches.reduce((n,v)=>n+v.hours[i][j],0))),selectedHours:base.days.map((d,i)=>d.hours.map((_,j)=>branches.reduce((n,v)=>n+v.selectedHours[i][j],0)))};
}
function inventoryPressed(filter,mode,value){
 if(filter.mode!=='selection')return filter.mode===mode&&(mode==='all'||filter.value===value);
 const ids=new Set(filter.inventoryIds);if(mode==='inventory')return ids.has(value);if(mode==='all')return false;
 const group=inventoryData.inventoryOptions.filter(x=>x.supervisor===value),count=group.filter(x=>ids.has(x.id)).length;
 return count===0?false:count===group.length?true:'mixed';
}
function setupInventoryMultiselect(){
 const controls=document.createElement('div');controls.className='inventory-multi-controls';
 const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='multiInventory';checkbox.checked=viewFilter.mode==='selection';
 label.append(checkbox,document.createTextNode('انتخاب چندگانه'));
 checkbox.addEventListener('change',()=>{if(checkbox.checked){visibleSupervisor='';previewSupervisor='';$('locationPanel').hidden=false;$('locationsToggle').setAttribute('aria-expanded','true');renderLocationButtons($('locationSearch').value)}});
 const hint=document.createElement('span');hint.className='note';hint.textContent='برای انتخاب دسته شخصی سازی شده از شعب، می‌توانید دکمه Ctrl را نگه دارید و شعب مد نظر را انتخاب کنید';
 controls.append(label,hint);$('supervisorButtons').before(controls);
}
function persistInventorySelection(){try{sessionStorage.setItem('factor-view',JSON.stringify(viewFilter))}catch{}}
let tableSort=[];
const validSortKey=key=>buckets.includes(key)||/^(second|growth)_(total|low|mid|high|veryhigh)$/.test(key);
try{const saved=JSON.parse(sessionStorage.getItem('factor-table-sort')||'null');for(const entry of Array.isArray(saved)?saved:saved?[saved]:[]){if(entry&&validSortKey(entry.key)&&['ascending','descending'].includes(entry.direction)&&!tableSort.length)tableSort.push(entry)}}catch{}
function sortTableRows(rows){
 if(!tableSort.length)return rows;
 return [...rows].sort((a,b)=>{for(const {key,direction} of tableSort){if(a[key]==null||b[key]==null)return a[key]==null?(b[key]==null?0:1):-1;const difference=(direction==='ascending'?1:-1)*(a[key]-b[key]);if(difference)return difference}return 0});
}
function saveTableSorting(){
 try{sessionStorage.setItem('factor-table-sort',JSON.stringify(tableSort))}catch{}
 updateTableSortHeaders();fetchInventoryTable();
}
function updateTableSortHeaders(){
 document.querySelectorAll('[data-table-sort]').forEach(button=>{
  const index=tableSort.findIndex(s=>s.key===button.dataset.tableSort),sort=tableSort[index],header=button.closest('th');
  if(index===0)header.setAttribute('aria-sort',sort.direction);else header.removeAttribute('aria-sort');
  header.dataset.sortActive=String(index>=0);
  button.querySelector('.sort-arrow').textContent=sort?(sort.direction==='ascending'?'(صعودی)':'(نزولی)'):'↕';
  button.title=sort?(sort.direction==='descending'?'مرتب‌سازی تعداد از کم به زیاد':'حذف مرتب‌سازی این ستون'):'مرتب‌سازی تعداد از زیاد به کم';
  button.setAttribute('aria-label',button.dataset.label+(sort?`؛ ${sort.direction==='ascending'?'صعودی':'نزولی'}`:'')+`؛ ${button.title}`);
 });
 $('clearTableSort').disabled=!tableSort.length;
}
function setupTableSorting(){
 const toolbar=document.createElement('div');toolbar.className='table-sort-controls';
 const clear=document.createElement('button');clear.type='button';clear.id='clearTableSort';clear.textContent='حذف مرتب‌سازی';clear.addEventListener('click',()=>{tableSort=[];saveTableSorting()});
 const hint=document.createElement('span');hint.className='note';hint.textContent='با کلیک روی سرستون، می‌توانید مرتب سازی را مدیریت کنید.';
 const status=document.createElement('span');status.id='tableSortStatus';status.className='note';status.setAttribute('role','status');
 toolbar.append(clear,hint,status);const scroll=document.querySelector('.inventory-table .table-scroll');scroll.before(toolbar);
 wireTableSorting();
}
function wireTableSorting(){
 document.querySelectorAll('.inventory-table thead th[data-key]').forEach(header=>{
  const key=header.dataset.key,button=document.createElement('button'),arrow=document.createElement('span');
  button.type='button';button.className='table-sort';button.dataset.tableSort=key;button.dataset.label=header.textContent;
  button.append(document.createTextNode(header.textContent));arrow.className='sort-arrow';arrow.setAttribute('aria-hidden','true');button.append(arrow);
  button.addEventListener('click',()=>{
   const previous=tableSort.find(s=>s.key===key),direction=!previous?'descending':previous.direction==='descending'?'ascending':null;
   tableSort=direction?[{key,direction}]:[];
   saveTableSorting();
  });
  header.replaceChildren(button);
 });
 updateTableSortHeaders();
}

const metricOrder=['low','mid','high','veryhigh','total'];
let metricLabels=[],metadataLabels=[],comparisonLayout=null;
const percentFormatter=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:1});
function growthPercent(first,second){return first===0?(second===0?0:null):100*(second-first)/first}
function readComparisonRange(){
 if(!tablePayload||!$('compareStart'))return null;
 return {start:tablePayload.dates[Number($('compareStart').value)],end:tablePayload.dates[Number($('compareEnd').value)],followEnd:$('compareEnd').value===$('compareEnd').max};
}
function restoreComparisonRange(previous){
 if(!tablePayload)return;
 let saved=previous;try{saved ||= JSON.parse(sessionStorage.getItem('factor-compare-range')||'null')}catch{}
 const a=$('compareStart'),b=$('compareEnd'),dates=tablePayload.dates;
 a.max=b.max=dates.length-1;
 const i=saved?dates.indexOf(saved.start):-1,j=saved?(saved.followEnd?dates.length-1:dates.indexOf(saved.end)):-1;
 a.value=i>=0?i:$('tableStart').value;b.value=j>=Number(a.value)?j:$('tableEnd').value;
 a.disabled=b.disabled=dates.length===1;updateComparisonSlider();
}
function updateComparisonSlider(){
 const a=$('compareStart'),b=$('compareEnd');if(!a)return;
 const max=Number(a.max),width=Math.max(0,a.parentElement.clientWidth-22);
 a.parentElement.style.setProperty('--range-start',`${11+(max?Number(a.value)/max*width:0)}px`);
 a.parentElement.style.setProperty('--range-width',`${max?(Number(b.value)-Number(a.value))/max*width:0}px`);
 if(tablePayload){for(const input of [a,b]){const date=tablePayload.dates[Number(input.value)];$(input.id+'Date').textContent=date;input.setAttribute('aria-valuetext',date)}setPeriodDayCaption('comparePeriodDays',a,b)}
}
function setupComparison(){
 const headers=[...document.querySelectorAll('.inventory-table thead th')];metadataLabels=headers.slice(0,4).map(h=>h.textContent);metricLabels=headers.slice(4).map(h=>h.textContent);
 headers.slice(4).forEach((h,i)=>h.dataset.key=metricOrder[i]);
 const first=document.querySelector('.table-period'),second=first.cloneNode(true);
 const title=document.createElement('strong');title.className='comparison-title';title.textContent='بازه اول · مبنای رشد';first.prepend(title);
 second.querySelectorAll('[id]').forEach(el=>el.id=el.id.replace('table','compare'));
 second.querySelectorAll('label').forEach(el=>el.htmlFor=el.htmlFor.replace('table','compare'));
 second.querySelectorAll('input').forEach(el=>el.setAttribute('aria-label',el.id==='compareStart'?'شروع بازه دوم':'پایان بازه دوم'));
 const secondTitle=title.cloneNode(true);secondTitle.textContent='بازه دوم · مقایسه با بازه اول';second.prepend(secondTitle);first.after(second);
 setupHourSlider(first,'first');setupHourSlider(second,'second');
 for(const id of ['compareStart','compareEnd'])$(id).addEventListener('input',()=>{
  const a=$('compareStart'),b=$('compareEnd');if(Number(a.value)>Number(b.value)){if(id==='compareStart')b.value=a.value;else a.value=b.value}
  updateComparisonSlider();loadInventoryTable();try{sessionStorage.setItem('factor-compare-range',JSON.stringify(readComparisonRange()))}catch{}
 });
 window.addEventListener('resize',updateComparisonSlider);
 const style=document.createElement('style');style.textContent='.comparison-title{display:block;font-size:12px;color:#b6ece2;margin-bottom:12px}.table-period{margin-bottom:16px}.growth-value{font-variant-numeric:tabular-nums;white-space:nowrap;direction:ltr;display:inline-block;padding:7px 10px;border-radius:9px;background:#ffffff08}.growth-positive{color:#72edaa;background:#72edaa12}.growth-negative{color:#ff929c;background:#ff929c12}.growth-neutral{color:#c2cfdf}.comparison-table{min-width:2300px!important}.comparison-table th[data-key^="growth"]{color:#c8b5ff}.comparison-table td.metric-first{border-inline-start:1px solid #91b5ee35}';document.head.append(style);
}
function comparisonHeaders(compare){
 if(comparisonLayout===compare)return;comparisonLayout=compare;
 const row=document.createElement('tr');
 for(const text of metadataLabels){const th=document.createElement('th');th.scope='col';th.textContent=text;row.append(th)}
 metricOrder.forEach((key,i)=>{
  for(const [prefix,label] of compare?[['','بازه اول'],['second_','بازه دوم'],['growth_','رشد ٪']]:[['','']]){
   const th=document.createElement('th');th.scope='col';th.dataset.key=prefix+key;th.textContent=metricLabels[i]+(label?' · '+label:'');row.append(th);
  }
 });
 document.querySelector('.inventory-table thead').replaceChildren(row);
 document.querySelector('.inventory-table table').classList.toggle('comparison-table',compare);
 const table=document.querySelector('.inventory-table table'),cols=document.createElement('colgroup');
 const widths=[185,105,115,115,...metricOrder.flatMap(()=>compare?[120,120,100]:[125])];
 widths.forEach(width=>{const col=document.createElement('col');col.style.width=width+'px';cols.append(col)});
 table.querySelector('colgroup')?.remove();table.prepend(cols);table.style.width=widths.reduce((a,n)=>a+n,0)+'px';
 if(!compare&&tableSort.some(s=>s.key.includes('_'))){tableSort=[];try{sessionStorage.setItem('factor-table-sort','[]')}catch{}}
 wireTableSorting();
}
function renderComparedTable(a,b){
 updateComparisonSlider();updateHourSlider('first');updateHourSlider('second');const c=Number($('compareStart').value),d=Number($('compareEnd').value),compare=a!==c||b!==d||hourRange('first').join()!==hourRange('second').join();
 comparisonHeaders(compare);
 const first=sumTableRange(a,b,'first');
 if(!compare){renderInventoryTable({rows:sortTableRows(first),startDate:tablePayload.dates[a],endDate:tablePayload.dates[b]});return}
 const second=new Map(sumTableRange(c,d,'second').map(row=>[row.id,row]));
 for(const row of first)for(const key of metricOrder){row['second_'+key]=second.get(row.id)[key];row['growth_'+key]=growthPercent(row[key],row['second_'+key])}
 const fragment=document.createDocumentFragment();
 for(const row of sortTableRows(first)){
  const tr=document.createElement('tr');
  [row.name||row.id,row.state||'—',row.manager||'—',row.supervisor||'—'].forEach((text,i)=>{const cell=document.createElement(i===0?'th':'td');if(i===0)cell.scope='row';cell.textContent=text;tr.append(cell)});
  for(const key of metricOrder){
   for(const prefix of ['','second_','growth_']){
    const td=document.createElement('td'),value=document.createElement('b'),n=row[prefix+key];td.dataset.metric=prefix+key;
    if(prefix==='growth_'){
     value.className='growth-value '+(n===null||n===0?'growth-neutral':n>0?'growth-positive':'growth-negative');
     value.textContent=n===null?'—':(n>0?'+':'')+percentFormatter.format(n)+'٪';
     value.title=n===null?'درصد رشد با مبنای صفر تعریف نمی‌شود.':'(بازه دوم − بازه اول) ÷ بازه اول × ۱۰۰';
     td.append(value);
    }else if(key==='total'){
     value.className='table-total';value.textContent=fmt(n);td.append(value);if(!prefix)td.className='metric-first';
    }else{
     const total=row[prefix+'total'],share=total?100*n/total:0,cell=document.createElement('div'),percent=document.createElement('small'),track=document.createElement('i'),bar=document.createElement('em');
     cell.className='range-cell';cell.style.setProperty('--bucket',({low:'#88baff',mid:'#7ee2c7',high:'#b7a0ff',veryhigh:'#ffcf88',total:'#83e7d3'})[key]);
     value.className=key==='total'?'table-total':'comparison-count';value.textContent=fmt(n);percent.textContent=fmt(share)+'٪';percent.title='درصد از کل فاکتورهای همین شعبه در همین بازه';bar.style.width=`${Math.max(0,Math.min(100,share))}%`;track.setAttribute('aria-hidden','true');track.append(bar);cell.append(value,percent,track);td.append(cell);if(!prefix)td.className='metric-first';
    }
    tr.append(td);
   }
  }
  fragment.append(tr);
 }
 if(!first.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=19;td.className='table-empty';td.textContent='برای این بازه و شعب انتخاب‌شده، داده‌ای وجود ندارد.';tr.append(td);fragment.append(tr)}
 $('inventoryTableBody').replaceChildren(fragment);$('tableRange').classList.remove('error');$('tableRange').textContent=`بازه اول: ${tablePayload.dates[a]} تا ${tablePayload.dates[b]} · بازه دوم: ${tablePayload.dates[c]} تا ${tablePayload.dates[d]}`;
}

function hourRange(name){return [Number($(name+'HourStart').value),Number($(name+'HourEnd').value)]}
function setupHourSlider(parent,name){
 const box=document.createElement('div');box.className='hour-window';
 const labels=document.createElement('div');labels.className='hour-window-labels';
 const title=document.createElement('span');title.textContent='◷ بازه ساعتی';const output=document.createElement('output');output.id=name+'HourLabel';labels.append(title,output);
 const track=document.createElement('div');track.className='dual-slider hour-slider';
 for(const edge of ['Start','End']){
  const input=document.createElement('input');input.type='range';input.id=name+'Hour'+edge;input.min=input.max=input.value='0';input.step='1';input.disabled=true;
  input.setAttribute('aria-label',(edge==='Start'?'ساعت شروع':'ساعت پایان')+(name==='first'?' بازه اول':' بازه دوم'));
  input.addEventListener('input',()=>{
   const a=$(name+'HourStart'),b=$(name+'HourEnd');if(Number(a.value)>Number(b.value)){if(edge==='Start')b.value=a.value;else a.value=b.value}
   updateHourSlider(name);loadInventoryTable();saveHourRange(name);
  });track.append(input);
 }
 box.append(labels,track);parent.append(box);
 if(name==='first'){
  const style=document.createElement('style');style.textContent='.hour-window{margin-top:6px;padding:10px 14px 3px;border:1px dashed #eab86a66;border-radius:12px;background:linear-gradient(100deg,#c8851810,#c8851804)}.hour-window-labels{display:flex;justify-content:space-between;gap:12px;color:#f1ca89;font-size:11px}.hour-window-labels output{direction:ltr;font-variant-numeric:tabular-nums}.hour-slider,.hour-slider input{height:28px}.hour-slider:before,.hour-slider:after{top:13px;height:2px}.hour-slider:after{background:linear-gradient(90deg,#ffd38b,#f29a69);box-shadow:0 0 8px #f4b76555}.hour-slider input::-webkit-slider-runnable-track{height:2px}.hour-slider input::-webkit-slider-thumb{height:14px;width:14px;margin-top:-6px;border:2px solid #ffe1ad;border-radius:4px;background:#d99b43;box-shadow:0 0 0 3px #eab86a15}.hour-slider input::-moz-range-track{height:2px}.hour-slider input::-moz-range-thumb{height:10px;width:10px;border:2px solid #ffe1ad;border-radius:4px;background:#d99b43}.hour-slider input:focus-visible{outline-color:#f7c67d}';document.head.append(style);
  style.textContent=style.textContent.replaceAll('.hour-slider','.dual-slider.hour-slider');
  window.addEventListener('resize',()=>{updateHourSlider('first');updateHourSlider('second')});
 }
}
function saveHourRange(name){try{const [start,end]=hourRange(name);sessionStorage.setItem('factor-hours-'+name,JSON.stringify({start,end,followEnd:String(end)===$(name+'HourEnd').max}))}catch{}}
function restoreHourRanges(){
 const maximum=Math.max(0,Math.min(23,Math.floor((tablePayload?.cutoffSeconds||0)/3600)));
 for(const name of ['first','second']){
  let saved;try{saved=JSON.parse(sessionStorage.getItem('factor-hours-'+name)||'null')}catch{}
  const a=$(name+'HourStart'),b=$(name+'HourEnd');a.max=b.max=maximum;
  a.value=saved?Math.max(0,Math.min(maximum,Number(saved.start)||0)):0;
  b.value=saved&&!saved.followEnd?Math.max(Number(a.value),Math.min(maximum,Number(saved.end)||0)):maximum;
  a.disabled=b.disabled=!hourlyPrefix||maximum===0;updateHourSlider(name);
 }
}
function updateHourSlider(name){
 const a=$(name+'HourStart'),b=$(name+'HourEnd');if(!a)return;
 const max=Number(a.max),width=Math.max(0,a.parentElement.clientWidth-22),[start,end]=hourRange(name);
 a.parentElement.style.setProperty('--range-start',`${11+(max?start/max*width:0)}px`);a.parentElement.style.setProperty('--range-width',`${max?(end-start)/max*width:0}px`);
 const clock=seconds=>[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
 const from=clock(start*3600),to=clock(Math.min((end+1)*3600-1,tablePayload?.cutoffSeconds||0));
 $(name+'HourLabel').textContent=hourlyPrefix?`${from} – ${to}`:'در انتظار داده ساعتی…';a.setAttribute('aria-valuetext',from);b.setAttribute('aria-valuetext',to);
}
function buildHourlyPrefix(table){
 if(!Array.isArray(table.hourly))return null;
 const stride=table.inventories.length*5,result=Array.from({length:24},()=>new Float64Array((table.dates.length+1)*stride));
 for(const [day,branch,hour,...counts] of table.hourly)counts.forEach((n,k)=>result[hour][(day+1)*stride+branch*5+k]=n);
 for(const prefix of result)for(let offset=stride;offset<prefix.length;offset++)prefix[offset]+=prefix[offset-stride];
 return result;
}
let snapshotDBPromise;
function snapshotDB(){
 if(!snapshotDBPromise)snapshotDBPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open('factor-dashboard-v2',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('storage blocked'));
 });
 return snapshotDBPromise;
}
async function saveBrowserSnapshot(bundle){try{const db=await snapshotDB();await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(bundle,'latest');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});}catch{}}
async function restoreBrowserSnapshot(){try{const db=await snapshotDB();const r=db.transaction('snapshots').objectStore('snapshots').get('latest');r.onsuccess=()=>{if(!snapshotBundle&&validSnapshot(r.result)){installSnapshot(r.result);snapshotETag=`"${r.result.version}"`;$('status').textContent='نمایش آخرین داده ذخیره‌شده؛ در حال بررسی بروزرسانی…'}}}catch{}}
function validSnapshot(b){
 if(!b||b.schema!==2||typeof b.version!=='string'||!Number.isFinite(b.fetchedAt)||!b.charts||typeof b.charts!=='object')return false;
 const t=b.table;
 if(t&&(!Array.isArray(t.dates)||!t.dates.length||!Array.isArray(t.inventories)||!Array.isArray(t.daily)||t.daily.length!==t.dates.length||!t.daily.every(day=>Array.isArray(day)&&day.length===t.inventories.length&&day.every(v=>Array.isArray(v)&&v.length===5&&v.every(n=>Number.isSafeInteger(n)&&n>=0)&&v[0]===v.slice(1).reduce((a,n)=>a+n,0)))))return false;
 const days=b.chartTemplate?.days;
 if(t?.hourly!==undefined){
  if(!Array.isArray(t.hourly))return false;
  const seen=new Set(),totals=new Float64Array(t.dates.length*t.inventories.length*5);
  for(const row of t.hourly){
   if(!Array.isArray(row)||row.length!==8||!row.every(n=>Number.isSafeInteger(n)&&n>=0))return false;
   const [d,i,h,...counts]=row,key=`${d}:${i}:${h}`;
   if(d>=t.dates.length||i>=t.inventories.length||h>23||seen.has(key)||counts[0]!==counts.slice(1).reduce((a,n)=>a+n,0))return false;
   seen.add(key);counts.forEach((n,k)=>totals[(d*t.inventories.length+i)*5+k]+=n);
  }
  if(!t.daily.every((day,d)=>day.every((counts,i)=>counts.every((n,k)=>n===totals[(d*t.inventories.length+i)*5+k]))))return false;
 }
 return Object.values(b.charts).every(c=>c.filter&&Array.isArray(days)&&['counts','selectedCounts','hours','selectedHours'].every(k=>Array.isArray(c[k])&&c[k].length===days.length)&&c.counts.every((n,i)=>Number.isSafeInteger(n)&&n>=0&&Number.isSafeInteger(c.selectedCounts[i])&&c.selectedCounts[i]>=0&&c.selectedCounts[i]<=n&&['hours','selectedHours'].every(k=>Array.isArray(c[k][i])&&c[k][i].length===days[i].hours.length&&c[k][i].every(v=>Number.isSafeInteger(v)&&v>=0))));
}
function selectedScope(){
 const options=snapshotBundle?.chartTemplate?.inventoryOptions||snapshotBundle?.table?.inventories||[];
 if(viewFilter.mode==='selection'){
  const wanted=new Set(Array.isArray(viewFilter.inventoryIds)?viewFilter.inventoryIds:[]),ids=options.filter(x=>wanted.has(x.id)).map(x=>x.id).sort();
  viewFilter={mode:'selection',value:ids.join(','),inventoryIds:ids};
  return {...viewFilter,label:ids.length?'شعب انتخاب‌شده':'هیچ شعبه‌ای انتخاب نشده'};
 }
 let selected=options.filter(x=>viewFilter.mode==='all'||(viewFilter.mode==='supervisor'?x.supervisor===viewFilter.value:x.id===viewFilter.value));
 if(!selected.length&&viewFilter.mode!=='all'){viewFilter={mode:'all',value:''};selected=options}
 return {...viewFilter,label:viewFilter.mode==='all'?'همه شعب':viewFilter.mode==='inventory'?(selected[0]?.name||viewFilter.value):viewFilter.value,inventoryIds:selected.map(x=>x.id)};
}
function chartForScope(scope){
 const view=scope.mode==='selection'?combineInventoryCharts(scope):snapshotBundle.charts[snapshotKey(scope)],base=snapshotBundle.chartTemplate;
 if(!view||!base)return null;
 const days=base.days.map((d,i)=>({...d,count:view.counts[i],selectedCount:view.selectedCounts[i],hours:d.hours.map((h,j)=>({...h,count:view.hours[i][j],selectedCount:view.selectedHours[i][j]}))}));
 const history=days.filter(d=>!d.today),mean=k=>history.length?history.reduce((a,d)=>a+d[k],0)/history.length:0;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return {...base,days,inventoryFilter:view.filter,mean:mean('count'),selectedMean:mean('selectedCount'),cache:{fetchedAt:snapshotBundle.fetchedAt,snapshotDate:days.at(-1).date,dateMismatch:days.at(-1).date!==today}};
}
function renderSnapshotView(){
 if(!snapshotBundle)return;
 const scope=selectedScope(),chart=chartForScope(scope);
 if(chart){lastSaved=chart;draw(chart);$('filterStatus').textContent='';renderFetchStatus()}
 else{
  lastSaved=null;chartView.data=null;
  renderInventoryFilters({inventoryFilter:scope,inventoryOptions:snapshotBundle.chartTemplate?.inventoryOptions||snapshotBundle.table?.inventories||[]});
  document.querySelectorAll('.cards .value').forEach(e=>e.textContent='—');
  for(const id of ['todayNote','specialTodayNote','delta','specialDelta','specialDeltaNote','selectedToday','selectedShare','selectedMean','hourDetail'])if($(id))$(id).textContent='';
  $('plot').replaceChildren();label(500,170,scope.mode==='selection'?'آمار تجمیعی این انتخاب در دسترس نیست.':'در انتظار آماده شدن نمودار این محدوده…',{'text-anchor':'middle'});$('hours').replaceChildren();
  $('filterStatus').textContent=scope.mode==='selection'?'جدول به‌روز شد؛ آمار تجمیعی نمودار برای این ترکیب در نسخه ذخیره‌شده قابل تأیید نیست.':'نمودار این محدوده هنوز در نسخه ذخیره‌شده موجود نیست.';
 }
 fetchInventoryTable();
}
function selectSnapshotFilter(mode,value='',event={}){
 if(!snapshotBundle||!['all','supervisor','inventory'].includes(mode))return;
 const multi=$('multiInventory').checked||event.ctrlKey||event.metaKey||event.shiftKey;
 if(multi&&mode!=='all'){
  const ids=new Set(viewFilter.mode==='all'?[]:selectedScope().inventoryIds),options=snapshotBundle.chartTemplate?.inventoryOptions||snapshotBundle.table?.inventories||[];
  const target=mode==='inventory'?[value]:options.filter(x=>x.supervisor===value).map(x=>x.id),remove=target.every(id=>ids.has(id));
  target.forEach(id=>remove?ids.delete(id):ids.add(id));viewFilter={mode:'selection',value:[...ids].sort().join(','),inventoryIds:[...ids].sort()};
  $('multiInventory').checked=true;visibleSupervisor='';previewSupervisor='';$('locationPanel').hidden=false;$('locationsToggle').setAttribute('aria-expanded','true');
 }else viewFilter={mode,value:mode==='all'?'':value};
 persistInventorySelection();
 if(mode==='supervisor'&&!multi){visibleSupervisor=value;previewSupervisor='';$('locationSearch').value='';$('locationPanel').hidden=false;$('locationsToggle').setAttribute('aria-expanded','true')}
 else if(mode==='all'){visibleSupervisor='';previewSupervisor=''}
 renderSnapshotView();
}
function installSnapshot(bundle){
 const previousComparison=readComparisonRange();
 snapshotBundle=bundle;additiveScopeCache.clear();const next=bundle.table;
 if(next){
  const a=$('tableStart'),b=$('tableEnd'),oldStart=tablePayload?.dates[Number(a.value)],oldEnd=tablePayload?.dates[Number(b.value)],followEnd=!tableInitialized||Number(b.value)===Number(b.max);
  tablePayload={...next,totalDays:next.dates.length};
  tablePrefix=[next.inventories.map(()=>[0,0,0,0,0])];
  hourlyPrefix=buildHourlyPrefix(next);
  next.daily.forEach(day=>{const previous=tablePrefix.at(-1);tablePrefix.push(day.map((v,i)=>v.map((n,j)=>previous[i][j]+n)))});
  a.max=b.max=next.dates.length-1;a.value=Math.max(0,next.dates.indexOf(oldStart));b.value=followEnd?b.max:Math.max(Number(a.value),next.dates.indexOf(oldEnd));
  if(!tableInitialized){try{const range=JSON.parse(sessionStorage.getItem('factor-range')||'null');if(range){const i=next.dates.indexOf(range.start),j=range.followEnd?Number(b.max):next.dates.indexOf(range.end);if(i>=0&&j>=i){a.value=i;b.value=j}}}catch{}}
  tableInitialized=true;a.disabled=b.disabled=next.dates.length===1;
 }else{tablePayload=null;tablePrefix=null;hourlyPrefix=null}
 restoreComparisonRange(previousComparison);restoreHourRanges();renderSnapshotView();
}
function sumTableRange(start,end,windowName='first'){
 if(!tablePayload||!tablePrefix)return [];
 const legacy=tablePayload.legacyFilter;
 if(legacy&&legacy.mode!=='all'&&snapshotKey(legacy)!==snapshotKey(viewFilter))return [];
 return tablePayload.inventories.flatMap((meta,i)=>{
  if(viewFilter.mode==='selection'&&!viewFilter.inventoryIds.includes(meta.id))return [];
  if(viewFilter.mode==='supervisor'&&meta.supervisor!==viewFilter.value||viewFilter.mode==='inventory'&&meta.id!==viewFilter.value)return [];
  const row={...meta},[from,to]=hourRange(windowName),stride=tablePayload.inventories.length*5;
  buckets.forEach((k,j)=>{
   if(!hourlyPrefix){row[k]=tablePrefix[end+1][i][j]-tablePrefix[start][i][j];return}
   row[k]=0;for(let hour=from;hour<=to;hour++)row[k]+=hourlyPrefix[hour][(end+1)*stride+i*5+j]-hourlyPrefix[hour][start*stride+i*5+j];
  });return [row];
 });
}
function fetchInventoryTable(){
 if(!tablePayload){$('tableRange').textContent='در انتظار اولین نسخه ذخیره‌شده جدول…';return}
 const a=Number($('tableStart').value),b=Number($('tableEnd').value);updateDualSlider();
 renderComparedTable(a,b);
 const timestamp=new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(tablePayload.fetchedAt*1000));
 $('tableRange').textContent+=` · داده ذخیره‌شده: ${timestamp}`;
 const legacy=tablePayload.legacyFilter;
 if(legacy&&legacy.mode!=='all'&&snapshotKey(legacy)!==snapshotKey(viewFilter))$('tableRange').textContent='جدول این محدوده هنوز در نسخه ذخیره‌شده موجود نیست.';
}
function loadInventoryTable(){cancelAnimationFrame(tableTimer);tableTimer=requestAnimationFrame(fetchInventoryTable)}
async function refreshPreparedSnapshot(quiet=false){
 if(snapshotReading)return;snapshotReading=true;
 try{
  const headers=snapshotETag?{'If-None-Match':snapshotETag}:{};
  const response=await fetch(publicSnapshotMode?'./snapshot.json':'/api/snapshot',{cache:'no-store',headers,signal:AbortSignal.timeout(15000)});
  if(response.status===304){$('status').classList.remove('error');$('status').textContent='آخرین نسخه ذخیره‌شده نمایش داده می‌شود.';return}
  if(response.status===202){$('status').textContent=snapshotBundle?'نمایش نسخه ذخیره‌شده؛ نسخه سرور هنوز آماده نیست.':'اولین نسخه در پس‌زمینه در حال آماده شدن است…';return}
  if(!response.ok)throw Error('snapshot unavailable');
  const bundle=await response.json();if(!validSnapshot(bundle))throw Error('invalid snapshot');
  snapshotETag=response.headers.get('ETag')||'';
  if(!snapshotBundle||bundle.version!==snapshotBundle.version){installSnapshot(bundle);saveBrowserSnapshot(bundle)}
  $('status').classList.remove('error');$('status').textContent=`آخرین دریافت از منابع: ${new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'short',timeStyle:'medium'}).format(new Date(bundle.fetchedAt*1000))} · نمایش نسخه ذخیره‌شده`;
 }catch{
  $('status').classList.add('error');$('status').textContent=snapshotBundle?'ارتباط با سرور برقرار نشد؛ آخرین داده ذخیره‌شده نمایش داده می‌شود.':'ارتباط با سرور برقرار نشد؛ اتصال را بررسی کنید.';
 }finally{snapshotReading=false}
}
for(const id of ['tableStart','tableEnd'])$(id).addEventListener('input',()=>{
 const a=$('tableStart'),b=$('tableEnd');if(Number(a.value)>Number(b.value)){if(id==='tableStart')b.value=a.value;else a.value=b.value}
 updateDualSlider();loadInventoryTable();
 if(tablePayload)try{sessionStorage.setItem('factor-range',JSON.stringify({start:tablePayload.dates[Number(a.value)],end:tablePayload.dates[Number(b.value)],followEnd:b.value===b.max}))}catch{}
});
window.addEventListener('resize',updateDualSlider);
const chartView={data:null,start:0,span:10,scale:1,latest:true,initialized:false,frame:0,drag:null,geometry:null};
function chartClamp(){
 const n=chartView.data?.days.length||1;chartView.span=Math.max(Math.min(3,n),Math.min(n,chartView.span));chartView.start=Math.max(0,Math.min(n-chartView.span,chartView.start));
 chartView.scale=Math.max(.15,Math.min(20,chartView.scale));
}
function chartSchedule(){cancelAnimationFrame(chartView.frame);chartView.frame=requestAnimationFrame(()=>paintInteractiveChart())}
function chartZoom(factor,anchor=.5){
 const position=chartView.start+(chartView.span-1)*anchor;chartView.span*=factor;chartClamp();chartView.start=position-(chartView.span-1)*anchor;chartClamp();chartView.latest=chartView.start>=chartView.data.days.length-chartView.span-.01;chartSchedule();
}
function renderInteractiveChart(data){
 const previousDate=chartView.data?.days[Math.floor(chartView.start)]?.date;
 chartView.data=data;
 if(!chartView.initialized){chartView.span=Math.max(3,Math.floor(($('plot').clientWidth||1000)/95));chartView.initialized=true}
 if(chartView.latest)chartView.start=data.days.length-chartView.span;
 else if(previousDate){const index=data.days.findIndex(day=>day.date===previousDate);if(index>=0)chartView.start=index+(chartView.start%1)}
 chartClamp();paintInteractiveChart();
}
function paintInteractiveChart(){
 const data=chartView.data;if(!data?.days.length)return;
 chartClamp();const svg=$('plot');svg.replaceChildren();$('tip').hidden=true;
 const W=svg.clientWidth||1000,H=400,L=18,R=W-84,T=30,B=326;
 svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
 const first=Math.floor(chartView.start),last=Math.min(data.days.length-1,Math.ceil(chartView.start+chartView.span-1));
 const visible=data.days.slice(first,last+1),maximum=Math.max(1,data.mean,data.selectedMean,...visible.flatMap(d=>[d.count,d.selectedCount]))*1.18*chartView.scale;
 const x=i=>chartView.span===1?(L+R)/2:L+20+(i-chartView.start)*(R-L-20*2)/(chartView.span-1),y=n=>B-n/maximum*(B-T);
 chartView.geometry={W,H,L,R,T,B,x,y};
 const add=(tag,attrs,parent=svg)=>el(tag,attrs,parent),text=(px,py,value,attrs={},parent=svg)=>{const node=add('text',{x:px,y:py,fill:'#bdcde6','font-size':11,...attrs},parent);node.textContent=value;return node};
 const defs=add('defs',{}),clip=add('clipPath',{id:'chart-window-clip'},defs);add('rect',{x:L,y:T,width:R-L,height:B-T},clip);
 const series=add('g',{'clip-path':'url(#chart-window-clip)'});
 for(let tick=0;tick<=4;tick++){const value=maximum*tick/4;add('line',{x1:L,x2:R,y1:y(value),y2:y(value),stroke:'#ffffff18'});text(R+12,y(value)+4,fmt(value))}
 for(const [value,color,title] of [[data.mean,'#d1a4ff','میانگین کل'],[data.selectedMean,'#ffad75','میانگین حامی']]){
  add('line',{x1:L,x2:R,y1:y(value),y2:y(value),stroke:color,'stroke-dasharray':'6 6'},series);
  text(L+8,Math.max(T+12,Math.min(B-5,y(value)-7)),`${title}: ${fmt(value)}`,{fill:color,'font-size':10},series);
 }
 const labelStep=Math.max(1,Math.ceil(64/((R-L)/Math.max(1,chartView.span-1))));
 for(const [field,color,cls,offset] of [['count','#82ffe3','total',-13],['selectedCount','#ffbd8c','selected',21]]){
  const path=visible.map((d,j)=>`${j?'L':'M'} ${x(first+j)} ${y(d[field])}`).join(' ');
  add('path',{class:cls+'-series',d:path,fill:'none',stroke:color,'stroke-width':2.5,'stroke-linejoin':'round'},series);
  visible.forEach((day,j)=>{
   const i=first+j,dot=add('circle',{class:cls+'-point',cx:x(i),cy:y(day[field]),r:day.today?5:3,fill:'#20324c',stroke:color,'stroke-width':2,tabindex:(x(i)>=L&&x(i)<=R)?0:-1,role:'img','aria-label':`${day.persian}: ${fmt(day[field])}`},series);
   dot.addEventListener('focus',()=>chartTooltip(i));dot.addEventListener('blur',()=>{$('tip').hidden=true});
   if(i%labelStep===0)text(x(i),y(day[field])+offset,fmt(day[field]),{class:cls+'-point-value',fill:color,'text-anchor':'middle','font-weight':700,stroke:'#20324c','stroke-width':3,'paint-order':'stroke'},series);
  });
 }
 for(let i=first;i<=last;i++){if(x(i)<L||x(i)>R||i%labelStep)continue;const day=data.days[i];text(x(i),B+23,fa(day.persian.slice(5)),{'text-anchor':'middle',fill:day.today?'#ffda92':'#bdcde6'})}
 const axisX=add('rect',{x:L,y:B+2,width:R-L,height:H-B-2,fill:'transparent',class:'chart-x-axis'});axisX.style.cursor='ew-resize';
 const axisY=add('rect',{x:R+1,y:T,width:W-R-1,height:B-T,fill:'transparent',class:'chart-y-axis'});axisY.style.cursor='ns-resize';
 text((L+R)/2,H-10,'↔ برای تغییر مقیاس زمان، محور را بکشید',{'text-anchor':'middle','font-size':10,fill:'#879bb7','pointer-events':'none'});
 const scroll=$('chartScroll');scroll.max=Math.max(0,data.days.length-chartView.span);scroll.value=chartView.start;scroll.disabled=Number(scroll.max)===0;
 $('chartWindow').textContent=`${data.days[Math.ceil(chartView.start)].persian} تا ${data.days[Math.min(data.days.length-1,Math.floor(chartView.start+chartView.span-1))].persian}`;
 scroll.setAttribute('aria-valuetext',$('chartWindow').textContent);
}
function chartTooltip(index){
 const data=chartView.data,day=data.days[index],previous=data.days[index-1];if(!day)return;
 drawHours(day,data);const tip=$('tip');tip.replaceChildren();
 for(const value of [day.persian,`کل فاکتورها: ${fmt(day.count)}`,`حاوی بارکد حامی: ${fmt(day.selectedCount)}`,`سهم حامی: ${share(day.selectedCount,day.count)}`,`کل نسبت به میانگین: ${percent(day.count,data.mean)}`,`حامی نسبت به میانگین: ${percent(day.selectedCount,data.selectedMean)}`,previous?`حامی نسبت به روز قبل: ${percent(day.selectedCount,previous.selectedCount)}`:'نخستین روز دوره',`منبع: ${source(day.source)} · از 00:00 تا ${data.windowEnd}`]){const line=document.createElement('div');line.textContent=value;tip.append(line)}
 tip.hidden=false;tip.style.top='80px';tip.style.left='20px';
}
function setupChartNavigation(){
 const svg=$('plot'),toolbar=document.createElement('div');toolbar.className='chart-navigation';
 for(const [id,title,action] of [
  ['chartZoomIn','بزرگ‌نمایی +',()=>chartZoom(.75)],['chartZoomOut','کوچک‌نمایی −',()=>chartZoom(1.35)],
  ['chartLatest','آخرین روزها',()=>{chartView.span=Math.max(3,Math.floor(svg.clientWidth/95));chartView.start=chartView.data.days.length-chartView.span;chartView.latest=true;chartView.scale=1;chartSchedule()}],
  ['chartAll','کل دوره',()=>{chartView.span=chartView.data.days.length;chartView.start=0;chartView.scale=1;chartView.latest=true;chartSchedule()}],
  ['chartAutoY','مقیاس خودکار ارتفاع',()=>{chartView.scale=1;chartSchedule()}]]){
  const button=document.createElement('button');button.type='button';button.id=id;button.textContent=title;button.addEventListener('click',()=>{if(chartView.data)action()});toolbar.append(button);
 }
 const status=document.createElement('span');status.id='chartWindow';status.className='note';toolbar.append(status);svg.before(toolbar);
 const scroll=document.createElement('input');scroll.type='range';scroll.id='chartScroll';scroll.min=scroll.max=scroll.value='0';scroll.step='.1';scroll.disabled=true;scroll.setAttribute('aria-label','پیمایش تاریخ نمودار');svg.after(scroll);
 const hint=document.createElement('div');hint.className='note';hint.textContent='کشیدن نمودار: جابه‌جایی روزها · چرخ ماوس: بزرگ‌نمایی · کشیدن محور راست: تغییر مقیاس ارتفاع · دوبار کلیک: بازنشانی';scroll.after(hint);
 scroll.addEventListener('input',()=>{chartView.start=Number(scroll.value);chartView.latest=chartView.start>=Number(scroll.max)-.01;chartSchedule()});
 svg.style.height='400px';svg.style.direction='ltr';svg.style.touchAction='pan-y';svg.style.userSelect='none';svg.style.cursor='grab';svg.setAttribute('tabindex','0');svg.setAttribute('aria-label','نمودار تعاملی؛ کلیدهای چپ و راست برای پیمایش، مثبت و منفی برای بزرگ‌نمایی');
 const point=e=>{const r=svg.getBoundingClientRect(),g=chartView.geometry;return {x:(e.clientX-r.left)*g.W/r.width,y:(e.clientY-r.top)*g.H/r.height}};
 svg.addEventListener('wheel',e=>{if(!chartView.data)return;e.preventDefault();const p=point(e),g=chartView.geometry,unit=e.deltaMode===1?16:e.deltaMode===2?400:1,dx=e.deltaX*unit,dy=e.deltaY*unit;if(e.shiftKey||Math.abs(dx)>Math.abs(dy)){chartView.start+=(dx||dy)*chartView.span/600;chartClamp();chartView.latest=false;chartSchedule()}else if(p.x>g.R){chartView.scale*=Math.exp(dy*.002);chartClamp();chartSchedule()}else chartZoom(Math.exp(Math.max(-1,Math.min(1,dy*.002))),Math.max(0,Math.min(1,(p.x-g.L)/(g.R-g.L))))},{passive:false});
 svg.addEventListener('pointerdown',e=>{if(!chartView.data||e.button!==0)return;const p=point(e),g=chartView.geometry;chartView.drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:chartView.start,span:chartView.span,scale:chartView.scale,mode:p.x>g.R?'y':p.y>g.B?'x':'pan'};try{svg.setPointerCapture(e.pointerId)}catch{}$('tip').hidden=true});
 svg.addEventListener('pointermove',e=>{
  if(!chartView.data)return;const drag=chartView.drag,g=chartView.geometry;
  if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
   if(drag.mode==='y')chartView.scale=drag.scale*Math.exp(dy/150);
   else if(drag.mode==='x'){const right=drag.start+drag.span;chartView.span=drag.span*Math.exp(-dx/200);chartClamp();chartView.start=right-chartView.span;chartView.latest=right>=chartView.data.days.length-.01}
   else{chartView.start=drag.start-dx*(drag.span-1)/(g.R-g.L);chartView.latest=false}
   chartClamp();chartSchedule();
  }else{const p=point(e);if(p.x>=g.L&&p.x<=g.R&&p.y>=g.T&&p.y<=g.B)chartTooltip(Math.max(0,Math.min(chartView.data.days.length-1,Math.round(chartView.start+(p.x-g.L)/(g.R-g.L)*(chartView.span-1)))));else $('tip').hidden=true}
 });
 const finish=e=>{if(chartView.drag?.id===e.pointerId){chartView.drag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId)}};
 svg.addEventListener('pointerup',finish);svg.addEventListener('pointercancel',finish);svg.addEventListener('lostpointercapture',()=>chartView.drag=null);svg.addEventListener('pointerleave',()=>{if(!chartView.drag)$('tip').hidden=true});
 svg.addEventListener('dblclick',()=>$('chartLatest').click());
 svg.addEventListener('keydown',e=>{if(!chartView.data)return;if(['ArrowLeft','ArrowRight','+','=','-','Home','End'].includes(e.key)){e.preventDefault();if(['+','='].includes(e.key))chartZoom(.75);else if(e.key==='-')chartZoom(1.35);else{chartView.start=e.key==='Home'?0:e.key==='End'?chartView.data.days.length-chartView.span:chartView.start+(e.key==='ArrowRight'?1:-1)*Math.max(1,chartView.span/4);chartClamp();chartView.latest=e.key==='End';chartSchedule()}}});
 new ResizeObserver(()=>{if(chartView.data)chartSchedule()}).observe(svg);
 const style=document.createElement('style');style.textContent='.chart-navigation{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:18px}.chart-navigation button{padding:7px 10px;border-radius:8px;background:#203752;color:#caeee8;font-size:11px;box-shadow:none}.chart-navigation button:before{display:none}.chart-navigation button:hover{transform:none;background:#30536a}#chartScroll{width:100%;direction:ltr;accent-color:#68dbc6;height:24px;margin:2px 0 8px}#plot{overflow:hidden}';document.head.append(style);
}
setupChartNavigation();setupComparison();setupTableSorting();
setupInventoryMultiselect();
restoreBrowserSnapshot();refresh();
if(publicSnapshotMode){
 document.querySelector('.automation').hidden=true;
 document.querySelector('.automation').style.display='none';
 $('refresh').removeEventListener('click',forceRefresh);
 $('refresh').addEventListener('click',()=>refresh());
 $('buttonText').textContent='بررسی بروزرسانی';
 setInterval(()=>refresh(true),60000);
}else{
 updateFetchStatus();setInterval(updateFetchStatus,3000);setInterval(()=>refresh(true),15000);setInterval(renderFetchStatus,1000);
}
