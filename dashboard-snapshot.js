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
try{const saved=JSON.parse(sessionStorage.getItem('factor-table-sort')||'null');for(const entry of Array.isArray(saved)?saved:saved?[saved]:[]){if(entry&&buckets.includes(entry.key)&&['ascending','descending'].includes(entry.direction)&&!tableSort.length)tableSort.push(entry)}}catch{}
function sortTableRows(rows){
 if(!tableSort.length)return rows;
 return [...rows].sort((a,b)=>{for(const {key,direction} of tableSort){const difference=(direction==='ascending'?1:-1)*((a[key]||0)-(b[key]||0));if(difference)return difference}return 0});
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
 const headers=document.querySelectorAll('.inventory-table thead th');
 ['low','mid','high','veryhigh','total'].forEach((key,i)=>{
  const header=headers[i+4],button=document.createElement('button'),arrow=document.createElement('span');
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
 renderSnapshotView();
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
 renderInventoryTable({rows:sortTableRows(sumTableRange(a,b)),startDate:tablePayload.dates[a],endDate:tablePayload.dates[b]});
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
setupTableSorting();
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
