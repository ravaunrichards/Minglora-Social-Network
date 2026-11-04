(() => {
  "use strict";
  const state={gifts:[],balance:null,selectedCode:"",category:"all",search:"",recipient:"",contextType:"user",contextId:""};
  const order=["all","reactions","flowers","everyday","celebrations","animals","fantasy","vehicles","music","luxury","sports","jamaican_culture","seasonal"];
  const labels={all:"All gifts",reactions:"Reactions",flowers:"Flowers",everyday:"Everyday",celebrations:"Celebrations",animals:"Animals",fantasy:"Fantasy",vehicles:"Vehicles",music:"Music",luxury:"Luxury",sports:"Sports",jamaican_culture:"Jamaican culture",seasonal:"Seasonal"};
  function esc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
  async function request(path,options={}){
    let response;
    try{response=await fetch("/api"+path,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});}
    catch{throw new Error("Minglora could not be reached. Check your connection and try again.");}
    let data={};try{data=await response.json();}catch{}
    if(!response.ok)throw new Error(data.error||"The request could not be completed.");
    return data;
  }
  function categoryMarkup(){
    const available=new Set(state.gifts.map(g=>g.category));
    return order.filter(key=>key==="all"||available.has(key)).map(key=>"<button type='button' class='gift-category-chip "+(state.category===key?"active":"")+"' data-gift-category='"+key+"'>"+labels[key]+"</button>").join("");
  }
  function visibleGifts(){
    const q=state.search.trim().toLowerCase();
    return state.gifts.filter(g=>{
      const category=state.category==="all"||g.category===state.category;
      const match=!q||(g.name+" "+(labels[g.category]||"")+" "+g.code).toLowerCase().includes(q);
      return category&&match;
    });
  }
  function card(g){
    const selected=state.selectedCode===g.code;
    const art=g.model_url
      ?"<model-viewer class='gift-model-preview' src='"+esc(g.model_url)+"' alt='"+esc(g.name)+" 3D gift' camera-controls auto-rotate rotation-per-second='24deg' interaction-prompt='none' loading='lazy'></model-viewer>"
      :"<span class='gift-emoji-preview' aria-hidden='true'>"+esc(g.emoji||"🎁")+"</span>";
    return "<button type='button' class='gift-catalog-card "+(selected?"selected":"")+"' data-gift-select='"+esc(g.code)+"' aria-pressed='"+selected+"'><span class='gift-catalog-art'>"+art+"</span><strong>"+esc(g.name)+"</strong><small>"+Number(g.coin_price).toLocaleString()+" Coins</small></button>";
  }
  function updateSelected(){
    const gift=state.gifts.find(g=>g.code===state.selectedCode);
    const selected=document.getElementById("minglora-gift-selected");
    const button=document.getElementById("minglora-gift-send");
    if(selected)selected.textContent=gift?gift.name+" · "+Number(gift.coin_price).toLocaleString()+" Coins":"Choose a gift above";
    if(button)button.disabled=!gift;
  }
  function drawGrid(){
    const grid=document.getElementById("minglora-gift-grid");
    const count=document.getElementById("minglora-gift-count");
    if(!grid)return;
    const gifts=visibleGifts();
    if(count)count.textContent=gifts.length+" gifts";
    grid.innerHTML=gifts.length?gifts.map(card).join(""):"<div class='gift-empty-state'>No gifts match this search.</div>";
    grid.querySelectorAll("[data-gift-select]").forEach(button=>button.addEventListener("click",()=>{
      state.selectedCode=button.dataset.giftSelect;drawGrid();updateSelected();
    }));
    updateSelected();
  }
  function updateContext(){
    const type=document.getElementById("minglora-gift-context");
    const wrap=document.getElementById("minglora-gift-context-id-wrap");
    const input=document.getElementById("minglora-gift-context-id");
    const help=document.getElementById("minglora-gift-context-help");
    if(!type||!wrap||!input)return;
    wrap.hidden=type.value==="user";input.required=type.value!=="user";
    if(type.value==="post"){input.placeholder="Post ID";if(help)help.textContent="For a post, including a photo or video attached to a post, use the post ID. The Gift button on a post fills this automatically.";}
    else if(type.value==="video"){input.placeholder="Short video ID";if(help)help.textContent="Use the published Minglora short-video ID.";}
    else if(type.value==="photo"){input.placeholder="Photo album ID";if(help)help.textContent="Use the active Minglora photo album ID.";}
    else if(help)help.textContent="A direct gift is delivered to the member's gift inbox using their @username.";
  }
  async function render(){
    const main=document.getElementById("main-content");if(!main)return;
    main.innerHTML="<section class='card empty-state'><h3>Loading gifts</h3><p>Connecting to the Minglora gift catalogue…</p></section>";
    const results=await Promise.allSettled([request("/coins/catalog"),request("/coins/wallet")]);
    if(results[0].status!=="fulfilled")throw results[0].reason;
    state.gifts=Array.isArray(results[0].value.gifts)?results[0].value.gifts:[];
    state.balance=results[1].status==="fulfilled"?Number(results[1].value.wallet?.balance_coins??0):null;
    const balance=state.balance===null?"Balance unavailable":state.balance.toLocaleString()+" Coins available";
    main.innerHTML=
      "<section class='page-heading gift-page-heading'><div><span class='eyebrow'>Minglora Gifts</span><h1>Send a little celebration 🎁</h1><p class='muted'>Explore the collection and send gifts during LIVE, to a member, or with their content.</p></div><div class='gift-balance-pill'><small>Your balance</small><strong>"+esc(balance)+"</strong><button type='button' class='secondary' id='minglora-gift-recharge'>Recharge Coins</button></div></section>"+
      "<section class='card gift-catalogue-panel'><div class='gift-catalogue-toolbar'><div><h2>Gift catalogue</h2><p class='muted'>Original Minglora 3D gifts · one listing per gift</p></div><span class='gift-count' id='minglora-gift-count'>"+state.gifts.length+" gifts</span></div>"+
      "<label class='gift-search-label'><span>Search gifts</span><input id='minglora-gift-search' type='search' placeholder='Search by gift name or category…' value='"+esc(state.search)+"'></label>"+
      "<div class='gift-category-row' id='minglora-gift-categories'>"+categoryMarkup()+"</div><div class='gift-catalogue-grid' id='minglora-gift-grid'></div></section>"+
      "<section class='card gift-send-panel'><div class='gift-send-panel-heading'><div><span class='eyebrow'>Send a gift</span><h2>Choose who receives it</h2></div><span class='gift-selection-summary' id='minglora-gift-selected'>Choose a gift above</span></div>"+
      "<form id='minglora-gift-form' class='gift-send-form'><label>Recipient username<input id='minglora-gift-recipient' name='username' maxlength='31' autocomplete='off' placeholder='@Username' value='"+esc(state.recipient)+"' required></label>"+
      "<label>Gift destination<select id='minglora-gift-context' name='contextType'><option value='user' "+(state.contextType==="user"?"selected":"")+">Direct to user</option><option value='post' "+(state.contextType==="post"?"selected":"")+">Photo / Post</option><option value='video' "+(state.contextType==="video"?"selected":"")+">Short video</option><option value='photo' "+(state.contextType==="photo"?"selected":"")+">Photo album</option></select></label>"+
      "<label id='minglora-gift-context-id-wrap' "+(state.contextType==="user"?"hidden":"")+">Content reference<input id='minglora-gift-context-id' name='contextId' value='"+esc(state.contextId)+"' placeholder='Content ID'></label>"+
      "<p class='gift-context-help' id='minglora-gift-context-help'>A direct gift is delivered to the member's gift inbox using their @username.</p>"+
      "<div class='gift-send-form-footer'><span class='muted'>Coins are deducted only after the recipient and destination are verified.</span><button type='submit' class='primary' id='minglora-gift-send' disabled>Send gift</button></div><p id='minglora-gift-status' class='gift-send-status' role='status'></p></form></section>";
    document.getElementById("minglora-gift-search")?.addEventListener("input",event=>{state.search=event.target.value;drawGrid();});
    document.getElementById("minglora-gift-categories")?.addEventListener("click",event=>{
      const button=event.target.closest("[data-gift-category]");if(!button)return;
      state.category=button.dataset.giftCategory;
      document.getElementById("minglora-gift-categories").innerHTML=categoryMarkup();drawGrid();
    });
    document.getElementById("minglora-gift-context")?.addEventListener("change",event=>{
      state.contextType=event.target.value;state.contextId="";
      const input=document.getElementById("minglora-gift-context-id");if(input)input.value="";
      updateContext();
    });
    document.getElementById("minglora-gift-recipient")?.addEventListener("input",event=>{state.recipient=event.target.value;});
    document.getElementById("minglora-gift-context-id")?.addEventListener("input",event=>{state.contextId=event.target.value;});
    document.getElementById("minglora-gift-recharge")?.addEventListener("click",()=>window.activateNav?.("coins"));
    document.getElementById("minglora-gift-form")?.addEventListener("submit",sendGift);
    updateContext();drawGrid();
  }
  async function sendGift(event){
    event.preventDefault();
    const button=document.getElementById("minglora-gift-send");
    const status=document.getElementById("minglora-gift-status");
    const gift=state.gifts.find(g=>g.code===state.selectedCode);
    const username=String(document.getElementById("minglora-gift-recipient")?.value||"").trim().replace(/^@/,"").toLowerCase();
    const contextType=document.getElementById("minglora-gift-context")?.value||"user";
    const contextId=contextType==="user"?null:String(document.getElementById("minglora-gift-context-id")?.value||"").trim();
    if(!gift){if(status)status.textContent="Select a gift before sending.";return;}
    if(!/^[a-z0-9_]{3,30}$/.test(username)){if(status)status.textContent="Enter a valid @username (3–30 letters, numbers or underscores).";return;}
    if(contextType!=="user"&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contextId||"")){
      if(status)status.textContent="Enter a valid content reference, or open the Gifts page from a post's Gift button.";return;
    }
    if(button)button.disabled=true;if(status)status.textContent="Verifying recipient and sending gift…";
    try{
      const result=await request("/gifts/send",{method:"POST",body:JSON.stringify({username,giftCode:gift.code,contextType,contextId})});
      const sent=result.gift||{};state.recipient="@"+(sent.recipientUsername||username);
      state.contextType="user";state.contextId="";
      if(status)status.textContent=(sent.giftName||gift.name)+" sent to @"+(sent.recipientUsername||username)+". "+Number(sent.remainingCoins).toLocaleString()+" Coins remaining.";
      if(Number.isFinite(Number(sent.remainingCoins))){
        state.balance=Number(sent.remainingCoins);
        const pill=document.querySelector(".gift-balance-pill strong");if(pill)pill.textContent=state.balance.toLocaleString()+" Coins available";
      }
      const recipient=document.getElementById("minglora-gift-recipient");if(recipient)recipient.value=state.recipient;
      const context=document.getElementById("minglora-gift-context");if(context)context.value="user";
      const input=document.getElementById("minglora-gift-context-id");if(input)input.value="";
      updateContext();window.toast?.("Gift sent successfully.");
    }catch(error){if(status)status.textContent=error.message;window.toast?.(error.message);}
    finally{if(button)button.disabled=!state.selectedCode;}
  }
  function open(options={}){
    state.recipient=options.username?"@"+String(options.username).replace(/^@/,""):state.recipient;
    state.contextType=options.contextType||"user";state.contextId=options.contextId||"";
    window.activateNav?.("gifts");
  }
  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-gift-content]");if(!button)return;
    event.preventDefault();event.stopPropagation();
    open({username:button.dataset.giftUsername||"",contextType:button.dataset.giftContent||"post",contextId:button.dataset.giftId||""});
  });
  window.MingloraGifts={render,open};
})();