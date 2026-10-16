(function(){
  const branches=[
    {id:'chennai',name:'Chennai'},
    {id:'bangalore',name:'Bangalore'},
    {id:'hosur',name:'Hosur'}
  ];

  function normalize(s){return String(s||'').toLowerCase().trim();}
  function getStore(){
    try{ if(typeof store!=='undefined') return store; }catch(e){}
    return null;
  }
  async function readBranchData(branch){
    const s=getStore();
    if(!s) return {devices:[],usage:[]};
    const out={devices:[],usage:[]};
    try{
      const d=await s.get('devices-directory::'+branch.id,true);
      if(d&&d.value) out.devices=JSON.parse(d.value)||[];
    }catch(e){}
    try{
      const u=await s.get('usage-records::'+branch.id,true);
      if(u&&u.value) out.usage=JSON.parse(u.value)||[];
    }catch(e){}
    return out;
  }
  function requestedBranch(text){
    const t=normalize(text);
    return branches.find(b=>t.includes(b.name.toLowerCase()))||null;
  }
  function wantsIPList(text){
    const t=normalize(text);
    return /(ip\s*(total|full|complete)?\s*list|total\s*ip|all\s*ip|ip\s*address\s*list|ip\s*list)/i.test(t);
  }
  async function makeIPListAnswer(query){
    const branch=requestedBranch(query);
    const selected=branch?[branch]:branches;
    const sections=[];
    for(const b of selected){
      const data=await readBranchData(b);
      const map=new Map();
      (data.devices||[]).forEach(d=>{
        if(d&&d.ip&&d.ip!=='others') map.set(d.ip,{ip:d.ip,host:d.name||d.host||'—',user:d.username||d.user||'—',mac:d.mac||'—',usage:0});
      });
      (data.usage||[]).forEach(r=>{
        if(!r||!r.ip||r.ip==='others') return;
        if(!map.has(r.ip)) map.set(r.ip,{ip:r.ip,host:'—',user:'—',mac:'—',usage:0});
        map.get(r.ip).usage += Number(r.bytesGB)||0;
      });
      const rows=[...map.values()].sort((a,b)=>a.ip.localeCompare(b.ip,undefined,{numeric:true}));
      if(!rows.length){
        sections.push(`<div class="usage-chatbot-message"><b>${b.name}</b><br><span style="color:var(--muted,#8a97b3)">No data available for this branch.</span></div>`);
        continue;
      }
      sections.push(`<div class="usage-chatbot-message"><div style="font-weight:700;margin-bottom:7px">${b.name} — ${rows.length} IP(s)</div><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="text-align:left;padding:6px">IP</th><th style="text-align:left;padding:6px">Host</th><th style="text-align:left;padding:6px">User</th><th style="text-align:left;padding:6px">MAC</th><th style="text-align:right;padding:6px">Usage GB</th></tr></thead><tbody>${rows.map(r=>`<tr><td style="padding:6px">${r.ip}</td><td style="padding:6px">${r.host}</td><td style="padding:6px">${r.user}</td><td style="padding:6px">${r.mac}</td><td style="padding:6px;text-align:right">${r.usage.toFixed(2)}</td></tr>`).join('')}</tbody></table></div></div>`);
    }
    return sections.join('');
  }
  function findChatRoot(){
    const candidates=[...document.querySelectorAll('*')].filter(el=>{
      const t=normalize(el.textContent);
      return t.includes('usage assistant')||t.includes('usage chatbot');
    });
    return candidates.find(el=>el.querySelector('input,textarea'))||null;
  }
  function patchAnswerEngine(){
    if(window.__ipListChatbotPatch) return;
    window.__ipListChatbotPatch=true;
    window.addEventListener('submit',async e=>{
      const root=findChatRoot();
      if(!root) return;
      const input=root.querySelector('input,textarea');
      if(!input) return;
      const q=input.value.trim();
      if(!q||!wantsIPList(q)) return;
      const output=root.querySelector('.messages,.chat-messages,.chat-history,.conversation,.results');
      if(!output) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const answer=await makeIPListAnswer(q);
      const div=document.createElement('div');
      div.className='usage-chatbot-message';
      div.innerHTML=answer;
      output.appendChild(div);
      output.scrollTop=output.scrollHeight;
      input.value='';
    },true);
  }
  /* PERF FIX: patchAnswerEngine only registers one submit listener (guarded by a flag).
     The old whole-document MutationObserver scanned every element on every DOM change. */
  setTimeout(patchAnswerEngine,800);
})();
