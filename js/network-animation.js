(function(){
  'use strict';
  const getSvg=()=>document.getElementById('networkLinksSvg');
  const NS='http://www.w3.org/2000/svg';
  let particleTimer=null;
  function clearParticles(svg){ if(!svg)return; svg.querySelectorAll('.network-flow-particle').forEach(n=>n.remove()); }
  function makeParticle(path,isFiber,delay){
    const c=document.createElementNS(NS,'circle');
    c.setAttribute('class','network-flow-particle'); c.setAttribute('r',isFiber?'3.1':'2.4');
    c.setAttribute('fill',isFiber?'#fde047':'#cbd5e1'); c.setAttribute('opacity',isFiber?'0.95':'0.72');
    const a=document.createElementNS(NS,'animateMotion');
    a.setAttribute('dur',isFiber?'2.2s':'2.8s'); a.setAttribute('repeatCount','indefinite'); a.setAttribute('begin',delay+'s'); a.setAttribute('rotate','auto');
    const m=document.createElementNS(NS,'mpath');
    m.setAttributeNS('http://www.w3.org/1999/xlink','href','#'+path.id); a.appendChild(m); c.appendChild(a); return c;
  }
  let observing=false;
  function watch(){ const svg=getSvg(); if(!svg||observing)return; observing=true; observer.observe(svg,{childList:true,subtree:true,attributes:true,attributeFilter:['class','d','stroke']}); }
  function installNetworkAnimation(){
    const svg=getSvg(); if(!svg)return;
    /* PERF FIX: stop observing while we add/remove particles, otherwise our own changes
       re-trigger this function forever (infinite rebuild loop). */
    observer.disconnect(); observing=false;
    try{ installNetworkAnimationInner(svg); }finally{ setTimeout(watch,0); }
  }
  function installNetworkAnimationInner(svg){
    if(document.hidden || !svg.isConnected || svg.getBoundingClientRect().width===0){ clearParticles(svg); return; }
    clearParticles(svg);
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const paths=[...svg.querySelectorAll('.network-link')].filter(p=>p.id && (p.getTotalLength?.()||0)>90);
    paths.slice(0,40).forEach((p,i)=>{
      const cls=(p.getAttribute('class')||'').toLowerCase();
      const fiber=cls.includes('fiber') || (p.getAttribute('stroke')||'').toLowerCase().includes('yellow') || (p.style.stroke||'').toLowerCase().includes('yellow');
      p.parentNode.appendChild(makeParticle(p,fiber,-(i%4)*0.55));
      
    });
  }
  window.installNetworkAnimation=installNetworkAnimation;
  const oldRender=window.renderLinks;
  if(typeof oldRender==='function'){
    window.renderLinks=function(){ const r=oldRender.apply(this,arguments); setTimeout(installNetworkAnimation,20); return r; };
  }
  const observer=new MutationObserver(()=>{ clearTimeout(particleTimer); particleTimer=setTimeout(installNetworkAnimation,300); });
  function boot(){ const svg=getSvg(); if(!svg)return; watch(); setTimeout(installNetworkAnimation,120); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot); else boot();
  window.addEventListener('resize',()=>setTimeout(installNetworkAnimation,150));
})();
