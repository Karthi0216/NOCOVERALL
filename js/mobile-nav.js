(function(){
  function syncNav(){
    var sidebar=document.getElementById('sidebar');
    var open=!!(sidebar && sidebar.classList.contains('open'));
    document.body.classList.toggle('nav-open', open && window.innerWidth<=960);
    var burger=document.getElementById('burgerBtn');
    if(burger){burger.setAttribute('aria-expanded',String(open));burger.setAttribute('aria-label',open?'Close menu':'Open menu');}
  }
  function closeMobileNav(){
    var sidebar=document.getElementById('sidebar');
    if(sidebar) sidebar.classList.remove('open');
    document.body.classList.remove('nav-open');
    var burger=document.getElementById('burgerBtn');
    if(burger){burger.setAttribute('aria-expanded','false');burger.setAttribute('aria-label','Open menu');}
  }
  function init(){
    /* Never start a page with the drawer/scrim open. */
    closeMobileNav();
    var sidebar=document.getElementById('sidebar');
    var burger=document.getElementById('burgerBtn');
    if(burger && !burger.dataset.finalMobileBound){
      burger.dataset.finalMobileBound='1';
      burger.addEventListener('click',function(){setTimeout(syncNav,20);});
    }
    if(sidebar && !sidebar.dataset.finalMobileBound){
      sidebar.dataset.finalMobileBound='1';
      sidebar.addEventListener('click',function(e){
        if(e.target.closest('.nav-btn,.module-tile,#logoutBtn,#changePassBtn')) setTimeout(closeMobileNav,80);
      });
    }
    document.addEventListener('keydown',function(e){if(e.key==='Escape') closeMobileNav();});
    window.addEventListener('resize',function(){if(window.innerWidth>960) closeMobileNav();else syncNav();});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  setTimeout(init,900);
})();
