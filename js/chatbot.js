(function(){
 const panel=document.getElementById('usageChat'),body=document.getElementById('usageChatBody'),input=document.getElementById('usageChatInput');
 const clearBtn=document.getElementById('usageChatClear'),historyBtn=document.getElementById('usageChatHistory'),historyClose=document.getElementById('usageChatHistoryClose'),historyPanel=document.getElementById('usageChatHistoryPanel'),historyList=document.getElementById('usageChatHistoryList');
 const HISTORY_STORE_KEY='noc-usage-chat-history';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=x=>Number(x||0).toLocaleString(undefined,{maximumFractionDigits:2});
 const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9. _-]/g,' ').replace(/\s+/g,' ').trim();
 function loadChatHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_STORE_KEY)||'[]')||[]}catch(e){return[]}}
 function saveChatHistory(items){try{localStorage.setItem(HISTORY_STORE_KEY,JSON.stringify(items.slice(0,50)))}catch(e){}}
 function addChatHistory(question,answer){const items=loadChatHistory();items.unshift({time:new Date().toISOString(),question:String(question||''),answer:String(answer||'')});saveChatHistory(items);renderChatHistory()}
 function renderChatHistory(){
   if(!historyList)return;
   const items=loadChatHistory();
   if(!items.length){historyList.innerHTML='<div class="usage-chat-history-empty">No saved chat history yet.</div>';return;}
   historyList.innerHTML=items.map((x,i)=>{const t=new Date(x.time);return '<button type="button" class="usage-chat-history-item" data-history-index="'+i+'"><span class="h-time">'+esc(isNaN(t)?x.time:t.toLocaleString())+'</span><span class="h-q">'+esc(x.question)+'</span></button>'}).join('');
   historyList.querySelectorAll('[data-history-index]').forEach(btn=>btn.onclick=()=>{const x=items[Number(btn.dataset.historyIndex)];if(!x)return;body.innerHTML='';msg(esc(x.question),true);msg(x.answer);historyPanel.classList.remove('open');historyPanel.setAttribute('aria-hidden','true');body.scrollTop=body.scrollHeight;input.focus();});
 }
 renderChatHistory();
 function msg(t,me=false){let d=document.createElement('div');d.className='usage-msg '+(me?'me':'bot');d.innerHTML=t;body.appendChild(d);body.scrollTop=body.scrollHeight;return d;}
 function tbl(rows,heads){if(!rows.length)return '<div>No matching records found.</div>';return '<table><thead><tr>'+heads.map(h=>'<th>'+h[1]+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+heads.map(h=>'<td>'+esc(r[h[0]])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}

 /* ---------- Excel export registry: every report answer can be downloaded ---------- */
 const EXPORTS=new Map();
 window.__nocChatExport=function(id){
   const pack=EXPORTS.get(id);
   if(!pack||typeof XLSX==='undefined')return;
   const wb=XLSX.utils.book_new();
   pack.sheets.forEach(s=>{
     if(!s.rows||!s.rows.length)return;
     XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(s.rows),String(s.name).slice(0,31));
   });
   if(!wb.SheetNames.length)return;
   XLSX.writeFile(wb,pack.file);
 };
 let exportSeq=0;
 function exportBtn(label,file,sheets){
   const id='nocx'+(++exportSeq);
   EXPORTS.set(id,{file,sheets});
   return '<div class="usage-chatbot-actions"><button type="button" class="usage-chatbot-clear" onclick="window.__nocChatExport(\''+id+'\')">⬇ '+esc(label)+'</button></div>';
 }

 async function data(){
   let out=[];
   for(const b of BRANCHES){
     let d=await fwLoadBranchData(b.id), apps=[];
     try{let a=await store.get(branchKeyFor(b.id,APPUSAGE_KEY),true);apps=a&&a.value?JSON.parse(a.value):[]}catch(e){}
     let dev=d.devices||[];
     let rows=(d.usageRows||[]).map(r=>{
       let x=dev.find(z=>z.ip===r.ip)||{};
       return {...r,branch:b.label,name:x.name||r.ip||'Unknown',user:x.username||'Unknown',mac:x.mac||''};
     });
     let ar=(apps||[]).map(r=>{let x=dev.find(z=>z.ip===r.ip)||{};return {...r,branch:b.label,name:x.name||r.ip||'Unknown',user:x.username||'Unknown'}});
     const usageByIp={};
     rows.forEach(r=>{
       if(!usageByIp[r.ip]) usageByIp[r.ip]={gb:0,records:0,lastDate:'',percent:0};
       usageByIp[r.ip].gb+=Number(r.bytesGB||0);
       usageByIp[r.ip].records++;
       if(String(r.date||'')>String(usageByIp[r.ip].lastDate||'')) usageByIp[r.ip].lastDate=r.date||'';
     });
     const ipList=dev.map(x=>({
       ip:x.ip||'—', name:x.name||'—', user:x.username||'—', mac:x.mac||'—', branch:b.label,
       gb:usageByIp[x.ip]?.gb||0, records:usageByIp[x.ip]?.records||0, lastDate:usageByIp[x.ip]?.lastDate||'No usage yet'
     })).filter(x=>x.ip&&x.ip!=='—');
     Object.keys(usageByIp).forEach(ip=>{
       if(!ipList.some(x=>x.ip===ip)) ipList.push({ip,name:ip,user:'Unknown',mac:'—',branch:b.label,gb:usageByIp[ip].gb,records:usageByIp[ip].records,lastDate:usageByIp[ip].lastDate||'—'});
     });
     out.push({branch:b.label,rows,apps:ar,devices:dev,ipList});
   }
   return out;
 }

 /* ---------- date helpers for day / week / month reports ---------- */
 function toDate(v){
   const s=String(v||'').trim();
   if(!s)return null;
   let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
   if(m)return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
   m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
   if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
   const d=new Date(s);
   return isNaN(d)?null:d;
 }
 const pad=n=>String(n).padStart(2,'0');
 const dayKey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const monthKey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1);
 const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
 function weekStart(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());const shift=(x.getDay()+6)%7;x.setDate(x.getDate()-shift);return x;}
 function weekKey(d){const s=weekStart(d);return dayKey(s);}
 function weekLabel(d){const s=weekStart(d),e=new Date(s);e.setDate(s.getDate()+6);
   return s.getDate()+' '+MONTHS[s.getMonth()].slice(0,3)+' – '+e.getDate()+' '+MONTHS[e.getMonth()].slice(0,3)+' '+e.getFullYear();}
 function dayLabel(d){return d.getDate()+' '+MONTHS[d.getMonth()].slice(0,3)+' '+d.getFullYear()+' ('+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]+')';}

 function buildPeriodReport(rows,period,scopeLabel,personLabel){
   const keyOf=period==='day'?dayKey:period==='week'?weekKey:monthKey;
   const labelOf=period==='day'?dayLabel:period==='week'?weekLabel:(d=>MONTHS[d.getMonth()]+' '+d.getFullYear());
   const buckets=new Map();
   let undated=0;
   rows.forEach(r=>{
     const d=toDate(r.date);
     if(!d){undated+=Number(r.bytesGB||0);return;}
     const k=keyOf(d);
     if(!buckets.has(k))buckets.set(k,{key:k,label:labelOf(d),gb:0,records:0,hosts:new Set(),byHost:new Map(),branches:new Set()});
     const b=buckets.get(k);
     const gb=Number(r.bytesGB||0);
     b.gb+=gb;b.records++;b.hosts.add(r.ip);b.branches.add(r.branch);
     b.byHost.set(r.name,(b.byHost.get(r.name)||0)+gb);
   });
   const list=[...buckets.values()].sort((a,b)=>a.key.localeCompare(b.key));
   if(!list.length)return null;
   const total=list.reduce((s,x)=>s+x.gb,0);
   const avg=total/list.length;
   const peak=list.reduce((a,b)=>b.gb>a.gb?b:a,list[0]);
   const quiet=list.reduce((a,b)=>b.gb<a.gb?b:a,list[0]);
   const last=list[list.length-1],prev=list[list.length-2];
   const trend=prev?((last.gb-prev.gb)/(prev.gb||1))*100:null;
   const tableRows=list.slice().reverse().map(x=>{
     const top=[...x.byHost.entries()].sort((a,b)=>b[1]-a[1])[0];
     return {period:x.label,gb:fmt(x.gb),hosts:x.hosts.size,records:x.records,top:top?top[0]+' ('+fmt(top[1])+' GB)':'—',branches:[...x.branches].join(', ')};
   });
   const word=period==='day'?'Day':period==='week'?'Week':'Month';
   const overall=new Map();
   rows.forEach(r=>{const k=r.name+' | '+r.ip+' | '+r.branch;overall.set(k,(overall.get(k)||0)+Number(r.bytesGB||0))});
   const topUsers=[...overall.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10)
     .map(([k,v])=>{const p=k.split(' | ');return {name:p[0],ip:p[1],branch:p[2],gb:fmt(v)}});
   let html='<b>'+word+'-wise usage report'+(personLabel?' · '+esc(personLabel):'')+' · '+esc(scopeLabel)+'</b>';
   html+='<div class="usage-total">'
     +'Covering <b>'+list.length+' '+word.toLowerCase()+(list.length>1?'s':'')+'</b> from <b>'+esc(list[0].label)+'</b> to <b>'+esc(last.label)+'</b>.'
     +'<br>Total usage: <b>'+fmt(total)+' GB</b> · Average per '+word.toLowerCase()+': <b>'+fmt(avg)+' GB</b>'
     +'<br>Busiest: <b>'+esc(peak.label)+'</b> with <b>'+fmt(peak.gb)+' GB</b> · Quietest: <b>'+esc(quiet.label)+'</b> with <b>'+fmt(quiet.gb)+' GB</b>'
     +(trend===null?'':'<br>Latest '+word.toLowerCase()+' is <b>'+(trend>=0?'up':'down')+' '+fmt(Math.abs(trend))+'%</b> compared with the previous '+word.toLowerCase()+'.')
     +(undated?'<br><i>'+fmt(undated)+' GB of records had no valid date and are not included.</i>':'')
     +'</div>';
   html+=tbl(tableRows,[['period',word],['gb','Usage GB'],['hosts','Hosts'],['records','Records'],['top','Top consumer'],['branches','Branch']]);
   if(topUsers.length){
     html+='<div class="usage-total" style="margin-top:12px">Top consumers for this period</div>'
       +tbl(topUsers,[['name','Host Name'],['ip','IP Address'],['branch','Branch'],['gb','Total GB']]);
   }
   const detail=rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))
     .map(r=>({Date:r.date||'',Branch:r.branch,'Host Name':r.name,'User Name':r.user,'IP Address':r.ip,'Usage GB':Number(r.bytesGB||0)}));
   html+=exportBtn('Download Excel report','NOC-'+word.toLowerCase()+'-wise-report-'+dayKey(new Date())+'.xlsx',[
     {name:word+' Summary',rows:tableRows.map(x=>({[word]:x.period,'Usage GB':Number(String(x.gb).replace(/,/g,'')),Hosts:x.hosts,Records:x.records,'Top Consumer':x.top,Branch:x.branches}))},
     {name:'Top Consumers',rows:topUsers.map(x=>({'Host Name':x.name,'IP Address':x.ip,Branch:x.branch,'Total GB':Number(String(x.gb).replace(/,/g,''))}))},
     {name:'Detailed Records',rows:detail}
   ]);
   return html;
 }

 function answer(all,q){
  const raw=String(q||''); const n=norm(raw);

  /* ---------- small talk: natural English replies, never dump data ---------- */
  const nn=n.replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const words=nn?nn.split(' '):[];
  const GREET=/^(hi+|hey+|hello+|helo|hlo|yo|vanakkam|vanakam|namaskaram|namaste|hai|haai|hii+|good morning|good afternoon|good evening|good night|morning|evening)$/;
  const THANKS=/^(thanks|thank you|thanku|thankyou|ty|nandri|super|nice|great|ok|okay|okey|sari|sariya|cool|done|correct|hmm+)$/;
  const HOWRU=/^(how are you|how r u|epdi iruka|eppadi iruka|epdi irukka|whats up|what's up|sup|enna|enna panra|enna pandra)$/;
  const BYE=/^(bye|goodbye|good bye|tata|poitu varen|see you|cya)$/;
  const WHOAMI=/(who are you|what can you do|help|unaku enna theriyum|un vela enna|neenga yaaru|nee yaaru|what do you do)/;
  if(words.length&&words.length<=4){
    if(GREET.test(nn))return 'Hello! I am your Network Assistant. Chennai, Bangalore and Hosur are ready for fresh data.<div class="usage-total">You can ask me things like:<br>• <b>What is Karthik\'s IP?</b><br>• <b>192.168.3.131</b><br>• <b>Chennai usage</b><br>• <b>Monthly usage report</b></div>';
    if(THANKS.test(nn))return 'Happy to help. Just ask whenever you need another IP, host, user or usage detail.';
    if(HOWRU.test(nn))return 'All good here, thank you. I am ready — which network detail would you like?';
    if(BYE.test(nn))return 'Goodbye! Come back any time you need network data.';
  }
  if(WHOAMI.test(nn)&&words.length<=6)return '<b>I am the Network Assistant.</b><div class="usage-total">Here is what I can do:<br>• Look up a host or user and give their IP, MAC, branch and total usage<br>• Find a device from an IP or MAC address<br>• Break usage down by branch, IP, host name or application<br>• Build <b>day-wise, week-wise and monthly reports</b> with an Excel download<br>• Show top consumers and firewall data<br><br>For example: <b>How much did Ravi use?</b> or <b>Chennai week wise report</b></div>';

  const branch=(BRANCHES||[]).find(b=>n.includes(b.label.toLowerCase()))||null;
  const ip=(raw.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)||[])[0]||null;
  const mac=(raw.match(/\b[0-9a-fA-F]{2}(?:[:-][0-9a-fA-F]{2}){5}\b/)||[])[0]||null;
  let rows=all.flatMap(x=>x.rows);
  if(branch)rows=rows.filter(r=>r.branch===branch.label);
  if(ip)rows=rows.filter(r=>r.ip===ip);

  /* ---------- unified people / device index (devices + usage together) ---------- */
  const people=new Map();
  function touch(br,ipv,name,user,macv){
    const k=br+'|'+(String(ipv||'').trim()||String(name||'').trim());
    if(!people.has(k))people.set(k,{branch:br,ip:ipv||'—',name:name||ipv||'Unknown',user:user||'—',mac:macv||'—',gb:0,days:new Set(),rows:[]});
    const p=people.get(k);
    if(name&&(p.name==='Unknown'||p.name===p.ip))p.name=name;
    if(user&&!/^(—|unknown)$/i.test(String(user)))p.user=user;
    if(macv&&macv!=='—')p.mac=macv;
    return p;
  }
  all.forEach(b=>{
    if(branch&&b.branch!==branch.label)return;
    (b.ipList||[]).forEach(x=>touch(b.branch,x.ip,x.name,x.user,x.mac));
    (b.devices||[]).forEach(d=>touch(b.branch,d.ip,d.name||d.host,d.username||d.user,d.mac));
    (b.rows||[]).forEach(r=>{const p=touch(b.branch,r.ip,r.name,r.user,r.mac);p.gb+=Number(r.bytesGB||0);if(r.date)p.days.add(r.date);p.rows.push(r);});
  });
  const index=[...people.values()].filter(p=>p.ip!=='others');

  /* ---------- question words that carry no data meaning (English + Tanglish) ---------- */
  const stop=new Set(('show showme give given gimme tell tellme kindly pls plz please can could would will is are was were did does do i me my you your his her their our it its this that these those about regarding much how what whats which who whom when where why usage used use uses using consume consumed consuming spent spend data details detail info information report reports records record list lists total totals all any the a an to of for in on at and or per day days daily date dates week weeks weekly month months monthly wise year top highest largest most least lowest user users username name names host hostname ip ips address addresses mac branch branches application applications apps app summary overall entire complete excel download export sheet'
   +' hi hii hey hello helo hlo hai haai yo vanakkam vanakam namaste namaskaram thanks thanku thankyou nandri bye tata super nice cool sari sariya hmm morning evening night kudu kudunga kodu koduthu kudukka thariya thaa taa venum vennum vendum enna evlo evvalavu eppadi epdi yaaru yaru yarudhu sollu solluga sollunga na naa ne nee neenga ni oda ku la kuda paaru paru paarunga bro anna sir plsss ok okay konjam nalla proper correct check pannunga panunga pannu').split(' '));
  const tokens=n.replace(/[^a-z0-9. _-]/g,' ').split(/\s+/)
    .map(w=>w.replace(/^[._-]+|[._-]+$/g,''))
    .filter(w=>w.length>=2&&!stop.has(w)&&!/^\d{1,3}(\.\d{1,3}){3}$/.test(w)&&!(branch&&w===branch.label.toLowerCase()));

  const asksIp=/\bip\b|\bip address\b/.test(n), asksMac=/\bmac\b/.test(n), asksHost=/\bhost\b/.test(n);
  const wantsListing=/(list|inventory|every|all|full|complete|total)/.test(n);

  /* ---------- day / week / month reports ---------- */
  let period=null;
  if(/\b(month|monthly|months|month wise|monthwise)\b/.test(n))period='month';
  else if(/\b(week|weekly|weeks|week wise|weekwise)\b/.test(n))period='week';
  else if(/\b(day|daily|days|day wise|daywise|date wise|datewise)\b/.test(n))period='day';
  if(period){
    let scopeRows=all.flatMap(x=>x.rows);
    if(branch)scopeRows=scopeRows.filter(r=>r.branch===branch.label);
    let personLabel='';
    if(ip){scopeRows=scopeRows.filter(r=>r.ip===ip);personLabel=ip;}
    else if(mac){const p=index.find(x=>norm(x.mac)===norm(mac));if(p){scopeRows=scopeRows.filter(r=>r.ip===p.ip);personLabel=p.name;}}
    else if(tokens.length){
      const matches=index.filter(p=>tokens.some(t=>norm(p.name).includes(t)||norm(p.user).includes(t)));
      if(matches.length){
        const ips=new Set(matches.map(m=>m.ip));
        scopeRows=scopeRows.filter(r=>ips.has(r.ip));
        personLabel=matches.length===1?matches[0].name:tokens.join(' ');
      }
    }
    const scopeLabel=branch?branch.label:'All branches';
    const html=buildPeriodReport(scopeRows,period,scopeLabel,personLabel);
    if(html)return html;
    return '<b>No usage records to report on</b><div class="usage-total">I could not find any dated usage records'+(personLabel?' for <b>'+esc(personLabel)+'</b>':'')+' in '+esc(scopeLabel)+'. Upload or save usage data first, then ask me again.</div>';
  }

  /* ---------- complete IP inventory ---------- */
  if((asksIp||/\bhosts?\b/.test(n))&&wantsListing&&!tokens.length){
    let ipRows=all.flatMap(x=>x.ipList);
    if(branch)ipRows=ipRows.filter(x=>x.branch===branch.label);
    if(ip)ipRows=ipRows.filter(x=>x.ip===ip);
    ipRows.sort((a,b)=>a.branch.localeCompare(b.branch)||String(a.ip).localeCompare(String(b.ip),undefined,{numeric:true}));
    if(!ipRows.length)return '<b>IP List</b><div class="usage-total">No IP records saved yet for that branch.</div>';
    const groups={};ipRows.forEach(x=>(groups[x.branch]??=[]).push(x));
    let html='<b>Complete IP List</b><div class="usage-total">Every device-directory IP plus usage-only IPs'+(branch?' in <b>'+esc(branch.label)+'</b>':' across <b>Chennai, Bangalore and Hosur</b>')+'.</div>';
    Object.entries(groups).forEach(([br,rs])=>{
      html+='<div style="margin-top:14px"><b>'+esc(br)+' — '+rs.length+' IPs</b>'+tbl(rs.map(x=>({ip:x.ip,name:x.name,user:x.user,mac:x.mac,gb:fmt(x.gb),records:x.records,last:x.lastDate})),[['ip','IP Address'],['name','Host Name'],['user','User Name'],['mac','MAC Address'],['gb','Total GB'],['records','Records'],['last','Last Usage']])+'</div>';
    });
    html+=exportBtn('Download Excel report','NOC-ip-list-'+dayKey(new Date())+'.xlsx',[{name:'IP List',rows:ipRows.map(x=>({Branch:x.branch,'IP Address':x.ip,'Host Name':x.name,'User Name':x.user,'MAC Address':x.mac,'Total GB':Number(x.gb||0),Records:x.records,'Last Usage':x.lastDate}))}]);
    return html;
  }

  /* ---------- application usage ---------- */
  if(/application|apps?\b|youtube|teams|instagram|whatsapp|facebook|amazon|flipkart|windows/.test(n)&&!tokens.length){
    let ar=all.flatMap(x=>x.apps);
    if(branch)ar=ar.filter(x=>x.branch===branch.label);
    if(ip)ar=ar.filter(x=>x.ip===ip);
    let m={};ar.forEach(x=>{let k=x.name+'|'+(x.app||'Other');m[k]=(m[k]||0)+Number(x.gb||0)});
    let r=Object.entries(m).map(([k,v])=>{let z=k.split('|');return{name:z[0],app:z[1],gbNum:v,gb:fmt(v)}}).sort((a,b)=>b.gbNum-a.gbNum).slice(0,20);
    if(!r.length)return '<b>Application usage</b><div class="usage-total">No application usage has been saved'+(branch?' for <b>'+esc(branch.label)+'</b>':'')+' yet.</div>';
    return '<b>Application usage</b><div class="usage-total">Top '+r.length+' host and application pairs'+(branch?' in <b>'+esc(branch.label)+'</b>':' across all branches')+'. <b>'+esc(r[0].app)+'</b> leads with <b>'+r[0].gb+' GB</b>.</div>'
      +tbl(r,[['name','Name'],['app','Application'],['gb','GB']])
      +exportBtn('Download Excel report','NOC-application-usage-'+dayKey(new Date())+'.xlsx',[{name:'Application Usage',rows:r.map(x=>({'Host Name':x.name,Application:x.app,'Usage GB':x.gbNum}))}]);
  }

  /* ---------- person / device lookup: name, username, IP or MAC ---------- */
  function scoreOf(p){
    const fields=[String(p.name||''),String(p.user||''),String(p.ip||''),String(p.mac||'')].map(x=>norm(x));
    const words=fields.join(' ').split(/[\s._-]+/).filter(Boolean);
    let s=0;
    tokens.forEach(t=>{
      if(words.includes(t))s+=12;
      else if(words.some(w=>w.startsWith(t)||t.startsWith(w)))s+=7;
      else if(fields.some(f=>f.includes(t)))s+=4;
    });
    return s;
  }
  let hits=[];
  if(ip)hits=index.filter(p=>p.ip===ip);
  else if(mac)hits=index.filter(p=>norm(p.mac)===norm(mac));
  else if(tokens.length){
    const scored=index.map(p=>({p,s:scoreOf(p)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||b.p.gb-a.p.gb);
    if(scored.length){const best=scored[0].s;hits=scored.filter(x=>x.s>=Math.max(best*0.75,4)).map(x=>x.p);}
  }

  function personCard(p){
    const detail=p.rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,30)
      .map(r=>({date:r.date||'—',ip:r.ip,gb:fmt(r.bytesGB),pct:r.percent??''}));
    const dayTot=new Map();
    p.rows.forEach(r=>{const d=toDate(r.date);if(!d)return;const k=dayKey(d);dayTot.set(k,(dayTot.get(k)||0)+Number(r.bytesGB||0))});
    const busiest=[...dayTot.entries()].sort((a,b)=>b[1]-a[1])[0];
    const perDay=dayTot.size?p.gb/dayTot.size:0;
    let lead;
    if(asksIp)lead='<b>'+esc(p.name)+'</b> is on IP <b>'+esc(p.ip)+'</b>.';
    else if(asksMac)lead='<b>'+esc(p.name)+'</b> has the MAC address <b>'+esc(p.mac)+'</b>.';
    else if(asksHost)lead='That device\'s host name is <b>'+esc(p.name)+'</b>.';
    else lead='<b>'+esc(p.name)+'</b> has used <b>'+fmt(p.gb)+' GB</b> in total.';
    return lead+'<div class="usage-total">Host Name: '+esc(p.name)
      +'<br>User Name: '+esc(p.user)
      +'<br>IP Address: <b>'+esc(p.ip)+'</b>'
      +'<br>MAC Address: '+esc(p.mac)
      +'<br>Branch: '+esc(p.branch)
      +'<br>Total Usage: <b>'+fmt(p.gb)+' GB</b>'
      +'<br>Days with usage: '+p.days.size
      +(dayTot.size?'<br>Average per active day: <b>'+fmt(perDay)+' GB</b>':'')
      +(busiest?'<br>Busiest day: <b>'+esc(busiest[0])+'</b> with <b>'+fmt(busiest[1])+' GB</b>':'')
      +(p.rows.length?'':'<br><i>No usage records have been saved for this device yet.</i>')
      +'</div>'+(detail.length?tbl(detail,[['date','Date'],['ip','IP'],['gb','GB'],['pct','Share']]):'')
      +(p.rows.length?exportBtn('Download Excel report','NOC-'+String(p.name).replace(/[^A-Za-z0-9_-]+/g,'-')+'-usage.xlsx',[
          {name:'Device',rows:[{'Host Name':p.name,'User Name':p.user,'IP Address':p.ip,'MAC Address':p.mac,Branch:p.branch,'Total GB':Number(p.gb||0),'Active Days':p.days.size}]},
          {name:'Usage Records',rows:p.rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(r=>({Date:r.date||'',Branch:r.branch,'IP Address':r.ip,'Usage GB':Number(r.bytesGB||0)}))}
        ]):'')
      +'<div class="usage-total" style="margin-top:10px">Want a breakdown? Ask me for a <b>day wise</b>, <b>week wise</b> or <b>monthly report</b> for '+esc(p.name)+'.</div>';
  }

  if(hits.length===1)return personCard(hits[0]);
  if(hits.length>1){
    hits.sort((a,b)=>b.gb-a.gb);
    const label=tokens.length?tokens.join(' '):(ip||mac||'your search');
    return '<b>I found '+hits.length+' matches for “'+esc(label)+'”</b><div class="usage-total">Pick the exact IP or host name from the list below and I will give you the full detail.</div>'
      +tbl(hits.slice(0,50).map(x=>({name:x.name,user:x.user,ip:x.ip,mac:x.mac,branch:x.branch,gb:fmt(x.gb)})),[['name','Host Name'],['user','User Name'],['ip','IP Address'],['mac','MAC Address'],['branch','Branch'],['gb','Total GB']]);
  }
  if(tokens.length||ip||mac){
    const label=tokens.length?tokens.join(' '):(ip||mac);
    const near=index.slice().sort((a,b)=>b.gb-a.gb).slice(0,8).map(x=>esc(x.name)+' ('+esc(x.ip)+' · '+esc(x.branch)+')').join(', ');
    return '<b>I could not find “'+esc(label)+'”</b><div class="usage-total">That name, IP or MAC is not in the saved '+(branch?esc(branch.label):'Chennai, Bangalore or Hosur')+' data.'
      +(near?'<br><br>Devices I do have include: '+near:'')+'</div>';
  }

  /* ---------- aggregate answers (no specific person asked) ---------- */
  if(/branch|branches/.test(n)&&!/user|name|ip|host/.test(n)){
    let r=all.map(x=>({branch:x.branch,gbNum:x.rows.reduce((s,a)=>s+Number(a.bytesGB||0),0),hosts:new Set(x.rows.map(a=>a.ip)).size,records:x.rows.length}))
      .map(x=>({...x,gb:fmt(x.gbNum)}));
    const grand=r.reduce((s,x)=>s+x.gbNum,0);
    const lead=r.slice().sort((a,b)=>b.gbNum-a.gbNum)[0];
    return '<b>All Branches Usage</b><div class="usage-total">Saved usage across <b>Chennai, Bangalore and Hosur</b> is <b>'+fmt(grand)+' GB</b>'
      +(lead?', and <b>'+esc(lead.branch)+'</b> is the heaviest branch with <b>'+lead.gb+' GB</b>':'')+'.</div>'
      +tbl(r,[['branch','Branch'],['gb','Usage GB'],['hosts','Hosts'],['records','Records']])
      +exportBtn('Download Excel report','NOC-branch-usage-'+dayKey(new Date())+'.xlsx',[{name:'Branch Usage',rows:r.map(x=>({Branch:x.branch,'Usage GB':x.gbNum,Hosts:x.hosts,Records:x.records}))}]);
  }
  let list=index.filter(p=>p.gb>0).sort((a,b)=>b.gb-a.gb);
  if(!list.length)list=index.slice();
  const listSheet=name=>exportBtn('Download Excel report','NOC-'+name+'-'+dayKey(new Date())+'.xlsx',[{name:'Usage',rows:list.map(x=>({'Host Name':x.name,'User Name':x.user,'IP Address':x.ip,'MAC Address':x.mac,Branch:x.branch,'Total GB':Number(x.gb||0),'Active Days':x.days.size}))}]);
  if(/ip wise|by ip|ipwise/.test(n))return '<b>IP-wise usage</b><div class="usage-total">Sorted from the highest consumer down'+(branch?' in <b>'+esc(branch.label)+'</b>':'')+'.</div>'+tbl(list.slice(0,30).map(x=>({ip:x.ip,name:x.name,user:x.user,branch:x.branch,gb:fmt(x.gb)})),[['ip','IP'],['name','Host Name'],['user','User Name'],['branch','Branch'],['gb','GB']])+listSheet('ip-wise-usage');
  if(/name wise|user wise|by name|username|user name/.test(n))return '<b>Name / User-wise usage</b><div class="usage-total">Sorted from the highest consumer down'+(branch?' in <b>'+esc(branch.label)+'</b>':'')+'.</div>'+tbl(list.slice(0,30).map(x=>({name:x.name,user:x.user,ip:x.ip,branch:x.branch,gb:fmt(x.gb)})),[['name','Host Name'],['user','User Name'],['ip','IP'],['branch','Branch'],['gb','GB']])+listSheet('name-wise-usage');
  if(/top|highest|largest|most/.test(n)){
    const t=list.slice(0,15);
    return '<b>Top usage'+(branch?' · '+esc(branch.label):'')+'</b><div class="usage-total">The highest consumer is <b>'+esc(t[0]?t[0].name:'—')+'</b> with <b>'+fmt(t[0]?t[0].gb:0)+' GB</b>.</div>'
      +tbl(t.map(x=>({name:x.name,user:x.user,ip:x.ip,branch:x.branch,gb:fmt(x.gb)})),[['name','Host Name'],['user','User Name'],['ip','IP'],['branch','Branch'],['gb','GB']])
      +listSheet('top-usage');
  }
  const total=list.reduce((s,x)=>s+x.gb,0);
  return '<b>Usage summary'+(branch?' · '+esc(branch.label):' · All branches')+'</b><div class="usage-total">Total usage is <b>'+fmt(total)+' GB</b> across <b>'+list.length+'</b> devices and <b>'+rows.length+'</b> saved records.<br>Ask me for a <b>day wise</b>, <b>week wise</b> or <b>monthly report</b> for a period breakdown.</div>'
    +tbl(list.slice(0,50).map(x=>({name:x.name,user:x.user,ip:x.ip,branch:x.branch,gb:fmt(x.gb)})),[['name','Host Name'],['user','User Name'],['ip','IP'],['branch','Branch'],['gb','GB']])
    +listSheet('usage-summary');
 }
 /* ---------- Online AI bot ---------- */
 /*
   IMPORTANT:
   - This HTML does NOT contain an API key.
   - Enter your own key through AI Setup.
   - For production use, put the OpenAI call behind your own server; browser-side
     API keys can be exposed to anyone who can inspect this page.
 */
 const AI_CFG_KEY='noc-chat-ai-config';
 const AI_DEFAULT_URL='https://api.openai.com/v1/responses';
 const AI_DEFAULT_MODEL='gpt-5.6-luna';

 function aiConfig(){try{return JSON.parse(localStorage.getItem(AI_CFG_KEY)||'{}')||{}}catch(e){return{}}}
 function saveAiConfig(c){try{localStorage.setItem(AI_CFG_KEY,JSON.stringify(c))}catch(e){}}
 let MODE=(localStorage.getItem('noc-chat-mode')==='online')?'online':'offline';

 function paintMode(){
   const off=document.getElementById('usageChatModeOffline'),on=document.getElementById('usageChatModeOnline');
   if(off)off.classList.toggle('active',MODE==='offline');
   if(on)on.classList.toggle('active',MODE==='online');
   localStorage.setItem('noc-chat-mode',MODE);
 }

 function setupAi(){
   const c=aiConfig();
   const url=prompt('OpenAI API endpoint:\n\nRecommended:\nhttps://api.openai.com/v1/responses',c.url||AI_DEFAULT_URL);
   if(url===null)return false;
   const model=prompt('Model name:',c.model||AI_DEFAULT_MODEL);
   if(model===null)return false;
   const key=prompt('OpenAI API key:\n\nPaste your API key here. It is stored only in this browser for this dashboard.\n\nNever share your key with anyone.','');
   if(key===null)return false;
   const cleanKey=key.trim();
   if(!cleanKey){msg('<b>AI Setup cancelled:</b> API key is empty. The Offline Bot will continue to work.');return false;}
   saveAiConfig({url:url.trim()||AI_DEFAULT_URL,model:model.trim()||AI_DEFAULT_MODEL,key:cleanKey});
   MODE='online';paintMode();
   msg('<b>Online AI configured.</b> Test it with: <b>Show all branches usage</b>.');
   return true;
 }

 function contextSummary(all){
   const lines=[];
   all.forEach(b=>{
     const total=b.rows.reduce((s,r)=>s+Number(r.bytesGB||0),0);
     lines.push('Branch '+b.branch+': total '+total.toFixed(2)+' GB, '+b.ipList.length+' IPs, '+b.rows.length+' usage records.');
     const byHost={},byDay={};
     b.rows.forEach(r=>{byHost[r.name]=(byHost[r.name]||0)+Number(r.bytesGB||0);if(r.date)byDay[r.date]=(byDay[r.date]||0)+Number(r.bytesGB||0)});
     Object.entries(byHost).sort((a,b2)=>b2[1]-a[1]).slice(0,40).forEach(([k,v])=>lines.push('  host '+k+' = '+v.toFixed(2)+' GB'));
     Object.entries(byDay).sort((a,b2)=>a[0].localeCompare(b2[0])).slice(-60).forEach(([k,v])=>lines.push('  date '+k+' = '+v.toFixed(2)+' GB'));
   });
   return lines.join('\n').slice(0,24000);
 }

 function extractOnlineText(j){
   if(j&&typeof j.output_text==='string'&&j.output_text.trim())return j.output_text.trim();
   if(j&&Array.isArray(j.output)){
     const parts=[];
     j.output.forEach(item=>{if(item&&Array.isArray(item.content))item.content.forEach(c=>{if(c&&typeof c.text==='string')parts.push(c.text)})});
     if(parts.length)return parts.join('\n').trim();
   }
   const cc=j&&j.choices&&j.choices[0]&&j.choices[0].message;
   if(cc){
     if(typeof cc.content==='string')return cc.content.trim();
     if(Array.isArray(cc.content))return cc.content.map(x=>x&&x.text||'').filter(Boolean).join('\n').trim();
   }
   return '';
 }

 async function askOnline(q){
   const c=aiConfig();
   if(!c.url||!c.key){
     MODE='offline';paintMode();
     msg('<b>Online AI is not configured.</b> I switched to the Offline Bot. Click <b>AI Setup</b> to add an OpenAI API key.');
     try{const a=await data();const html=answer(a,q);msg(html);addChatHistory(q,html)}catch(e){msg('Sorry, I could not read the saved usage data.')}
     return;
   }
   const wait=msg('Thinking with Online AI…');
   try{
     const all=await data();
     const systemText='You are a NOC network usage assistant for Chennai, Bangalore and Hosur. Answer in clear natural English. Use ONLY the supplied saved dashboard data for network facts. Do not invent IPs, users, usage numbers, dates or branches. If the requested information is not in the supplied data, say that it is not available. Automatically convert 1024 GB or more to TB where useful. Keep answers concise but complete.\n\nSAVED DASHBOARD DATA:\n'+contextSummary(all);
     const isResponses=/\/responses(?:\?|$)/i.test(c.url);
     const payload=isResponses
       ?{model:c.model||AI_DEFAULT_MODEL,instructions:systemText,input:q,store:false}
       :{model:c.model||'gpt-4o-mini',messages:[{role:'system',content:systemText},{role:'user',content:q}]};

     const res=await fetch(c.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.key},body:JSON.stringify(payload)});
     const raw=await res.text();
     let j={};try{j=JSON.parse(raw)}catch(e){}
     let detail=(j&&j.error&&(j.error.message||j.error.code))||(raw?raw.slice(0,500):'');

     if(!res.ok){
       if(res.status===401){
         wait.innerHTML='<b>OpenAI authentication failed (401).</b><br>Your dashboard reached the API, but the API key was rejected.<br><br>Open <b>AI Setup</b> and paste a valid API key.'+(detail?'<br><small>'+esc(detail)+'</small>':'');
         return;
       }
       if(res.status===429){wait.innerHTML='<b>OpenAI quota/rate-limit error (429).</b><br>Check API usage, billing or quota.'+(detail?'<br><small>'+esc(detail)+'</small>':'');return;}
       if(res.status===403){wait.innerHTML='<b>OpenAI permission error (403).</b><br>Check project/model permissions.'+(detail?'<br><small>'+esc(detail)+'</small>':'');return;}
       if(res.status===404){wait.innerHTML='<b>Endpoint/model not found (404).</b><br>Check AI Setup endpoint and model.'+(detail?'<br><small>'+esc(detail)+'</small>':'');return;}
       wait.innerHTML='<b>Online AI error ('+res.status+').</b>'+(detail?'<br><small>'+esc(detail)+'</small>':'');
       return;
     }

     const answerText=extractOnlineText(j);
     if(!answerText){wait.innerHTML='<b>Online AI returned no text.</b> Check the selected model and endpoint.';return;}
     wait.innerHTML=esc(answerText).replace(/\n/g,'<br>');
     addChatHistory(q,wait.innerHTML);
   }catch(e){
     console.error(e);
     wait.innerHTML='<b>Could not reach Online AI.</b><br>Check your internet connection and API endpoint. Your Offline Bot is still available.';
   }
 }

 async function ask(q){
   if(!q.trim())return;
   msg(esc(q),true);input.value='';
   if(MODE==='online')return askOnline(q);
   msg('Checking the saved data…');let wait=body.lastChild;
   try{let a=await data();wait.remove();const html=answer(a,q);msg(html);addChatHistory(q,html)}
   catch(e){wait.innerHTML='Sorry, I could not read the saved usage data.';console.error(e)}
 }
document.getElementById('usageChatModeOffline').onclick=()=>{MODE='offline';paintMode();msg('Switched to the <b>Offline Bot</b>. I answer instantly from the saved branch data — no internet needed.');input.focus()};
 document.getElementById('usageChatModeOnline').onclick=()=>{MODE='online';paintMode();const c=aiConfig();msg('Switched to the <b>Online AI Bot</b>. '+(c.url&&c.key?'It answers free-form questions using your AI service.':'Click <b>AI Setup</b> once to add your endpoint, model and API key.'));input.focus()};
 document.getElementById('usageChatSetup').onclick=()=>setupAi();
 paintMode();
 document.getElementById('usageChatBtn').onclick=()=>{panel.classList.toggle('open');if(panel.classList.contains('open')&&!body.children.length)msg('Hi! I search <b>Chennai, Bangalore and Hosur</b> together. Ask me about saved <b>usage, host names, users, IPs, dates, branches or applications</b> — or ask for a <b>day wise</b>, <b>week wise</b> or <b>monthly report</b> and download it as Excel.');if(panel.classList.contains('open')){historyPanel.classList.remove('open');historyPanel.setAttribute('aria-hidden','true');input.focus()}};
 document.getElementById('usageChatX').onclick=()=>panel.classList.remove('open');
 document.getElementById('usageChatSend').onclick=()=>ask(input.value);
 input.onkeydown=e=>{if(e.key==='Enter')ask(input.value)};
 document.querySelectorAll('.usage-quick button').forEach(b=>b.onclick=()=>ask(b.dataset.q));
 clearBtn.onclick=()=>{body.innerHTML='';historyPanel.classList.remove('open');historyPanel.setAttribute('aria-hidden','true');msg('Chat cleared. Ask me about <b>Chennai, Bangalore or Hosur</b> usage, users, IPs, hosts, applications or reports.');input.focus()};
 historyBtn.onclick=()=>{const open=!historyPanel.classList.contains('open');if(open)renderChatHistory();historyPanel.classList.toggle('open',open);historyPanel.setAttribute('aria-hidden',String(!open));if(open)historyPanel.scrollTop=0};
 historyClose.onclick=()=>{historyPanel.classList.remove('open');historyPanel.setAttribute('aria-hidden','true');input.focus()};
})();
