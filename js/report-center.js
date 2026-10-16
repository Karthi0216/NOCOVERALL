/* ================= FULL REPORT + BACKUP CENTER ================= */
(function(){
  const FRC_KEY='noc-full-report-center-v2';
  const RECIPIENT_DEFAULT='karthik160221@gmail.com';
  const $=id=>document.getElementById(id);
  const setMsg=t=>{if($('frcMessage')) $('frcMessage').textContent=t||'';};
  const setStatus=(id,text)=>{if($(id)) $(id).textContent=text;};
  const num=v=>Number(v??0)||0;
  const safeParse=(v,f)=>{try{return JSON.parse(v)}catch(e){return f}};
  const saved=()=>safeParse(localStorage.getItem(FRC_KEY)||'{}',{});
  const save=o=>localStorage.setItem(FRC_KEY,JSON.stringify(o));
  function downloadBlob(name,text,type){const b=new Blob([text],{type:type||'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
  function monthNow(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  function nextSchedule(){const c=saved(); if(c.autoDate&&c.autoTime)return `${c.autoDate} ${c.autoTime}`; const d=new Date(); d.setMonth(d.getMonth()+1,1); return d.toISOString().slice(0,10)+' 09:00';}
  async function readBranch(branch){
    let rows=[],devs=[]; const errors=[];
    if(typeof store==='undefined' || !store || typeof store.get!=='function') throw new Error('Firebase storage is not ready yet.');
    try{const r=await store.get(branchKeyFor(branch.id,USAGE_KEY),true);rows=r&&r.value?safeParse(r.value,[]):[]}catch(e){errors.push(branch.label+' usage: '+(e.message||e));}
    try{const r=await store.get(branchKeyFor(branch.id,DEVICE_KEY),true);devs=r&&r.value?safeParse(r.value,[]):[]}catch(e){errors.push(branch.label+' devices: '+(e.message||e));}
    if(errors.length) throw new Error(errors.join(' | '));
    return {branch:branch.id,name:branch.label,rows:Array.isArray(rows)?rows:[],devices:Array.isArray(devs)?devs:[]};
  }
  async function collect(month){
    const all=[];const devices={};
    for(const b of REPORT_BRANCHES){const x=await readBranch(b);devices[b.id]=x.devices;for(const r of x.rows){if(!month||String(r.date||'').startsWith(month))all.push({...r,branch:r.branch||b.id});}}
    return {rows:all.map(r=>({...r,ip:String(r.ip||'').trim(),date:String(r.date||'').trim(),bytesGB:num(r.bytesGB??r.gb??(typeof toGB==='function'?toGB(r.bytesDisplay):0))})),devices};
  }
  function payload(data,recipient,month){
    const byBranch={}; REPORT_BRANCHES.forEach(b=>byBranch[b.id]={branch:b.label,records:0,total:0,days:new Set(),hosts:new Set()});
    data.rows.forEach(r=>{const x=byBranch[r.branch];if(!x)return;x.records++;x.total+=num(r.bytesGB);if(r.date)x.days.add(r.date);if(r.ip)x.hosts.add(r.ip)});
    const branches=Object.values(byBranch).map(x=>({...x,days:x.days.size,hosts:x.hosts.size}));
    const total=data.rows.reduce((a,r)=>a+num(r.bytesGB),0);
    return {reportType:'NOC Dashboard Full Monthly Report',month,generatedAt:new Date().toISOString(),recipient,branches,totalUsageGB:Math.round(total*100)/100,recordCount:data.rows.length,usage:data.rows,devices:data.devices};
  }
  function updateUI(){
    const c=saved();
    setStatus('frcRecipient',c.autoEmail||RECIPIENT_DEFAULT);
    setStatus('frcLastBackup',c.lastBackup?new Date(c.lastBackup).toLocaleString():'—');
    setStatus('frcLastRun',c.lastRun?new Date(c.lastRun).toLocaleString():'—');
    setStatus('frcNextRun',nextSchedule());
    setStatus('frcEndpointState',c.endpoint?'Configured':'Not configured');
    setStatus('frcAutomationStatus',c.endpoint?'Automation configured':'Date/email saved — endpoint required for background sending');
    if($('frcManualMonth')&&!$('frcManualMonth').value)$('frcManualMonth').value=monthNow();
    if($('frcAutoEmail')&&!$('frcAutoEmail').value)$('frcAutoEmail').value=c.autoEmail||RECIPIENT_DEFAULT;
    const savedDate=c.autoDate||'';
    const validFutureDate=/^\d{4}-\d{2}-\d{2}$/.test(savedDate) && new Date(savedDate+'T23:59:59+05:30').getTime()>Date.now();
    if($('frcAutoDate'))$('frcAutoDate').value=validFutureDate?savedDate:nextMonthDate();
    if($('frcAutoTime')&&!$('frcAutoTime').value)$('frcAutoTime').value=c.autoTime||'09:00';
    if($('frcAutoMonth')&&!$('frcAutoMonth').value)$('frcAutoMonth').value=c.autoMonth||monthNow();
    if($('frcEndpoint')&&!$('frcEndpoint').value)$('frcEndpoint').value=c.endpoint||'';
    if($('frcToken')&&!$('frcToken').value)$('frcToken').value=c.token||'';
  }
  function nextMonthDate(){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,10);}
  async function generate(){
    setStatus('frcOverallStatus','Reading Firebase…');setMsg('Step 1/5: reading Chennai, Bangalore and Hosur data…');
    try{
      const month=$('frcManualMonth')?.value||monthNow();
      const data=await collect(month);
      const total=data.rows.reduce((a,r)=>a+num(r.bytesGB),0);
      setStatus('frcRecords',data.rows.length.toLocaleString());
      setStatus('frcTotal',typeof fmtGB==='function'?fmtGB(total):total.toFixed(2)+' GB');
      setStatus('frcBranches',REPORT_BRANCHES.length);
      setStatus('frcOverallStatus','Complete');
      setMsg(`Selected month ${month}: ${data.rows.length.toLocaleString()} Firebase records collected. Excel and PDF are ready from the buttons below.`);
      if(typeof showToast==='function')showToast('Full report generated ✓');
      excelCache=null; prepareExcel(month).catch(e=>console.warn('Excel pre-build skipped:',e&&e.message));
      try{ if(typeof renderReportPage==='function')renderReportPage(); }catch(reportErr){ console.warn('Report page render warning:',reportErr); }
    }catch(e){console.error(e);setStatus('frcOverallStatus','Error');setMsg('Firebase report failed: '+(e.message||e));}
  }
  async function backup(){
    setStatus('frcOverallStatus','Creating backup…');setMsg('Reading complete Firebase /data tree…');
    try{const r=await fetch(FIREBASE_DB_URL.replace(/\/$/,'')+'/data.json',{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Firebase HTTP '+r.status);const data=await r.json();const stamp=new Date().toISOString().replace(/[:.]/g,'-');downloadBlob('NOC-Firebase-Full-Backup-'+stamp+'.json',JSON.stringify({backupType:'NOC Dashboard Firebase full backup',generatedAt:new Date().toISOString(),firebasePath:'/data',data},null,2));const c=saved();c.lastBackup=new Date().toISOString();save(c);updateUI();setStatus('frcOverallStatus','Backup complete');setMsg('Full Firebase backup downloaded.');if(typeof showToast==='function')showToast('Firebase backup downloaded ✓');}
    catch(e){setStatus('frcOverallStatus','Backup failed');setMsg('Backup failed: '+(e.message||e));}
  }
  function endpointConfig(){return saved().endpoint||($('frcEndpoint')?.value||'').trim();}
  async function postEndpoint(action, extra={}){
    const endpoint=endpointConfig(); if(!endpoint) throw new Error('Enter the Google Apps Script Web App URL first.');
    const month=$('frcManualMonth')?.value||monthNow();
    const payload={action,recipient:extra.recipient||$('frcManualEmail')?.value||$('frcAutoEmail')?.value||RECIPIENT_DEFAULT,month,firebaseDbUrl:typeof FIREBASE_DB_URL!=='undefined'?FIREBASE_DB_URL:'',autoDate:$('frcAutoDate')?.value||nextMonthDate(),autoTime:$('frcAutoTime')?.value||'09:00',autoMonth:$('frcAutoMonth')?.value||month,...extra};
    // Google Apps Script Web Apps commonly trigger a CORS/preflight problem when
    // the browser sends application/json. Use a simple GET request instead.
    // doGet() on the mailer accepts the same action/payload and performs the send.
    const qs=new URLSearchParams(payload);
    return await new Promise((resolve,reject)=>{
      const cb='__nocMailerCb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const script=document.createElement('script');
      const timer=setTimeout(()=>{cleanup();reject(new Error('Apps Script did not respond. Check that the Web App URL ends with /exec and access is allowed.'));},30000);
      function cleanup(){clearTimeout(timer);try{delete window[cb];}catch(e){window[cb]=undefined;}script.remove();}
      window[cb]=(out)=>{cleanup();if(out&&out.ok===false)reject(new Error(out.error||'Apps Script returned an error.'));else resolve(out||{ok:true});};
      script.onerror=()=>{cleanup();reject(new Error('Could not reach the Apps Script Web App. Check the endpoint URL and deployment access.'));};
      script.src=endpoint+(endpoint.includes('?')?'&':'?')+qs.toString()+'&callback='+encodeURIComponent(cb);
      document.head.appendChild(script);
    });
  }
  function saveAutomation(){
    const c=saved(); c.autoDate=$('frcAutoDate')?.value||nextMonthDate(); c.autoTime=$('frcAutoTime')?.value||'09:00'; c.autoMonth=$('frcAutoMonth')?.value||$('frcManualMonth')?.value||monthNow(); c.autoEmail=($('frcAutoEmail')?.value||RECIPIENT_DEFAULT).trim(); c.endpoint=($('frcEndpoint')?.value||'').trim(); save(c); updateUI();
    if(!c.endpoint){setMsg(`Automation saved for ${c.autoDate} at ${c.autoTime} → ${c.autoEmail}. Enter the Apps Script URL to activate it.`);setStatus('frcAutomationStatus','Schedule saved — endpoint required');return;}
    setStatus('frcAutomationStatus','Saving schedule…'); postEndpoint('schedule',{recipient:c.autoEmail,month:c.autoMonth}).then(()=>{setStatus('frcAutomationStatus','Automation scheduled');setMsg(`Automation scheduled for ${c.autoDate} at ${c.autoTime} → ${c.autoEmail}. Excel + PDF will be emailed.`);if(typeof showToast==='function')showToast('Automation scheduled ✓');}).catch(e=>{setStatus('frcAutomationStatus','Schedule failed');setMsg('Automation schedule failed: '+e.message);});
  }
  async function testEndpoint(){
    const email=($('frcManualEmail')?.value||$('frcAutoEmail')?.value||RECIPIENT_DEFAULT).trim();
    const month=$('frcManualMonth')?.value||monthNow();
    if(!endpointConfig()){setMsg('Paste the Google Apps Script Web App URL first.');return;}
    setStatus('frcAutomationStatus','Testing endpoint…');
    try{
      const out=await postEndpoint('ping',{recipient:email,month});
      setStatus('frcAutomationStatus','Endpoint connected ✓');
      setMsg('Google Apps Script connection is working. Now you can use Send Manual Email + Files or Save Automation.');
      if(typeof showToast==='function')showToast('Apps Script connected ✓');
      return out;
    }catch(e){
      setStatus('frcAutomationStatus','Endpoint test failed');
      setMsg('Endpoint test failed: '+e.message);
      throw e;
    }
  }
  async function runAutomation(){
    const c=saved(); if(!c.endpoint){setMsg('Enter the Google Apps Script Web App URL first.');return;} setStatus('frcOverallStatus','Sending…');
    try{await postEndpoint('send',{recipient:c.autoEmail||RECIPIENT_DEFAULT,month:c.autoMonth||$('frcManualMonth')?.value||monthNow()});c.lastRun=new Date().toISOString();save(c);updateUI();setStatus('frcOverallStatus','Sent');setMsg(`Automation report sent to ${c.autoEmail} with Excel + PDF.`);if(typeof showToast==='function')showToast('Automation sent ✓');}catch(e){setStatus('frcOverallStatus','Send failed');setMsg('Automation send failed: '+e.message);}
  }
  async function manualEmail(){
    const email=($('frcManualEmail')?.value||'').trim();
    const month=$('frcManualMonth')?.value||monthNow();
    if(!email){setMsg('Enter an email address first.');return;}
    const subject=`NOC Monthly Report - ${month}`;
    const body=`Hi,\n\nPlease find the NOC monthly report for ${month} attached.\n\nAttachments: Excel report and PDF report.\n\nRegards,\nNOC Dashboard`;
    const gmail='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(email)+'&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
    setStatus('frcOverallStatus','Ready to email');
    setMsg('Gmail compose opened. Attach the downloaded Excel/PDF files and click Send.');
    window.open(gmail,'_blank','noopener');
  }
  function buildMonthlyPdf(wb,month){
    if(!window.jspdf||!window.jspdf.jsPDF) throw new Error('PDF library is not ready yet. Try again in a moment.');
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('NOC Monthly Bandwidth Report - '+month,14,16);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(95,105,120);
    doc.text('All branches  •  Generated: '+new Date().toLocaleString()+'  •  Full per-day detail is in the attached Excel.',14,22);
    doc.setTextColor(0,0,0);
    let y=30, first=true;
    ['Host-Usage-Summary','Daily Totals'].forEach(name=>{
      const rows=(wb.Sheets[name]&&wb.Sheets[name].__rows)||[];
      if(rows.length<2) return;
      if(!first){ y=doc.lastAutoTable.finalY+12; if(y>170){doc.addPage();y=16;} }
      first=false;
      doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(name.replace(/-/g,' '),14,y);
      doc.autoTable({
        startY:y+3,
        head:[rows[0].map(String)],
        body:rows.slice(1).map(r=>r.map(v=>v==null?'':String(v))),
        theme:'grid',
        styles:{fontSize:8,cellPadding:2,overflow:'linebreak'},
        headStyles:{fillColor:[32,52,84],textColor:[255,255,255],fontStyle:'bold'},
        margin:{left:14,right:14}
      });
    });
    const n=doc.internal.getNumberOfPages();
    for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(120,120,120);doc.text('Page '+i+' of '+n,283,202,{align:'right'});}
    return new Uint8Array(doc.output('arraybuffer'));
  }
  let excelCache=null; // {month,file}
  async function buildExcelFile(month){
    // Build the monthly workbook silently (no download, no misleading toast/log).
    let captured=null; const origWrite=XLSX.writeFile, origToast=window.showToast, origLog=window.logChange;
    const sub=document.getElementById('reportSub'); const subText=sub?sub.textContent:'', subColor=sub?sub.style.color:'';
    try{
      XLSX.writeFile=(wb,name)=>{captured={wb,name};};
      window.showToast=()=>{}; window.logChange=async()=>{};
      if($('reportMonth'))$('reportMonth').value=month;
      await downloadMonthlyExcel();
    }finally{
      XLSX.writeFile=origWrite; window.showToast=origToast; window.logChange=origLog;
      if(sub){sub.textContent=subText;sub.style.color=subColor;}
    }
    if(!captured) throw new Error('No Excel was created. Check that data exists for '+month+'.');
    const name=captured.name.endsWith('.xlsx')?captured.name:captured.name+'.xlsx';
    return new File([XLSX.toBytes(captured.wb)],name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  async function prepareExcel(month){
    if(excelCache&&excelCache.month===month) return excelCache.file;
    const file=await buildExcelFile(month); excelCache={month,file}; return file;
  }
  async function shareExcel(){
    const btn=$('frcShareBtn'), label='✉ Share Excel to Gmail (auto-attach)';
    const month=$('frcManualMonth')?.value||monthNow();
    const subject=`NOC Monthly Report - ${month}`;
    const text=`Hi,\n\nPlease find the NOC monthly report for ${month} attached (Excel).\n\nRegards,\nNOC Dashboard`;
    try{
      if(btn){btn.disabled=true;}
      let file;
      if(excelCache&&excelCache.month===month) file=excelCache.file;
      else{ if(btn)btn.textContent='Preparing Excel…'; setMsg('Preparing the Excel for '+month+'…'); file=await prepareExcel(month); }
      if(!(navigator.canShare&&navigator.canShare({files:[file]}))){
        // No file-share support (most PC browsers): download, then open Gmail so the file can be attached.
        const u=URL.createObjectURL(file),a=document.createElement('a');a.href=u;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);
        setMsg('This browser cannot attach files automatically. Excel downloaded; Gmail opened — attach the downloaded file.');
        manualEmail(); return;
      }
      await navigator.share({files:[file],title:subject,text});
      setMsg('Shared. In Gmail the Excel is already attached — add the recipient and press Send.');
    }catch(e){
      if(e&&e.name==='AbortError'){setMsg('Share cancelled.');}
      else if(e&&e.name==='NotAllowedError'){setMsg('Excel is ready. Tap the button once more to share it.');}
      else{console.error(e);setMsg('Share failed: '+((e&&e.message)||e));}
    }finally{ if(btn){btn.disabled=false;btn.textContent=label;} }
  }
  async function sendWithExcel(){
    const btn=$('frcAutoSendBtn');
    const email=($('frcManualEmail')?.value||'').trim();
    const month=$('frcManualMonth')?.value||monthNow();
    const endpoint=($('frcEndpoint')?.value||'').trim();
    const token=($('frcToken')?.value||'').trim();
    if(!email){setMsg('Enter an email address first.');return;}
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec$/.test(endpoint)){setMsg('Paste the Apps Script Web App URL (it must end with /exec).');return;}
    if(!token){setMsg('Enter the secret token that is set in the Apps Script.');return;}
    const c=saved(); c.endpoint=endpoint; c.token=token; save(c);
    if(btn){btn.disabled=true;btn.textContent='Preparing Excel…';}
    let captured=null; const origWrite=XLSX.writeFile;
    try{
      setStatus('frcOverallStatus','Preparing Excel…'); setMsg('Building the monthly Excel for '+month+'…');
      // Capture the workbook instead of downloading it.
      XLSX.writeFile=(wb,name)=>{captured={wb,name};};
      if($('reportMonth'))$('reportMonth').value=month;
      await downloadMonthlyExcel();
    }finally{XLSX.writeFile=origWrite;}
    try{
      if(!captured) throw new Error('Excel was not created. Check that data exists for '+month+'.');
      const toB64=u8=>{let bin='';for(let i=0;i<u8.length;i+=0x8000)bin+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));return btoa(bin);};
      const xlsxName=captured.name.endsWith('.xlsx')?captured.name:captured.name+'.xlsx';
      if(btn)btn.textContent='Preparing PDF…'; setMsg('Building the PDF report…');
      const pdfBytes=buildMonthlyPdf(captured.wb,month);
      const body={action:'sendReport',token,recipient:email,
        subject:`NOC Monthly Report - ${month}`,
        message:`Hi,\n\nPlease find the NOC monthly report for ${month} attached (Excel + PDF).\n\nRegards,\nNOC Dashboard`,
        attachments:[
          {filename:xlsxName,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data:toB64(XLSX.toBytes(captured.wb))},
          {filename:xlsxName.replace(/\.xlsx$/i,'.pdf'),mimeType:'application/pdf',data:toB64(pdfBytes)}
        ]};
      if(btn)btn.textContent='Sending…'; setStatus('frcOverallStatus','Sending…'); setMsg('Sending email with Excel + PDF attached…');
      let out=null;
      try{
        const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});
        out=await res.json();
      }catch(netErr){
        // The request may already have been delivered even if the reply could not be read. Never auto-retry (would double-send).
        setStatus('frcOverallStatus','Check inbox');
        setMsg('Request was sent but the confirmation could not be read. Check the recipient inbox / your Sent folder before trying again.');
        return;
      }
      if(!out||out.ok!==true) throw new Error((out&&out.error)||'Mailer returned an error.');
      c.lastRun=new Date().toISOString(); save(c); updateUI();
      setStatus('frcOverallStatus','Sent'); setMsg(`Email sent to ${email} with Excel + PDF attached.`);
      if(typeof showToast==='function')showToast('Email sent with Excel + PDF ✓');
      if(typeof logChange==='function'){ try{ await logChange('Emailed monthly Excel',`${month} → ${email}`);}catch(e){} }
    }catch(e){
      console.error(e); setStatus('frcOverallStatus','Send failed'); setMsg('Send failed: '+(e.message||e));
    }finally{ if(btn){btn.disabled=false;btn.textContent='✉ Send Email with Excel + PDF (Auto)';} }
  }
  async function downloadFrcExcel(){
    const month=$('frcManualMonth')?.value||monthNow(), btn=$('frcExcelBtn'); if(btn){btn.disabled=true;btn.textContent='Preparing Excel…';}
    try{if(typeof downloadMonthlyExcel==='function'){if($('reportMonth'))$('reportMonth').value=month;await downloadMonthlyExcel();}else throw new Error('Excel export is unavailable.');}finally{if(btn){btn.disabled=false;btn.textContent='⇩ Download Excel';}}
  }
  function printReport(){if(typeof renderReportPage==='function')renderReportPage();if(typeof goToView==='function')goToView('report');setTimeout(()=>window.print(),300);}
  function bind(){
    $('frcGenerateBtn')?.addEventListener('click',generate);$('frcBackupBtn')?.addEventListener('click',backup);$('frcPrintBtn')?.addEventListener('click',printReport);$('frcPrintBtn2')?.addEventListener('click',printReport);
    $('frcManualSendBtn')?.addEventListener('click',manualEmail);$('frcAutoSendBtn')?.addEventListener('click',sendWithExcel);$('frcShareBtn')?.addEventListener('click',shareExcel);
    $('frcManualMonth')?.addEventListener('change',()=>{excelCache=null;});
    $('frcCopyScriptBtn')?.addEventListener('click',async()=>{const ta=$('frcScriptCode');try{await navigator.clipboard.writeText(ta.value);}catch(e){ta.select();document.execCommand('copy');}setMsg('Mailer script copied. Paste it into Google Apps Script.');});$('frcExcelBtn')?.addEventListener('click',downloadFrcExcel);
    updateUI();
    // Automatically refresh the report center once Firebase/session data is ready.
    setTimeout(()=>{ try{ generate(); }catch(e){ console.warn('Automatic report refresh:',e); } },900);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
