(function init(){
  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded",init,{once:true}); return; }
  var shell=document.getElementById("appShell"), chat=document.getElementById("usageChat"), bubble=document.getElementById("nocBotBubble"), btn=document.getElementById("usageChatBtn");
  function sync(){
    var loggedIn=!!shell && shell.style.display!=="none" && getComputedStyle(shell).display!=="none";
    document.body.classList.toggle("noc-logged-in",loggedIn);
    var open=!!chat && chat.classList.contains("open");
    document.body.classList.toggle("noc-chat-open",open);
    document.body.classList.remove("noc-bubble-off");           // greeting always comes back after the chat is closed
    if(!loggedIn && open){ chat.classList.remove("open"); }       // never leave the chat panel on the login page
  }
  if(shell) new MutationObserver(sync).observe(shell,{attributes:true,attributeFilter:["style","class"]});
  if(chat) new MutationObserver(sync).observe(chat,{attributes:true,attributeFilter:["class"]});
  if(bubble && btn) bubble.addEventListener("click",function(){btn.click();});
  sync();
})();
