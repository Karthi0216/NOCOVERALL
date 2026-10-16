(function(){
  function init(){
    var tb=document.querySelector('#view-networkdiagram .network-diagram-toolbar');
    var ws=document.getElementById('networkWorkspace');
    if(!tb||!ws||tb.querySelector('.nd-title'))return;
    var card=ws.parentElement;
    /* title block */
    var t=document.createElement('div');t.className='nd-title';
    t.innerHTML='<svg viewBox="0 0 34 34" fill="none" stroke="#3b82f6" stroke-width="2.4"><circle cx="17" cy="7" r="4"/><circle cx="7" cy="26" r="4"/><circle cx="27" cy="26" r="4"/><path d="M15 10.5L9 22.5M19 10.5L25 22.5M11 26h12"/></svg><div><b>NETWORK DIAGRAM</b><small>NOC - M S Dhoni Global School</small></div>';
    tb.insertBefore(t,tb.firstChild);
    /* colour palette as dropdown */
    var pal=document.getElementById('networkLinePalette');
    if(pal){
      var dd=document.createElement('div');dd.className='nd-color-dd';
      var tg=document.createElement('button');tg.type='button';tg.className='btn small ghost nd-dd-btn';
      tg.innerHTML='<span class="nd-dot"></span>Line Colour \u25BE';
      pal.parentNode.insertBefore(dd,pal);dd.appendChild(tg);dd.appendChild(pal);
      tg.addEventListener('click',function(e){e.stopPropagation();dd.classList.toggle('open')});
      pal.addEventListener('click',function(e){
        var b=e.target.closest('.network-color-btn');if(!b)return;
        var c=b.dataset.color||'#FFD400',d=tg.querySelector('.nd-dot');d.style.background=c;d.style.boxShadow='0 0 8px '+c;
        if(!e.target.closest('#ndCustomBtn'))dd.classList.remove('open');
      });
      document.addEventListener('click',function(e){if(!dd.contains(e.target))dd.classList.remove('open')});
    }
    /* custom colour + multi-line drawing helpers */
    var cc=document.getElementById('ndCustomColor'),cb=document.getElementById('ndCustomBtn');
    if(cc&&cb)cc.addEventListener('input',function(){cb.dataset.color=cc.value;cb.click()});
    var al=document.getElementById('networkAddLinkBtn');
    if(al)new MutationObserver(function(){var on=ws.classList.contains('draw-mode');al.classList.toggle('drawing',on);al.textContent=on?'\u270E Drawing… (click to stop)':'+ Add Link'}).observe(ws,{attributes:true,attributeFilter:['class']});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&ws.classList.contains('draw-mode')&&al)al.click()});

    /* ===== 3D mode controller — FREE 360° ORBIT (yaw + tilt), pan, zoom ===== */
    var cv3=document.getElementById('networkCanvas');
    if(cv3){
      [[0,0],[window.__ndW||1450,0],[0,window.__ndH||900],[window.__ndW||1450,window.__ndH||900]].forEach(function(c,i){var d=document.createElement('div');d.className='nd-corner';d.dataset.i=i;d.style.left=(c[0]-1)+'px';d.style.top=(c[1]-1)+'px';cv3.appendChild(d)});
      var DEF_YAW=28,DEF_PITCH=58;
      var S=0.5,PX=0,PY=0,YAW=DEF_YAW,PITCH=DEF_PITCH,fitted=false,on=false;
      var spin=false,spinRAF=0,spinLast=0,SPIN_DPS=18;
      function clampS(v){return Math.max(.12,Math.min(2.2,v))}
      function fit(){var w=ws.clientWidth,hh=ws.clientHeight;if(!w||!hh)return;S=clampS(Math.min(w/((window.__ndW||1450)+400),hh/((window.__ndH||900)+250))*1.05);PX=0;PY=hh*0.03;fitted=true}
      var DEG=Math.PI/180;
      function apply(){
        var cp=Math.cos(PITCH*DEG);
        ws.style.setProperty('--ndY',YAW+'deg');
        ws.style.setProperty('--ndP',PITCH+'deg');
        cv3.style.transform=on?('translate('+PX+'px,'+PY+'px) scale('+S+') rotateX('+PITCH+'deg) rotateZ('+(-YAW)+'deg)'):'none';
        var under=cp<-0.02,edge=Math.abs(cp)<0.1;
        ws.classList.toggle('nd-under',under);
        ws.classList.toggle('nd-edge',edge);
        if(orbit){orbit.classList.toggle('edge',edge&&on);hudUpdate()}
        var cpass=card&&card.querySelector('.network-compass svg');
        if(cpass)cpass.style.transform=on?('rotate('+(-YAW)+'deg)'):'none';
      }
      window.__ndPanBy=function(dx,dy){PX+=dx;PY+=dy;apply()};
      function solve(A,b){var n=b.length,i,j,k;for(i=0;i<n;i++){var m=i;for(j=i+1;j<n;j++)if(Math.abs(A[j][i])>Math.abs(A[m][i]))m=j;var t=A[i];A[i]=A[m];A[m]=t;t=b[i];b[i]=b[m];b[m]=t;
        for(j=i+1;j<n;j++){var f=A[j][i]/A[i][i];for(k=i;k<n;k++)A[j][k]-=f*A[i][k];b[j]-=f*b[i]}}
        var x=new Array(n);for(i=n-1;i>=0;i--){var s2=b[i];for(j=i+1;j<n;j++)s2-=A[i][j]*x[j];x[i]=s2/A[i][i]}return x}
      /* screen point -> floor (canvas) coordinates; works from ANY viewing angle */
      window.__ndUnproject=function(e){
        if(!on)return null;
        var pts=[],W3=window.__ndW||1450,H3=window.__ndH||900,uv=[[0,0],[W3,0],[0,H3],[W3,H3]];
        for(var i=0;i<4;i++){var r=cv3.querySelector('.nd-corner[data-i="'+i+'"]').getBoundingClientRect();pts.push([r.left+r.width/2,r.top+r.height/2])}
        var A=[],b=[];
        for(i=0;i<4;i++){var x=pts[i][0],y=pts[i][1],u=uv[i][0],v=uv[i][1];
          A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v)}
        var h=solve(A,b),X=e.clientX,Y=e.clientY,d=h[6]*X+h[7]*Y+1;
        var rx=(h[0]*X+h[1]*Y+h[2])/d,ry=(h[3]*X+h[4]*Y+h[5])/d;
        if(!isFinite(rx)||!isFinite(ry))return null;
        return {x:rx,y:ry}
      };
      function setMode(v){on=v;ws.classList.toggle('nd3d',v);if(v&&!fitted)fit();if(orbit)orbit.style.display=v?'flex':'none';if(!v){setSpin(false)}apply()}

      /* ---- smooth animated move to a preset camera angle ---- */
      var tweenRAF=0;
      function wrap180(a){a=((a+180)%360+360)%360-180;return a}
      function goTo(y,p,keepSpin){
        cancelAnimationFrame(tweenRAF);
        YAW=wrap180(YAW);PITCH=wrap180(PITCH);
        var y0=YAW,p0=PITCH,dy=wrap180(y-y0),dp=wrap180(p)-p0,t0=0;
        if(!keepSpin)setSpin(false);
        function step(t){if(!t0)t0=t;var k=Math.min(1,(t-t0)/450),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
          YAW=y0+dy*e;PITCH=p0+dp*e;apply();if(k<1)tweenRAF=requestAnimationFrame(step)}
        tweenRAF=requestAnimationFrame(step)
      }
      function resetView(){fit();goTo(DEF_YAW,DEF_PITCH)}

      /* ---- auto-rotate (continuous 360° spin) ---- */
      function spinTick(t){
        if(!spin||!on){spinRAF=0;return}
        var dt=spinLast?Math.min(50,t-spinLast):16;spinLast=t;
        if(!gest&&!ws.classList.contains('dragging')&&!ws.classList.contains('draw-mode')){YAW+=SPIN_DPS*dt/1000;apply()}
        spinRAF=requestAnimationFrame(spinTick)
      }
      function setSpin(v){
        spin=v;var b=orbit&&orbit.querySelector('[data-a="spin"]');if(b){b.classList.toggle('on',v);b.textContent=v?'⏸ Spin':'▶ Spin'}
        if(v&&on&&!spinRAF){spinLast=0;spinRAF=requestAnimationFrame(spinTick)}
      }

      /* ---- orbit control pad (lives in the card so it stays put) ---- */
      var orbit=document.createElement('div');orbit.className='nd-orbit';
      orbit.innerHTML='<div class="nd-o-head"><span>360° ORBIT</span><span class="nd-o-hud"></span></div>'
        +'<div class="nd-o-row"><button data-a="yl" title="Rotate left (←)">⟲</button><button data-a="yr" title="Rotate right (→)">⟳</button><button data-a="pu" title="Tilt up (↑)">▲</button><button data-a="pd" title="Tilt down (↓)">▼</button><button data-a="zi" title="Zoom in (+)">＋</button><button data-a="zo" title="Zoom out (−)">－</button><button data-a="spin" title="Auto-rotate 360°">▶ Spin</button><button data-a="reset" title="Reset view (0 / double-click)">⌂</button></div>'
        +'<div class="nd-o-row"><button data-v="0,0">Top</button><button data-v="28,58">Iso</button><button data-v="0,70">Front</button><button data-v="90,70">Right</button><button data-v="180,70">Back</button><button data-v="270,70">Left</button><button data-v="28,130">Below</button></div>'
        +'<div class="nd-o-warn">⚠ Edge-on view — tilt up/down to move devices again</div>'
        +'<div class="nd-o-tip">Drag background = rotate any direction · Right-drag / Shift-drag = pan · Wheel / pinch = zoom · Double-click = reset</div>';
      var hudEl=orbit.querySelector('.nd-o-hud');
      function hudUpdate(){var y=((YAW%360)+360)%360,p=((PITCH%360)+360)%360;hudEl.textContent='Yaw '+Math.round(y)+'° · Tilt '+Math.round(p)+'° · '+Math.round(S/ (window.__ndFitS||S)*100)+'%'}
      card.appendChild(orbit);
      orbit.addEventListener('pointerdown',function(e){e.stopPropagation()});
      orbit.addEventListener('click',function(e){
        var b=e.target.closest('button');if(!b)return;
        var a=b.dataset.a,v=b.dataset.v;
        if(v){var q=v.split(',');goTo(+q[0],+q[1]);return}
        if(a==='yl'){goTo(YAW-15,PITCH,true)}
        else if(a==='yr'){goTo(YAW+15,PITCH,true)}
        else if(a==='pu'){goTo(YAW,PITCH-15,true)}
        else if(a==='pd'){goTo(YAW,PITCH+15,true)}
        else if(a==='zi'){S=clampS(S*1.2);apply()}
        else if(a==='zo'){S=clampS(S/1.2);apply()}
        else if(a==='spin'){setSpin(!spin)}
        else if(a==='reset'){setSpin(false);resetView()}
      });

      /* ---- view switch (3D / 2D) ---- */
      var sw=tb.querySelector('.network-view-switch');
      if(sw){var bs=sw.querySelectorAll('button');
        bs[0].onclick=function(){bs[0].classList.add('active');bs[1].classList.remove('active');fit();window.__ndFitS=S;setMode(true)};
        bs[1].onclick=function(){bs[1].classList.add('active');bs[0].classList.remove('active');setMode(false)}}

      /* ---- wheel zoom ---- */
      ws.addEventListener('wheel',function(e){if(!on)return;e.preventDefault();S=clampS(S*(e.deltaY<0?1.1:0.9));apply()},{passive:false});

      /* ---- drag: background = ORBIT, right/shift/middle = PAN, two fingers = pinch ---- */
      var ptrs={},gest=null;
      function pDist(){var k=Object.keys(ptrs);if(k.length<2)return 0;var a=ptrs[k[0]],b=ptrs[k[1]];return Math.hypot(a.x-b.x,a.y-b.y)}
      function beginGesture(x,y,pan){gest={mode:pan?'pan':'orbit',x:x,y:y,yaw:YAW,pitch:PITCH,px:PX,py:PY,flip:Math.cos(PITCH*DEG)<0?-1:1,d0:0,s0:S}}
      ws.addEventListener('pointerdown',function(e){
        if(!on||ws.classList.contains('draw-mode'))return;
        if(e.target!==ws&&e.target!==cv3)return;
        cancelAnimationFrame(tweenRAF);
        ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
        var pan=e.pointerType==='mouse'&&(e.button!==0||e.shiftKey||e.ctrlKey||e.metaKey);
        beginGesture(e.clientX,e.clientY,pan);
        if(Object.keys(ptrs).length===2){gest.mode='pinch';gest.d0=pDist();gest.s0=S}
        ws.classList.add('nd-orbiting');
        ws.setPointerCapture&&ws.setPointerCapture(e.pointerId)
      });
      ws.addEventListener('pointermove',function(e){
        if(!gest||!ptrs[e.pointerId])return;
        ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
        if(gest.mode==='pinch'){var d=pDist();if(gest.d0>0&&d>0){S=clampS(gest.s0*d/gest.d0);apply()}return}
        var dx=e.clientX-gest.x,dy=e.clientY-gest.y;
        if(gest.mode==='pan'){PX=gest.px+dx;PY=gest.py+dy}
        else{YAW=gest.yaw+dx*0.4*gest.flip;PITCH=gest.pitch-dy*0.4}
        apply()
      });
      function endPtr(e){
        if(!ptrs[e.pointerId])return;
        delete ptrs[e.pointerId];
        var k=Object.keys(ptrs);
        if(!k.length){gest=null;ws.classList.remove('nd-orbiting')}
        else if(gest&&gest.mode==='pinch'){var p=ptrs[k[0]];beginGesture(p.x,p.y,false)}
      }
      ['pointerup','pointercancel'].forEach(function(t){ws.addEventListener(t,endPtr)});
      ws.addEventListener('contextmenu',function(e){if(on&&(e.target===ws||e.target===cv3))e.preventDefault()});
      ws.addEventListener('dblclick',function(e){if(!on||ws.classList.contains('draw-mode'))return;if(e.target!==ws&&e.target!==cv3)return;setSpin(false);resetView()});

      /* ---- keyboard (while pointer is over the diagram) ---- */
      var hover=false;
      ws.addEventListener('mouseenter',function(){hover=true});ws.addEventListener('mouseleave',function(){hover=false});
      document.addEventListener('keydown',function(e){
        if(!on||!hover||e.altKey||e.ctrlKey||e.metaKey)return;
        var t=e.target&&e.target.tagName;if(t==='INPUT'||t==='SELECT'||t==='TEXTAREA'||(e.target&&e.target.isContentEditable))return;
        var k=e.key,h=true;
        if(k==='ArrowLeft')YAW-=5;else if(k==='ArrowRight')YAW+=5;
        else if(k==='ArrowUp')PITCH-=5;else if(k==='ArrowDown')PITCH+=5;
        else if(k==='+'||k==='=')S=clampS(S*1.12);else if(k==='-'||k==='_')S=clampS(S/1.12);
        else if(k==='0'){setSpin(false);resetView();e.preventDefault();return}
        else h=false;
        if(h){e.preventDefault();cancelAnimationFrame(tweenRAF);apply()}
      });

      if(window.ResizeObserver)new ResizeObserver(function(){if(on&&ws.clientWidth){fit();apply()}}).observe(ws);
      window.addEventListener('resize',function(){if(on){fit();apply()}});
      if(sw){var b2=sw.querySelectorAll('button');b2[1].classList.add('active');b2[0].classList.remove('active')}
      setMode(false);
    }
    /* labels like the reference */
    var set=function(id,txt){var b=document.getElementById(id);if(b)b.textContent=txt};
    set('networkAddNodeBtn','+ Add Node');set('networkAddLinkBtn','+ Add Link');
    set('networkSaveBtn','💾 Save');set('networkResetBtn','↻ Reset');set('networkExportBtn','⇩ Export');
    /* Edit / Delete buttons */
    var mk=function(txt,fn,before){var b=document.createElement('button');b.type='button';b.className='btn small ghost';b.textContent=txt;b.onclick=fn;tb.insertBefore(b,before);return b};
    var save=document.getElementById('networkSaveBtn');
    var toast=function(m){if(typeof showToast==='function')showToast(m)};
    mk('✎ Edit',function(){var e=document.getElementById('networkNodeEditor'),l=document.getElementById('networkLinkEditor');var v=[e,l].filter(function(x){return x&&x.style.display!=='none'})[0];if(!v){toast('Select a device or link first');return}v.scrollIntoView({behavior:'smooth',block:'center'});var i=v.querySelector('input');if(i)i.focus()},save);
    mk('🗑 Delete',function(){var a=document.getElementById('networkDeleteNodeBtn'),b=document.getElementById('networkDeleteLinkBtn');var v=[a,b].filter(function(x){return x&&x.offsetParent})[0];if(!v){toast('Select a device or link first');return}v.click()},save);
    /* move overlays into the card so they stay fixed while the canvas scrolls */
    var lg=ws.querySelector('.network-3d-legend'),cp=ws.querySelector('.network-compass');
    if(lg)lg.remove();
    if(cp){cp.innerHTML='<svg viewBox="0 0 84 84"><g fill="#e2ecfa" font-family="sans-serif" font-size="10" font-weight="700" text-anchor="middle"><text x="42" y="11">N</text><text x="42" y="80">S</text><text x="8" y="46">W</text><text x="76" y="46">E</text></g><path d="M42 16L50 42L42 46L34 42Z" fill="#3b82f6"/><path d="M42 68L50 42L42 46L34 42Z" fill="#1e293b" stroke="#475569" stroke-width=".8"/><circle cx="42" cy="42" r="3" fill="#fff"/></svg>';card.appendChild(cp)}
    
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
