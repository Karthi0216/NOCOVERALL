(function(){
  var c=document.createElement('canvas');c.id='internetBgCanvas';document.body.insertBefore(c,document.body.firstChild);
  var x=c.getContext('2d'),W,H,nodes=[],pk=[],dpr=Math.min(window.devicePixelRatio||1,2),raf=null;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size(){W=innerWidth;H=innerHeight;c.width=W*dpr;c.height=H*dpr;x.setTransform(dpr,0,0,dpr,0,0);
    var n=Math.max(28,Math.min(70,Math.round(W*H/26000)));nodes=[];
    for(var i=0;i<n;i++)nodes.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,r:1.4+Math.random()*2,hub:Math.random()<.12});}
  function light(){return document.body.classList.contains('light-theme');}
  function frame(){
    var L=light(),line=L?'30,90,170':'80,190,255',dot=L?'20,90,180':'120,215,255',D=150;
    x.clearRect(0,0,W,H);
    // faint globe-like latitude arcs
    x.strokeStyle='rgba('+line+',.05)';x.lineWidth=1;
    for(var g=1;g<=4;g++){x.beginPath();x.ellipse(W*.78,H*.3,g*150,g*70,0,0,6.283);x.stroke();}
    for(var i=0;i<nodes.length;i++){var a=nodes[i];
      if(!reduce){a.x+=a.vx;a.y+=a.vy;if(a.x<0||a.x>W)a.vx*=-1;if(a.y<0||a.y>H)a.vy*=-1;}
      for(var j=i+1;j<nodes.length;j++){var b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.sqrt(dx*dx+dy*dy);
        if(d<D){x.strokeStyle='rgba('+line+','+((1-d/D)*.28)+')';x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.stroke();
          if(!reduce&&Math.random()<.0009&&pk.length<40)pk.push({a:a,b:b,t:0});}}
    }
    for(i=0;i<nodes.length;i++){a=nodes[i];x.fillStyle='rgba('+dot+','+(a.hub?.9:.55)+')';x.beginPath();x.arc(a.x,a.y,a.hub?a.r+1.6:a.r,0,6.283);x.fill();
      if(a.hub){x.strokeStyle='rgba('+dot+',.25)';x.beginPath();x.arc(a.x,a.y,a.r+6,0,6.283);x.stroke();}}
    for(i=pk.length-1;i>=0;i--){var p=pk[i];p.t+=.02;if(p.t>=1){pk.splice(i,1);continue;}
      var px=p.a.x+(p.b.x-p.a.x)*p.t,py=p.a.y+(p.b.y-p.a.y)*p.t;
      x.fillStyle=L?'rgba(0,140,110,.9)':'rgba(90,255,210,.95)';x.shadowColor=x.fillStyle;x.shadowBlur=8;x.beginPath();x.arc(px,py,2.2,0,6.283);x.fill();x.shadowBlur=0;}
    raf=requestAnimationFrame(frame);
  }
  size();addEventListener('resize',size);
  document.addEventListener('visibilitychange',function(){if(document.hidden){cancelAnimationFrame(raf);}else{raf=requestAnimationFrame(frame);}});
  frame();
})();
