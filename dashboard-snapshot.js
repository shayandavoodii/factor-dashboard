// A snapshot is shared; view state belongs exclusively to this browser tab.
const publicSnapshotMode=document.documentElement.dataset.hosting==='github-pages';
let snapshotBundle=null,snapshotETag='',snapshotReading=false,tablePrefix=null;
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
 const hint=document.createElement('span');hint.className='note';hint.textContent='با کلیک روی هر ستون، می‌توانید مرتب سازی را مدیریت کنید.';
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
 if(tablePayload)for(const input of [a,b]){const date=tablePayload.dates[Number(input.value)];$(input.id+'Date').textContent=date;input.setAttribute('aria-valuetext',date)}
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
 if(!compare&&tableSort.some(s=>s.key.includes('_'))){tableSort=[];try{sessionStorage.setItem('factor-table-sort','[]')}catch{}}
 wireTableSorting();
}
function renderComparedTable(a,b){
 updateComparisonSlider();const c=Number($('compareStart').value),d=Number($('compareEnd').value),compare=a!==c||b!==d;
 comparisonHeaders(compare);
 const first=sumTableRange(a,b);
 if(!compare){renderInventoryTable({rows:sortTableRows(first),startDate:tablePayload.dates[a],endDate:tablePayload.dates[b]});return}
 const second=new Map(sumTableRange(c,d).map(row=>[row.id,row]));
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
    }else{value.className=key==='total'?'table-total':'comparison-count';value.textContent=fmt(n);if(!prefix)td.className='metric-first'}
    td.append(value);tr.append(td);
   }
  }
  fragment.append(tr);
 }
 if(!first.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=19;td.className='table-empty';td.textContent='برای این بازه و شعب انتخاب‌شده، داده‌ای وجود ندارد.';tr.append(td);fragment.append(tr)}
 $('inventoryTableBody').replaceChildren(fragment);$('tableRange').classList.remove('error');$('tableRange').textContent=`بازه اول: ${tablePayload.dates[a]} تا ${tablePayload.dates[b]} · بازه دوم: ${tablePayload.dates[c]} تا ${tablePayload.dates[d]}`;
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
  lastSaved=null;
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
  next.daily.forEach(day=>{const previous=tablePrefix.at(-1);tablePrefix.push(day.map((v,i)=>v.map((n,j)=>previous[i][j]+n)))});
  a.max=b.max=next.dates.length-1;a.value=Math.max(0,next.dates.indexOf(oldStart));b.value=followEnd?b.max:Math.max(Number(a.value),next.dates.indexOf(oldEnd));
  if(!tableInitialized){try{const range=JSON.parse(sessionStorage.getItem('factor-range')||'null');if(range){const i=next.dates.indexOf(range.start),j=range.followEnd?Number(b.max):next.dates.indexOf(range.end);if(i>=0&&j>=i){a.value=i;b.value=j}}}catch{}}
  tableInitialized=true;a.disabled=b.disabled=next.dates.length===1;
 }else{tablePayload=null;tablePrefix=null}
 restoreComparisonRange(previousComparison);renderSnapshotView();
}
function sumTableRange(start,end){
 if(!tablePayload||!tablePrefix)return [];
 const legacy=tablePayload.legacyFilter;
 if(legacy&&legacy.mode!=='all'&&snapshotKey(legacy)!==snapshotKey(viewFilter))return [];
 return tablePayload.inventories.flatMap((meta,i)=>{
  if(viewFilter.mode==='selection'&&!viewFilter.inventoryIds.includes(meta.id))return [];
  if(viewFilter.mode==='supervisor'&&meta.supervisor!==viewFilter.value||viewFilter.mode==='inventory'&&meta.id!==viewFilter.value)return [];
  const row={...meta};buckets.forEach((k,j)=>row[k]=tablePrefix[end+1][i][j]-tablePrefix[start][i][j]);return [row];
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
setupComparison();setupTableSorting();
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
