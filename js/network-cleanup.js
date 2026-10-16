(function(){
  function cleanNav(){
    const nav=document.querySelector('.sidebar nav');
    if(!nav)return;
    const order=['home','dashboard','add','search','devices','ipdirectory','hostdash','dailymanager','firewall','networkdiagram','admin'];
    const items=[...nav.querySelectorAll('.nav-btn')];
    order.forEach(v=>{const el=items.find(x=>x.dataset.view===v);if(el)nav.appendChild(el);});
  }
  function refreshDiagram(){
    try{
      if(typeof updateLinkGeometry==='function') updateLinkGeometry();
      if(typeof renderLinks==='function') renderLinks();
    }catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cleanNav);else cleanNav();
  window.addEventListener('resize',()=>setTimeout(refreshDiagram,60));
})();
