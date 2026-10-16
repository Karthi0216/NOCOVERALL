(function(){
  var IC = {
    devices:'<svg viewBox="0 0 24 24"><rect x="2" y="4" width="14" height="10" rx="2"/><path d="M2 18h14"/><rect x="18" y="9" width="4" height="11" rx="1.4"/></svg>',
    router:'<svg viewBox="0 0 24 24"><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 17h.01M11 17h.01"/><path d="M12 11V7"/><path d="M8.5 5.5a5 5 0 0 1 7 0"/><path d="M6 3a9 9 0 0 1 12 0"/></svg>',
    log:'<svg viewBox="0 0 24 24"><path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h5"/></svg>',
    dash:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/></svg>'
  };
  var STEPS = [
    {v:'devices', ic:IC.devices, t:'Connected Devices', s:'Laptops, phones and tablets on the network', go:'Open device directory'},
    {v:'add', ic:IC.log, t:'Daily Usage Log', s:'Captured on "Add today\u2019s data"', go:'Add today\u2019s data'},
    {v:'hostdash', ic:IC.router, t:'Wi-Fi Router', s:'Tracks bandwidth used by every host', go:'Open host usage dashboard'},
    {v:'dashboard', ic:IC.dash, t:'Dashboard & Reports', s:'Totals, search and Excel export', go:'View dashboard totals'}
  ];

  function open(view){
    try{
      if(typeof openModule === 'function'){ openModule(view); }
      else if(typeof goToView === 'function'){ goToView(view); }
      var btn = document.querySelector('.nav-btn[data-view="'+view+'"]');
      if(btn) btn.click();
    }catch(e){ console.error('flow navigation failed', e); }
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function buildFlow(){
    var card = document.querySelector('.flow-card');
    if(!card || card.querySelector('.flow-chain')) return;
    var wrap = document.createElement('div');
    wrap.className = 'flow-chain';
    STEPS.forEach(function(st, i){
      var hidden = document.querySelector('.nav-btn[data-view="'+st.v+'"]');
      if(hidden && hidden.offsetParent === null && document.body.classList.contains('manager-snapshot')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'flow-step';
      b.setAttribute('data-flow-view', st.v);
      b.setAttribute('aria-label', st.t + ' — ' + st.go);
      b.innerHTML =
        '<div class="flow-step-top"><span class="flow-step-ic">'+st.ic+'</span>'+
        '<span class="flow-step-idx">STEP '+(i+1)+'</span></div>'+
        '<div class="flow-step-title">'+st.t+'</div>'+
        '<div class="flow-step-sub">'+st.s+'</div>'+
        '<div class="flow-step-go">'+st.go+' &rarr;</div>';
      b.addEventListener('click', function(){ open(st.v); });
      wrap.appendChild(b);
    });
    var svg = card.querySelector('.flow-svg');
    if(svg) svg.insertAdjacentElement('afterend', wrap); else card.appendChild(wrap);
  }

  function setupNav(){
    if(document.getElementById('navScrim')) return;
    var scrim = document.createElement('div');
    scrim.id = 'navScrim';
    document.body.appendChild(scrim);
    var sidebar = document.getElementById('sidebar');
    function close(){ if(sidebar) sidebar.classList.remove('open'); document.body.classList.remove('nav-open'); }
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') close(); });
    var burger = document.getElementById('burgerBtn');
    if(burger){
      burger.addEventListener('click', function(){
        setTimeout(function(){
          document.body.classList.toggle('nav-open', !!(sidebar && sidebar.classList.contains('open')));
        }, 0);
      });
    }
    if(sidebar){
      sidebar.addEventListener('click', function(e){
        if(e.target.closest('.nav-btn, .module-tile, button, a')){
          if(window.innerWidth <= 960) setTimeout(close, 60);
        }
      });
    }
    window.addEventListener('resize', function(){ if(window.innerWidth > 960) close(); });
  }

  function init(){ buildFlow(); setupNav(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 800);
})();
