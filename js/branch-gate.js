/* Network Diagram is Chennai-only: hidden for every other branch selection */
(function(){
  function branch(){
    var b=null;
    try{ if(typeof currentBranch==='string') b=currentBranch; }catch(e){}
    if(!b){var s=document.getElementById('branchSelect'); b=s?s.value:null;}
    return (b||'').toLowerCase();
  }
  function apply(){
    var ok=true; /* diagram now available for every branch (Bangalore/Hosur start blank) */
    document.body.classList.toggle('nd-hide-network',!ok);
    if(!ok){
      var v=document.getElementById('view-networkdiagram');
      if(v&&v.classList.contains('active')){
        var home=document.querySelector('.nav-btn[data-view="home"]');
        if(home)home.click();
      }
    }
  }
  var s=document.getElementById('branchSelect');
  if(s)s.addEventListener('change',function(){setTimeout(apply,50);setTimeout(apply,600)});
  var v=document.getElementById('view-networkdiagram');
  if(v)new MutationObserver(apply).observe(v,{attributes:true,attributeFilter:['class']});
  setInterval(function(){ if(!document.hidden) apply(); },1500);
  apply();
})();
