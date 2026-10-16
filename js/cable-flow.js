(function(){
  var tb=document.querySelector('#view-networkdiagram .network-diagram-toolbar'),ws=document.getElementById('networkWorkspace');
  if(!tb||!ws||document.getElementById('ndFlowBtn'))return;
  var b=document.createElement('button');b.type='button';b.id='ndFlowBtn';b.className='btn small ghost';b.textContent='\u26A1 Flow: On';
  b.onclick=function(){var off=ws.classList.toggle('nd-flow-off');b.textContent=off?'\u26A1 Flow: Off':'\u26A1 Flow: On'};
  var sw=tb.querySelector('.network-view-switch');tb.insertBefore(b,sw||null);
})();
