const FIREWALL_BRANCH_META = [
  {id:"hosur", name:"Hosur", lat:12.7114447, lng:77.8550608, color:"#52E3B0", address:"No.606/2A, 2B, Maruthi Greenfields, Kasavugatta Village, Hosur, Tamil Nadu 635130"},
  {id:"chennai", name:"Chennai", lat:12.8756, lng:80.2084, color:"#4C8DFF", address:"Jones Cassia, 233/7, Ottiambakkam Main Road, Ottiambakkam, Chennai, Tamil Nadu 600130"},
  {id:"bangalore", name:"Bangalore", lat:12.8948, lng:77.6416, color:"#F5A623", address:"47/1A, 1B, Kudlu Gate, HSR Extension (South), Bengaluru, Karnataka 560068"}
];

// Firewall dashboard is NOT a separate/static data source anymore.
// It reads the same branch-separated Usage + Device Directory data used by
// Add Today's Data, Dashboard, Host Usage Dashboard and IP Directory.
let firewallBranches = FIREWALL_BRANCH_META.map(b => ({...b, usage:0, records:0, activeHosts:0, registeredHosts:0, users:0, peak:0, avg:0}));
let firewallAllBranchesEntry = {id:'all', name:'All Branches', color:'#7C93B3', usage:0, records:0, activeHosts:0, registeredHosts:0, users:0, peak:0, avg:0, usageRows:[], devices:[]};
let firewallTrend = {labels:[], hosur:[], chennai:[], bangalore:[]};
let firewallHostTable = [];

var __fwIpCache=new Map();
function isValidFirewallIP(value){
  const k=String(value||'');
  let r=__fwIpCache.get(k);
  if(r===undefined){ r=__isValidFirewallIPRaw(value); if(__fwIpCache.size>20000)__fwIpCache.clear(); __fwIpCache.set(k,r); }
  return r;
}
function __isValidFirewallIPRaw(value){
  const s=String(value||'').trim();
  if(!s || /^(other|others|f|unknown|n\/a|na|—|-)$/i.test(s)) return false;
  // IPv4
  const p=s.split('.');
  if(p.length===4 && p.every(x=>/^\d+$/.test(x) && Number(x)>=0 && Number(x)<=255)) return true;
  // Basic IPv6 acceptance
  return /^[0-9a-f:]+$/i.test(s) && s.includes(':');
}
function fwCleanIP(value){
  const s=String(value||'').trim();
  return isValidFirewallIP(s) ? s : '';
}

async function fwLoadBranchData(branchId){
  let branchUsage=[];
  let branchDevices=[];
  try{
    const u = await store.get(branchKeyFor(branchId, USAGE_KEY), true);
    branchUsage = u && u.value ? JSON.parse(u.value) : [];
  }catch(e){ branchUsage=[]; }
  try{
    const d = await store.get(branchKeyFor(branchId, DEVICE_KEY), true);
    branchDevices = d && d.value ? JSON.parse(d.value) : [];
  }catch(e){ branchDevices=[]; }
  // ALL rows count toward usage totals (this includes the firewall's "Others"
  // bucket = traffic not tied to one host), so the totals match the sidebar,
  // Dashboard and Host Usage pages. Only rows with a real IP count as hosts.
  const allRows = Array.isArray(branchUsage)
    ? branchUsage
        .filter(x=>x)
        .map(x=>({...x, bytesGB:Number(x.bytesGB ?? x.gb ?? 0) || 0}))
        .filter(x=>x.bytesGB>0)
    : [];
  const usageRows = allRows
    .filter(x=>isValidFirewallIP(x.ip))
    .map(x=>({...x, ip:fwCleanIP(x.ip)}));
  const usage = allRows.reduce((sum,r)=>sum+Number(r.bytesGB||0),0);
  const ips = [...new Set(usageRows.map(r=>r.ip).filter(isValidFirewallIP))];
  const activeHosts = ips.length;
  // Registered = unique real IPs in the Device Directory. CSV imports auto-add
  // placeholder rows ("Unmapped Host", "Sophos source IP", the firewall aggregate)
  // and the same IP can be listed twice, which used to inflate this number.
  const isPlaceholderDevice = d => /^(unmapped host|sophos source ip)$/i.test(String(d?.name||'').trim())
    || String(d?.ip||'').trim()==='sophos-firewall-aggregate';
  const registeredIpSet = new Set(
    (Array.isArray(branchDevices)?branchDevices:[])
      .filter(d=>d && !isPlaceholderDevice(d))
      .map(d=>fwCleanIP(d.ip).toLowerCase())
      .filter(Boolean)
  );
  const registeredHosts = registeredIpSet.size;
  const unmappedActive = ips.filter(ip=>!registeredIpSet.has(String(ip).toLowerCase())).length;
  const userSet = new Set();
  ips.forEach(ip=>{
    const d=branchDevices.find(x=>String(x?.ip||'').trim().toLowerCase()===String(ip).trim().toLowerCase());
    if(d && (d.username || d.name || d.hostname)) userSet.add(d.username || d.name || d.hostname);
  });
  const peakRow = allRows.reduce((best,r)=>!best || Number(r.bytesGB)>Number(best.bytesGB) ? r : best, null);
  const peak = peakRow ? Number(peakRow.bytesGB||0) : 0;
  return {
    usageRows,
    allRows,
    devices:branchDevices,
    usage,
    records:allRows.length,
    activeHosts,
    registeredHosts,
    unmappedActive,
    users:userSet.size,
    peak,
    avg:allRows.length ? usage/allRows.length : 0
  };
}

function branchKeyFor(branchId, base){ return `${base}::${branchId}`; }

async function refreshFirewallData(){
  const realBranchDefs = BRANCHES.filter(br=>br.id!=='all');
  const results = await Promise.all(realBranchDefs.map(async br=>{
    const data=await fwLoadBranchData(br.id);
    const meta=FIREWALL_BRANCH_META.find(x=>x.name.toLowerCase()===br.label.toLowerCase()) || {name:br.label};
    return {...meta, ...data, id:br.id};
  }));

  // Firewall metrics use the exact branch values read from Firebase; no synthetic scaling is applied.

  // "All Branches" is not a real branch with its own stored data — it's the
  // combined total of Chennai + Bangalore + Hosur. Build it here instead of
  // leaving it at 0.
  const allUsageRows = results.flatMap(b=>b.usageRows || []);
  const allDevices = results.flatMap(b=>b.devices || []);
  const allIps = [...new Set(allUsageRows.map(r=>r.ip).filter(Boolean))];
  const allUserSet = new Set();
  allIps.forEach(ip=>{
    const d=allDevices.find(x=>fwCleanIP(x?.ip).toLowerCase()===String(ip).toLowerCase());
    if(d && (d.username || d.name || d.hostname)) allUserSet.add(d.username || d.name || d.hostname);
  });
  const allEveryRow = results.flatMap(b=>b.allRows || []);
  const allPeakRow = allEveryRow.reduce((best,r)=>!best || Number(r.bytesGB)>Number(best.bytesGB) ? r : best, null);
  const allUsage = allEveryRow.reduce((s,r)=>s+Number(r.bytesGB||0),0);
  const allEntry = {
    id:'all', name:'All Branches', color:'#7C93B3',
    usageRows:allUsageRows, devices:allDevices,
    usage:allUsage,
    records:allEveryRow.length,
    activeHosts:allIps.length,
    registeredHosts:results.reduce((s,b)=>s+(b.registeredHosts||0),0),
    unmappedActive:results.reduce((s,b)=>s+(b.unmappedActive||0),0),
    users:allUserSet.size,
    peak:allPeakRow?Number(allPeakRow.bytesGB||0):0,
    avg:allEveryRow.length ? allUsage/allEveryRow.length : 0
  };

  firewallBranches=results;
  firewallAllBranchesEntry=allEntry;

  const trendLabels=[];
  const allDates=new Set();
  results.forEach(b=>(b.allRows||[]).forEach(r=>{ if(r.date) allDates.add(r.date); }));
  const dates=[...allDates].sort().slice(-14);
  dates.forEach(d=>{
    const dt=new Date(d+'T00:00:00');
    trendLabels.push(dt.toLocaleDateString(undefined,{month:'short',day:'numeric'}));
  });
  firewallTrend={labels:trendLabels,hosur:[],chennai:[],bangalore:[]};
  results.forEach(b=>{
    const key=b.name.toLowerCase();
    if(!firewallTrend[key]) firewallTrend[key]=[];
    firewallTrend[key]=dates.map(d=>(b.allRows||[]).filter(r=>r.date===d).reduce((sum,r)=>sum+Number(r.bytesGB||0),0));
  });

  // In All Branches mode show records from Chennai, Bangalore and Hosur together.
  // In a branch mode show only the selected branch.
  const hostSources = firewallMode==='all'
    ? results
    : results.filter(b=>b.id===firewallSelectedBranch);

  firewallHostTable = hostSources.flatMap(branch => (branch.usageRows||[]).map(r=>{
    // Prefer username carried by the usage record itself; otherwise resolve
    // it from the branch + IP device directory. This makes the Firewall
    // "Top usage records" table show the username whenever either source has it.
    const ip = fwCleanIP(r.ip);
    // Device Directory is the source of truth for the host name:
    // IP from firewall usage -> matching Device Directory entry -> Name.
    // Never use the IP itself as the Host name.
    const d=(branch.devices||[]).find(x=>
      fwCleanIP(x?.ip).toLowerCase()===ip.toLowerCase()
    ) || (Array.isArray(devices) ? devices.find(x=>
      fwCleanIP(x?.ip).toLowerCase()===ip.toLowerCase() &&
      normalizeBranchId(x?.branch||branch.name)===normalizeBranchId(branch.name)
    ) : null);
    const hostName = d?.name || d?.hostname || d?.deviceName || r?.host || r?.hostname || 'Not mapped';
    const user = r?.username || r?.user || r?.userName || d?.username || d?.user || '—';
    return {
      host:hostName,
      ip:ip || '—',
      user,
      branch:branch.name,
      date:r.date||'—',
      gb:Number(r.bytesGB||0)
    };
  }));
}

let fwCharts = {};
let fwMap = null;
let fwMapMarkers = [];
let fwInitialized = false;

function fwBranchForCurrent(){
  if(currentUser && currentUser.role !== 'administrator'){
    firewallMode = 'branch';
    firewallSelectedBranch = String(currentUser.branch || firewallSelectedBranch || 'chennai').toLowerCase();
  }

  if(firewallMode==='all' && currentUser && currentUser.role === 'administrator'){
    const rows = firewallBranches.flatMap(b=>b.usageRows || []);
    const everyRow = firewallBranches.flatMap(b=>b.allRows || []);
    const devices = firewallBranches.flatMap(b=>b.devices || []);
    const usage = firewallBranches.reduce((s,b)=>s + Number(b.usage||0),0);
    const ips = [...new Set(rows.map(r=>fwCleanIP(r.ip)).filter(Boolean))];
    const users = new Set();
    ips.forEach(ip=>{
      const d=devices.find(x=>x.ip===ip);
      if(d && (d.username || d.name)) users.add(d.username || d.name);
    });
    const peakRow = everyRow.reduce((best,r)=>!best || Number(r.bytesGB)>Number(best.bytesGB) ? r : best,null);
    return {
      id:'all', name:'All Branches', usage, records:everyRow.length,
      activeHosts:ips.length, registeredHosts:firewallBranches.reduce((s,b)=>s+Number(b.registeredHosts||0),0),
      users:users.size, peak:peakRow?Number(peakRow.bytesGB||0):0,
      avg:everyRow.length?usage/everyRow.length:0, usageRows:rows, allRows:everyRow, devices
    };
  }
  return firewallBranches.find(b=>b.id===firewallSelectedBranch) || firewallBranches[0];
}

function fwFmt(n){
  return Number(n || 0).toLocaleString(undefined, {maximumFractionDigits: 0});
}

function fwFmt1(n){
  return Number(n || 0).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1});
}

// Sets a firewall KPI tile's number + unit span together, switching the
// unit to TB (and skipping the count-up animation) once usage crosses 1000 GB.
function fwSetUsageStat(valueId, unitId, gbValue, decimals=0){
  const valEl=document.getElementById(valueId);
  const unitEl=document.getElementById(unitId);
  if(!valEl) return;
  gbValue = Number(gbValue) || 0;
  if(gbValue >= 1000){
    if(unitEl) unitEl.textContent='TB';
    valEl.textContent=(gbValue/1024).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  }else{
    if(unitEl) unitEl.textContent='GB';
    fwCountUp(valueId, gbValue, decimals);
  }
}

function fwCountUp(id,target,decimals=0){
  const el=document.getElementById(id); if(!el) return;
  const value=Number(target)||0;
  el.textContent=decimals?value.toFixed(decimals):Math.round(value).toLocaleString();
}

function fwDestroyCharts(){
  Object.values(fwCharts).forEach(c=>{try{c.destroy();}catch(e){}});
  fwCharts={};
}

// Real interactive geographic map using live vector map tiles.
// The map is not an image; it supports pan, zoom, pitch and branch popups.
let fwMapZoom = 1;
function fwApplyMapZoom(){
  const layer=document.getElementById('fwMapLayer');
  if(layer) layer.style.transform = `scale(${fwMapZoom})`;
}
function fwRenderMap(attempt){
  attempt = attempt || 0;
  const mapEl=document.getElementById('fwMap');
  if(!mapEl) return;
  const rect=mapEl.getBoundingClientRect();
  if((rect.width<10 || rect.height<10) && attempt<20){
    requestAnimationFrame(()=>fwRenderMap(attempt+1));
    return;
  }

  if(typeof maplibregl==='undefined'){
    mapEl.innerHTML='<div style="height:100%;display:grid;place-items:center;color:var(--muted);font-size:13px;padding:20px;text-align:center">Loading interactive map…</div>';
    if(window.__loadMapLibre){
      window.__loadMapLibre().then(()=>fwRenderMap(0)).catch(()=>{ mapEl.innerHTML='<div style="height:100%;display:grid;place-items:center;color:var(--muted);font-size:13px;padding:20px;text-align:center">Map service unavailable. Dashboard data is still available.</div>'; });
    }
    return;
  }

  const visibleBranches = firewallMode==='all'
    ? firewallBranches.filter(b=>b && Number.isFinite(b.lat) && Number.isFinite(b.lng))
    : firewallBranches.filter(b=>b && b.id===firewallSelectedBranch && Number.isFinite(b.lat) && Number.isFinite(b.lng));
  if(!visibleBranches.length) return;
  const mapKey = firewallMode+'|'+firewallSelectedBranch+'|'+visibleBranches.map(b=>b.id).join(',');
  if(fwMap && fwMap.__nocMapKey===mapKey){
    try{fwMap.resize();}catch(e){}
    return;
  }
  if(fwMap && typeof fwMap.remove==='function'){
    try{fwMap.remove();}catch(e){}
  }
  fwMap=null;
  fwMapMarkers=[];
  mapEl.innerHTML='';
  mapEl.style.position='relative';
  mapEl.style.overflow='hidden';
  mapEl.style.background='var(--panel-alt)';

  const realBranches=firewallBranches.filter(b=>b && Number.isFinite(b.lat) && Number.isFinite(b.lng));
  const center=visibleBranches.length===1
    ? [visibleBranches[0].lng,visibleBranches[0].lat]
    : [realBranches.reduce((sum,b)=>sum+b.lng,0)/realBranches.length, realBranches.reduce((sum,b)=>sum+b.lat,0)/realBranches.length];

  // OpenFreeMap gives a real interactive map style without requiring a private API key.
  // The high pitch/bearing creates a 3D perspective and the building layer adds depth.
  fwMap = new maplibregl.Map({
    container:mapEl,
    style:'https://tiles.openfreemap.org/styles/dark',
    center,
    zoom:visibleBranches.length===1 ? 15.2 : 8.4,
    pitch:visibleBranches.length===1 ? 68 : 62,
    bearing:-24,
    maxPitch:85,
    antialias:true,
    attributionControl:true,
    // Real geographic map projection while keeping the existing map UI.
    projection:{type:'mercator'}
  });
  fwMap.__nocMapKey=mapKey;
  fwMap.on('error',ev=>{
    if(ev && ev.error) console.warn('Real map tile/style error:', ev.error);
  });

  fwMap.addControl(new maplibregl.NavigationControl({showCompass:true,visualizePitch:true}),'top-left');
  fwMap.addControl(new maplibregl.FullscreenControl(),'top-right');

  // Network-based overlay: keeps the real 3D geographic map while drawing
  // branch-to-NOC links, animated traffic paths, and live branch labels.
  const netSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  netSvg.classList.add('fw-network-overlay');
  netSvg.setAttribute('aria-label','Network topology overlay connecting the branch locations');
  mapEl.appendChild(netSvg);
  const netBadge=document.createElement('div');
  netBadge.className='fw-network-badge';
  netBadge.textContent='NETWORK TOPOLOGY · LIVE BRANCH LINKS';
  mapEl.appendChild(netBadge);
  const ns='http://www.w3.org/2000/svg';
  const makeSvg=(tag,attrs={})=>{const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));return e;};
  const netGroup=makeSvg('g'); netSvg.appendChild(netGroup);
  const netRefresh=()=>{
    if(!fwMap || !netSvg.isConnected) return;
    const w=mapEl.clientWidth,h=mapEl.clientHeight;
    netSvg.setAttribute('viewBox',`0 0 ${w} ${h}`);
    netGroup.innerHTML='';
    const pts=visibleBranches.map(b=>({b,p:fwMap.project([b.lng,b.lat])}));
    if(!pts.length) return;
    const cx=pts.reduce((a,x)=>a+x.p.x,0)/pts.length;
    const cy=pts.reduce((a,x)=>a+x.p.y,0)/pts.length-55;
    const noc=makeSvg('g');
    noc.appendChild(makeSvg('circle',{cx,cy,r:18,fill:'#101d34',stroke:'#b9d4ff','stroke-width':2}));
    noc.appendChild(makeSvg('circle',{cx,cy,r:10,fill:'#4c8dff',opacity:.9}));
    noc.appendChild(makeSvg('path',{d:`M ${cx-6} ${cy} h12 M ${cx} ${cy-6} v12`,stroke:'#fff','stroke-width':2,'stroke-linecap':'round'}));
    const nl=makeSvg('text',{x:cx,y:cy+34,'text-anchor':'middle',class:'net-label'});nl.textContent='NOC CORE';noc.appendChild(nl);netGroup.appendChild(noc);
    // Inter-branch backbone: connect every branch to the other two so the
    // All Branches view looks like one shared network topology, not isolated pins.
    for(let a=0;a<pts.length;a++){
      for(let d=a+1;d<pts.length;d++){
        const p1=pts[a].p,p2=pts[d].p;
        const midX=(p1.x+p2.x)/2, midY=(p1.y+p2.y)/2-26;
        const branchPath=`M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`;
        netGroup.appendChild(makeSvg('path',{d:branchPath,class:'net-link inter-branch',stroke:'#73b8ff'}));
        const packet=makeSvg('circle',{cx:p1.x+(p2.x-p1.x)*.5,cy:p1.y+(p2.y-p1.y)*.5-13,r:2.6,fill:'#d9f5ff',class:'net-packet'});
        packet.style.animationDelay=((a+d)*.4)+'s';
        netGroup.appendChild(packet);
      }
    }
    pts.forEach(({b,p},i)=>{
      const bendX=(p.x+cx)/2+(i%2?18:-18), bendY=(p.y+cy)/2-18;
      const path=`M ${cx} ${cy} Q ${bendX} ${bendY} ${p.x} ${p.y}`;
      netGroup.appendChild(makeSvg('path',{d:path,class:'net-link',stroke:b.color||'#4c8dff'}));
      netGroup.appendChild(makeSvg('path',{d:`M ${p.x} ${p.y} Q ${p.x+(cx-p.x)*.55} ${p.y+(cy-p.y)*.55+22} ${cx} ${cy}`,class:'net-link secondary',stroke:b.color||'#4c8dff'}));
      for(let k=0;k<2;k++){
        const t=makeSvg('circle',{cx:p.x+(cx-p.x)*(k+.35)/2,cy:p.y+(cy-p.y)*(k+.35)/2,r:3,fill:b.color||'#4c8dff',class:'net-packet'});
        t.style.animationDelay=(i*.35+k*.6)+'s';netGroup.appendChild(t);
      }
      const ring=makeSvg('circle',{cx:p.x,cy:p.y,r:27,fill:'none',stroke:b.color||'#4c8dff','stroke-width':1.5,opacity:.75});netGroup.appendChild(ring);
      const text=makeSvg('text',{x:p.x,y:p.y-35,'text-anchor':'middle',class:'net-label'});text.textContent=b.name.toUpperCase();netGroup.appendChild(text);
      const sub=makeSvg('text',{x:p.x,y:p.y-22,'text-anchor':'middle',class:'net-sub'});sub.textContent=`${Number(b.activeHosts||0)} HOSTS · ${fmtGB(b.usage)}`;netGroup.appendChild(sub);
    });
  };
  fwMap.on('load',netRefresh);
  fwMap.on('move',netRefresh);
  fwMap.on('zoom',netRefresh);
  fwMap.on('resize',netRefresh);

  const addDepthBuildings=()=>{
    try{
      if(!fwMap.getLayer('3d-buildings') && fwMap.getSource('openmaptiles')){
        fwMap.addLayer({
          id:'3d-buildings',
          source:'openmaptiles',
          'source-layer':'building',
          type:'fill-extrusion',
          minzoom:14,
          paint:{
            'fill-extrusion-color':'#8c9caf',
            'fill-extrusion-height':['coalesce',['get','render_height'],['get','height'],8],
            'fill-extrusion-base':['coalesce',['get','render_min_height'],['get','min_height'],0],
            'fill-extrusion-opacity':0.72
          }
        });
      }
    }catch(e){/* style may use a different source-layer; map remains usable */}
  };
  fwMap.once('load',()=>{
    // Add real elevation terrain for a tilted 3D geographic background.
    // The base map remains OpenFreeMap, while the DEM adds depth and relief.
    try{
      // Optional elevation layer. The real vector map remains usable if the DEM provider is unavailable.
      if(!fwMap.getSource('network-terrain-dem')){
        fwMap.addSource('network-terrain-dem',{type:'raster-dem',url:'https://demotiles.maplibre.org/terrain-tiles/tiles.json',tileSize:256,maxzoom:12});
      }
      fwMap.setTerrain({source:'network-terrain-dem',exaggeration:1.15});
      if(!fwMap.getLayer('network-hillshade')){
        fwMap.addLayer({
          id:'network-hillshade',
          type:'hillshade',
          source:'network-terrain-dem',
          paint:{'hillshade-exaggeration':0.35,'hillshade-shadow-color':'#142238','hillshade-highlight-color':'#b7c9df'}
        }, fwMap.getLayer('3d-buildings') ? '3d-buildings' : undefined);
      }
      fwMap.setSky({
        'sky-color':'#0a1427',
        'sky-horizon-blend':0.35,
        'horizon-color':'#263b58',
        'horizon-fog-blend':0.12,
        'fog-color':'#0b1629',
        'fog-ground-blend':0.18
      });
    }catch(e){ console.warn('3D terrain unavailable; keeping 3D perspective map.',e); }
    addDepthBuildings();
    if(visibleBranches.length>1){
      const bounds=new maplibregl.LngLatBounds();
      visibleBranches.forEach(b=>bounds.extend([b.lng,b.lat]));
      fwMap.fitBounds(bounds,{padding:70,maxZoom:9,duration:900,pitch:62,bearing:-24});
    }
    // When All Branches is selected, the map always presents one shared NOC core
    // with three connected branch paths and animated network packets.
    netRefresh();
  });

  const maxUsage=Math.max(1,...realBranches.map(b=>Number(b.usage)||0));
  visibleBranches.forEach(b=>{
    const radius=22+Math.round(((Number(b.usage)||0)/maxUsage)*8);
    const el=document.createElement('div');
    el.className='fw-3d-map-marker';
    el.style.setProperty('--marker',b.color||'#4C8DFF');
    el.style.width=radius*2+'px';
    el.style.height=radius*2+'px';
    el.innerHTML='<span class="fw-3d-marker-ring"></span><span class="fw-3d-marker-core"></span><span class="fw-3d-marker-label">'+b.name+'</span>';
    el.title=`${b.name} Branch — ${fmtGB(b.usage)}`;
    el.addEventListener('click',async()=>{
      if(firewallMode==='all' && BRANCHES.some(x=>x.id===b.id)) await openFirewallBranch(b.id);
    });
    const popup=new maplibregl.Popup({offset:22,maxWidth:'260px'}).setHTML(
      `<div style="font-family:Inter,Arial,sans-serif;color:#172033"><b>${b.name} Branch</b><br><span>Usage: ${fmtGB(b.usage)}</span><br><span>Active hosts: ${b.activeHosts}</span><br><span>Users: ${b.users}</span><br><span style=\"font-size:11px;color:#5b6577\">${b.address||''}</span></div>`
    );
    const marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([b.lng,b.lat]).setPopup(popup).addTo(fwMap);
    fwMapMarkers.push(marker);
  });
}
function fwRenderBranchSwitcher(){
  const wrap=document.getElementById('fwBranchSwitcher');
  if(!wrap) return;
  const current=fwBranchForCurrent();
  const preferredOrder = ['chennai','bangalore','hosur'];
  const ordered = preferredOrder.map(id=>firewallBranches.find(b=>b.id===id)).filter(Boolean);
  const buttons = [
    {id:'all', name:'All Branches'},
    ...ordered.map(b=>({id:b.id,name:b.name}))
  ];
  wrap.innerHTML=buttons.map(b=>{
    const active = b.id==='all' ? firewallMode==='all' : firewallMode==='branch' && b.id===firewallSelectedBranch;
    return `<button type="button" class="fw-branch-btn ${active?'active':''}" data-fw-switch="${b.id}">${b.name}</button>`;
  }).join('');

  const exportBtn=document.getElementById('fwExportDataBtn');
  if(exportBtn) exportBtn.textContent = firewallMode==='all' ? '⬇ Download All Branches JSON' : '⬇ Export JSON Data';

  wrap.querySelectorAll('[data-fw-switch]').forEach(btn=>btn.addEventListener('click',async ()=>{
    const id=btn.dataset.fwSwitch;
    if(id==='all'){
      if(firewallMode!=='all') await openFirewallAll();
      return;
    }
    if(!id || !BRANCHES.some(b=>b.id===id)) return;
    if(firewallMode==='branch' && firewallSelectedBranch===id) return;
    await openFirewallBranch(id);
  }));
}

function fwRenderBranchTable(){
  const current=fwBranchForCurrent();
  const body=document.getElementById('fwBranchTable');
  body.innerHTML=firewallBranches.map(b=>{
    const cls=b.name.toLowerCase()===current.name.toLowerCase()?'fw-selected':'';
    const chip='fw-'+b.name.toLowerCase();
    return `<tr class="${cls}" data-fw-branch="${b.name.toLowerCase()}">
      <td><span class="fw-chip ${chip}">${b.name}</span></td>
      <td title="${b.unmappedActive||0} active IPs are not in the Device Directory">${b.activeHosts}</td><td>${b.registeredHosts}</td><td>${b.users}</td>
      <td>${fmtGB(b.usage)}</td><td>${fmtGB(b.peak)}</td><td>${fmtGB(b.avg)}</td>
    </tr>`;
  }).join('');
  let note=document.getElementById('fwUnmappedNote');
  if(!note){
    note=document.createElement('div');
    note.id='fwUnmappedNote';
    note.className='fw-note';
    note.style.marginTop='10px';
    body.closest('.fw-table-scroll').insertAdjacentElement('afterend',note);
  }
  const gaps=firewallBranches.filter(b=>(b.unmappedActive||0)>0);
  note.textContent=gaps.length
    ? 'Data check: '+gaps.map(b=>`${b.name} has ${b.unmappedActive} active IPs with usage that are not in the Device Directory (so Registered < Active and their Users are unknown).`).join(' ')
    : 'Data check: every active IP is registered in the Device Directory.';
  if(firewallMode==='all'){
    const a=fwBranchForCurrent();
    body.insertAdjacentHTML('beforeend',`<tr class="fw-selected">
      <td><b>All Branches</b></td>
      <td>${a.activeHosts}</td><td>${a.registeredHosts}</td><td>${a.users}</td>
      <td>${fmtGB(a.usage)}</td><td>${fmtGB(a.peak)}</td><td>${fmtGB(a.avg)}</td>
    </tr>`);
  }
  body.querySelectorAll('tr[data-fw-branch]').forEach(tr=>tr.addEventListener('click',()=>{
    const id=tr.dataset.fwBranch;
    if(firewallSelectedBranch!==id) openFirewallBranch(id);
  }));
}

function fwRenderCharts(){
  const current=fwBranchForCurrent();
  fwDestroyCharts();
  const gridColor=getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#253248';
  const textColor=getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#8794A8';

  fwCharts.branch=new Chart(document.getElementById('fwBranchBar'),{
    type:'bar',
    data:{labels:firewallBranches.map(b=>b.name),datasets:[{label:'Usage (GB)',data:firewallBranches.map(b=>b.usage),backgroundColor:firewallBranches.map(b=>b.color),borderRadius:4,barThickness:46}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:0},plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:textColor}},y:{grid:{color:gridColor},ticks:{color:textColor},beginAtZero:true}}}
  });

  const allTrendTotals = [
    firewallTrend.hosur.reduce((sum,v)=>sum+Number(v||0),0),
    firewallTrend.chennai.reduce((sum,v)=>sum+Number(v||0),0),
    firewallTrend.bangalore.reduce((sum,v)=>sum+Number(v||0),0)
  ];

  const branchIndex = {hosur:0, chennai:1, bangalore:2};
  const branchColors = {hosur:'#52E3B0', chennai:'#4C8DFF', bangalore:'#F5A623'};
  const branchNames = {hosur:'Hosur', chennai:'Chennai', bangalore:'Bangalore'};
  const trendIds = firewallMode === 'branch' && branchIndex[firewallSelectedBranch] !== undefined
    ? [firewallSelectedBranch] : ['hosur','chennai','bangalore'];
  const trendTotals = trendIds.map(id => allTrendTotals[branchIndex[id]]);
  const trendLabels = trendIds.map(id => branchNames[id]);
  const trendColors = trendIds.map(id => branchColors[id]);
  const fwTrendTotal = trendTotals.reduce((sum,v)=>sum+Number(v||0),0);
  const trendTitle = document.getElementById('fwTrendTitle');
  const trendTag = document.getElementById('fwTrendTag');
  if(trendTitle) trendTitle.childNodes[0].textContent = firewallMode==='branch' ? `14-day usage — ${branchNames[firewallSelectedBranch]}` : '14-day usage by branch';
  if(trendTag) trendTag.textContent = firewallMode==='branch' ? `Auto unit · ${branchNames[firewallSelectedBranch]}` : 'Auto unit · total';

  fwCharts.trend=new Chart(document.getElementById('fwTrendLine'),{
    type:'doughnut',
    data:{
      labels:trendLabels,
      datasets:[{
        data:trendTotals,
        backgroundColor:trendColors,
        borderWidth:3,
        borderColor:getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#111B2D',
        hoverOffset:8
      }]
    },
    plugins:[{
      id:'fwTrendCenterTotal',
      afterDraw(chart){
        const meta=chart.getDatasetMeta(0);
        if(!meta || !meta.data || !meta.data.length) return;
        const x=meta.data[0].x, y=meta.data[0].y;
        const ctx=chart.ctx;
        ctx.save();
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.fillStyle='#E5EDF8';
        ctx.font='700 21px Inter, sans-serif';
        ctx.fillText(fmtGB(fwTrendTotal),x,y-7);
        ctx.fillStyle='#8EA0BA';
        ctx.font='600 10px Inter, sans-serif';
        ctx.letterSpacing='1px';
        ctx.fillText(firewallMode==='branch' ? `${branchNames[firewallSelectedBranch].toUpperCase()} USAGE` : 'TOTAL USAGE',x,y+13);
        ctx.restore();
      }
    }],
    options:{
      responsive:true,
      maintainAspectRatio:false,
      cutout:'62%',
      animation:{duration:0},
      plugins:{
        legend:{position:'top',align:'start',labels:{color:textColor,boxWidth:10,font:{size:11},padding:14}},
        tooltip:{callbacks:{label:(ctx)=>` ${ctx.label}: ${fmtGB(Number(ctx.raw||0))}`}}
      }
    }
  });

  fwCharts.coverage=new Chart(document.getElementById('fwCoverageBar'),{
    type:'bar',
    data:{labels:firewallBranches.map(b=>b.name),datasets:[
      {label:'Registered hosts',data:firewallBranches.map(b=>b.registeredHosts),backgroundColor:'#64748B',borderRadius:4,barThickness:22},
      {label:'Active hosts',data:firewallBranches.map(b=>b.activeHosts),backgroundColor:firewallBranches.map(b=>b.color),borderRadius:4,barThickness:22}
    ]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:{duration:0},plugins:{legend:{position:'top',align:'start',labels:{color:textColor,boxWidth:10,font:{size:11}}}},scales:{x:{grid:{color:gridColor},ticks:{color:textColor},beginAtZero:true},y:{grid:{display:false},ticks:{color:textColor}}}}
  });
}

function fwRenderHostTable(){
  const hostTitle=document.querySelector('#fwHostTable')?.closest('.fw-panel')?.querySelector('.fw-panel-title .fw-tag');
  if(hostTitle) hostTitle.textContent = firewallMode==='all' ? 'all branches' : 'selected branch';
  const rows=firewallHostTable
    .filter(h=>isValidFirewallIP(h.ip))
    .map(h=>({
      ...h,
      host: h.host && h.host !== h.ip ? h.host : 'Not mapped'
    }))
    .sort((a,b)=>b.gb-a.gb);
  const body=document.getElementById('fwHostTable');
  const tag=document.querySelector('#view-firewall .fw-panel-title:last-of-type .fw-tag');
  if(!rows.length){
    body.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--muted);">No firewall host records available for this branch.</td></tr>';
    return;
  }
  const maxGb=Math.max(...rows.map(h=>h.gb),1);
  const colorMap={Hosur:'#52E3B0',Chennai:'#4C8DFF',Bangalore:'#F5A623'};
  body.innerHTML=rows.slice(0,400).map(h=>`<tr>
    <td>${h.host}</td><td class="mono">${h.ip}</td><td>${h.user}</td><td><span class="fw-chip fw-${h.branch.toLowerCase()}">${h.branch}</span></td><td>${h.date}</td>
    <td>${fmtGB(h.gb)}<div style="height:5px;background:rgba(255,255,255,.06);margin-top:4px;border-radius:3px;overflow:hidden;"><div style="height:100%;width:${(h.gb/maxGb*100).toFixed(0)}%;background:${colorMap[h.branch]||'#4C8DFF'};"></div></div></td>
    <td>${ipStatusBadgeHtml(h.ip)}</td>
  </tr>`).join('') + (rows.length>400 ? '<tr><td colspan="7" style="text-align:center;color:var(--muted);">Showing top 400 of '+rows.length+' rows (highest usage first)</td></tr>' : '');
}

async function fwCollectBranchPackage(branchId){
  const br = BRANCHES.find(x=>x.id===branchId);
  if(!br) throw new Error('Unknown branch');
  const readKey = async (base, fallback) => {
    try{
      const r = await store.get(branchKeyFor(branchId, base), true);
      return (r && r.value != null) ? JSON.parse(String(r.value)) : fallback;
    }catch(e){ return fallback; }
  };
  let fixedHosts = 1500;
  try{
    const r = await store.get(branchKeyFor(branchId, FIXEDHOSTS_KEY), true);
    if(r && r.value != null) fixedHosts = Number(r.value) || 1500;
  }catch(e){}
  return {
    format: 'NOC Firewall Branch Data',
    version: 1,
    exportedAt: new Date().toISOString(),
    branch: { id: br.id, name: br.label },
    data: {
      devices: await readKey(DEVICE_KEY, []),
      usage: await readKey(USAGE_KEY, []),
      appUsage: await readKey(APPUSAGE_KEY, []),
      fixedHosts
    }
  };
}

async function fwExportBranchData(){
  const btn=document.getElementById('fwExportDataBtn');
  if(btn){ btn.disabled=true; btn.textContent='Preparing…'; }
  try{
    let pack, fileName, toastMessage;
    if(firewallMode==='all'){
      pack={
        format:'NOC Firewall All Branches Data',
        version:2,
        exportedAt:new Date().toISOString(),
        branches:{}
      };
      for(const br of BRANCHES){
        const branchPack=await fwCollectBranchPackage(br.id);
        pack.branches[br.id]={
          name:br.label,
          devices:branchPack.data.devices,
          usage:branchPack.data.usage,
          appUsage:branchPack.data.appUsage,
          fixedHosts:branchPack.data.fixedHosts
        };
      }
      fileName=`NOC_All_Branches_Firewall_Data_${todayISO()}.json`;
      toastMessage='All branch data downloaded ✓';
    }else{
      pack=await fwCollectBranchPackage(firewallSelectedBranch);
      fileName=`NOC_${pack.branch.name}_Firewall_Data_${todayISO()}.json`;
      toastMessage=`${pack.branch.name} data downloaded ✓`;
    }
    const blob=new Blob([JSON.stringify(pack,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=fileName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    showToast(toastMessage);
  }catch(e){
    console.error('Could not export JSON data',e); showToast('Could not export JSON data');
  }finally{
    if(btn) btn.disabled=false;
    fwRenderBranchSwitcher();
  }
}

async function fwImportBranchDataFromFile(file){
  if(!file) return;
  try{
    const raw=await file.text();
    const pack=JSON.parse(raw);

    if(pack?.format==='NOC Firewall All Branches Data' && pack?.branches){
      for(const br of BRANCHES){
        const item=pack.branches[br.id];
        if(!item) continue;
        const data=item.data || item; // supports old v1 and desktop v2 JSON
        if(!Array.isArray(data.devices)||!Array.isArray(data.usage)||!Array.isArray(data.appUsage)) continue;
        await store.set(branchKeyFor(br.id,DEVICE_KEY),JSON.stringify(data.devices),true);
        await store.set(branchKeyFor(br.id,USAGE_KEY),JSON.stringify(data.usage),true);
        await store.set(branchKeyFor(br.id,APPUSAGE_KEY),JSON.stringify(data.appUsage),true);
        await store.set(branchKeyFor(br.id,FIXEDHOSTS_KEY),String(Number(data.fixedHosts)||1500),true);
      }
      firewallMode='all';
      await refreshFirewallData();
      await renderFirewallDashboard(); openModule('firewall',false);
      showToast('All branches JSON uploaded successfully ✓');
      return;
    }

    if(pack?.format!=='NOC Firewall Branch Data'||!pack?.branch?.id||!pack?.data) throw new Error('Invalid NOC JSON file');
    const branchId=String(pack.branch.id), data=pack.data;
    if(!BRANCHES.some(b=>b.id===branchId)) throw new Error('Unsupported branch');
    if(!Array.isArray(data.devices)||!Array.isArray(data.usage)||!Array.isArray(data.appUsage)) throw new Error('Incomplete branch data');

    await store.set(branchKeyFor(branchId,DEVICE_KEY),JSON.stringify(data.devices),true);
    await store.set(branchKeyFor(branchId,USAGE_KEY),JSON.stringify(data.usage),true);
    await store.set(branchKeyFor(branchId,APPUSAGE_KEY),JSON.stringify(data.appUsage),true);
    await store.set(branchKeyFor(branchId,FIXEDHOSTS_KEY),String(Number(data.fixedHosts)||1500),true);

    firewallSelectedBranch=branchId; firewallMode='branch';
    await refreshFirewallData();
    await renderFirewallDashboard(); openModule('firewall',false);
    showToast(`${pack.branch.name} JSON uploaded successfully ✓`);
  }catch(e){
    console.error('Could not import JSON data',e); showToast('Could not upload JSON data');
  }
}

async function fwDownloadManagerSnapshot(){
  const btn=document.getElementById('fwManagerShareBtn');
  if(btn){ btn.disabled=true; btn.textContent='Preparing data…'; }
  try{
    const embedded={};
    for(const br of BRANCHES){
      const entries=[
        [branchKeyFor(br.id,DEVICE_KEY),'[]'],
        [branchKeyFor(br.id,USAGE_KEY),'[]'],
        [branchKeyFor(br.id,APPUSAGE_KEY),'[]'],
        [branchKeyFor(br.id,FIXEDHOSTS_KEY),'1500']
      ];
      for(const [key,fallback] of entries){
        const r=await store.get(key,true);
        embedded[key]=(r && r.value!=null) ? String(r.value) : fallback;
      }
    }
    const currentPref=await store.get(BRANCH_PREF_KEY,false);
    if(currentPref && currentPref.value) embedded[BRANCH_PREF_KEY]=String(currentPref.value);
    const themePref=await store.get(THEME_KEY,false);
    if(themePref && themePref.value) embedded[THEME_KEY]=String(themePref.value);

    const safeJson=JSON.stringify(embedded).replace(/</g,'\\u003C').replace(/>/g,'\\u003E').replace(/&/g,'\\u0026');
    const injected='<script>window.__NOC_MANAGER_SNAPSHOT__=true;window.__NOC_EMBEDDED_DATA__='+safeJson+';<\/script>';
    const source=document.documentElement.outerHTML;
    const snapshot='<!DOCTYPE html>\n'+source.replace(/<head>/i,'<head>\n'+injected);
    const blob=new Blob([snapshot],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    const scope=firewallMode==='all'?'All-Branches':(branchLabel(firewallSelectedBranch)||'Branch');
    a.download=`NOC_Firewall_Manager_Report_${scope}_${todayISO()}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    showToast('Manager webpage created with all branch data ✓');
  }catch(e){
    console.error('Could not create manager snapshot',e);
    showToast('Could not create manager webpage — try again');
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='↗ Send to Manager (with data)'; }
  }
}

async function renderFirewallDashboard(){
  // SECURITY: non-admin users are always locked to their assigned branch.
  if(currentUser && currentUser.role !== 'administrator'){
    firewallSelectedBranch = String(currentUser.branch || firewallSelectedBranch || 'chennai').toLowerCase();
    firewallMode = 'branch';
  }

  await refreshFirewallData();
  const current=fwBranchForCurrent();
  const totalRecords=firewallBranches.reduce((s,b)=>s+b.records,0);
  const allUsage=firewallBranches.reduce((s,b)=>s+b.usage,0);
  fwRenderBranchSwitcher();
  const isAll = firewallMode==='all';
  const pageTitle = document.getElementById('fwPageTitle');
  const pageSub = document.getElementById('fwPageSub');
  if(pageTitle) pageTitle.textContent = isAll ? 'All Branches Firewall Usage' : `${current.name} Firewall Usage`;
  if(pageSub) pageSub.textContent = isAll
    ? 'All branches — combined firewall bandwidth, hosts and usage.'
    : `${current.name} branch — bandwidth, hosts and usage. Refresh stays on this Firewall page.`;
  document.getElementById('fwSelectedTag').textContent=current.name;
  const summaryTitle=document.getElementById('fwBranchSummaryTitle'); if(summaryTitle) summaryTitle.firstChild.textContent = isAll ? 'All branch summary ' : `${current.name} branch summary `;
  fwCountUp('fwHosts',current.activeHosts);
  // Total Users = unique accounts that have successfully logged in at least once.
  // attemptLogin() already saves record.lastLogin after a successful login.
  const totalLoggedInUsers = (typeof accounts === 'object' && accounts)
    ? Object.values(accounts).filter(account => account && account.lastLogin).length
    : 0;
  fwCountUp('fwUsers', totalLoggedInUsers);
  const fwUsersFoot = document.querySelector('#fwUsers')?.closest('.fw-kpi')?.querySelector('.fw-kpi-foot');
  if(fwUsersFoot) fwUsersFoot.textContent = totalLoggedInUsers === 1 ? 'user has logged in' : 'users have logged in';
  fwSetUsageStat('fwUsage','fwUsageUnit',current.usage,0);
  fwSetUsageStat('fwPeak','fwPeakUnit',current.peak,1);
  fwSetUsageStat('fwAvg','fwAvgUnit',current.avg,1);
  document.getElementById('fwHostsFoot').textContent=`of ${fwFmt(current.registeredHosts)} registered`;
  document.getElementById('fwPeakHost').textContent=current.name+' branch';
  document.getElementById('fwRecordFoot').textContent=`${fwFmt(current.records)} records · all branches ${fwFmt(totalRecords)}`;
  document.getElementById('fwSelUsage').textContent=fmtGB(current.usage);
  document.getElementById('fwSelRecords').textContent=fwFmt(current.records);
  document.getElementById('fwSelHosts').textContent=fwFmt(current.activeHosts);
  document.getElementById('fwLegend').innerHTML=firewallBranches.map(b=>`<span><i class="fw-dot" style="background:${b.color}"></i>${b.name} — ${fmtGB(b.usage)}</span>`).join('');
  fwRenderBranchTable();
  fwRenderHostTable();
  // Always redraw the map for the current Firewall scope so All Branches
  // shows all locations and a branch scope shows only that branch.
  fwRenderMap();
  fwInitialized=true;
  fwRenderCharts();
  const clock=document.getElementById('fwClock');
  if(clock) clock.textContent=new Date().toLocaleTimeString();
  checkFirewallDataLink();
}

const fwManagerShareBtn=document.getElementById('fwManagerShareBtn');
if(fwManagerShareBtn) fwManagerShareBtn.addEventListener('click', fwDownloadManagerSnapshot);
const fwExportDataBtn=document.getElementById('fwExportDataBtn');
if(fwExportDataBtn) fwExportDataBtn.addEventListener('click', fwExportBranchData);
const fwImportDataBtn=document.getElementById('fwImportDataBtn');
const fwImportDataInput=document.getElementById('fwImportDataInput');
if(fwImportDataBtn && fwImportDataInput){
  fwImportDataBtn.addEventListener('click', ()=>fwImportDataInput.click());
  fwImportDataInput.addEventListener('change', async e=>{
    const file=e.target.files?.[0];
    await fwImportBranchDataFromFile(file);
    e.target.value='';
  });
}

setInterval(()=>{
  const clock=document.getElementById('fwClock');
  if(clock && document.getElementById('view-firewall')?.classList.contains('active')) clock.textContent=new Date().toLocaleTimeString();
},1000);
setInterval(()=>{
  if(document.getElementById('view-firewall')?.classList.contains('active')) checkFirewallDataLink();
},60000);

// Firewall is rendered lazily when the Firewall module is opened. This prevents
// the initial dashboard from waiting on extra Firebase reads and map assets.
