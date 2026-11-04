(() => {
  "use strict";
  const state={gifts:[],balance:null,selectedCode:"",category:"all",search:"",recipient:"",contextType:"user",contextId:"",page:0,pageSize:72,sort:"high"};
  const labels={all:"All gifts",flowers:"Flowers",hearts:"Love & hearts",animals:"Animals & creatures",vehicles:"Vehicles",music:"Music",sports:"Sports",food_drink:"Food & drinks",fashion_beauty:"Fashion & beauty",luxury:"Luxury",celebrations:"Celebrations",fantasy:"Fantasy & cosmic",nature:"Nature",travel:"Travel",games:"Games",community:"Community",symbols:"Symbols",other:"More gifts"};
  const emojis={all:"✦",flowers:"🌹",hearts:"💖",animals:"🦁",vehicles:"🚀",music:"🎵",sports:"🏆",food_drink:"🍰",fashion_beauty:"👑",luxury:"💎",celebrations:"🎉",fantasy:"✨",nature:"🌴",travel:"🌍",games:"🎮",community:"🤝",symbols:"🔆",other:"🎁"};
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function request(path,options={}) {
    let response;
    try{response=await fetch("/api"+path,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});}
    catch{throw new Error("Minglora could not be reached. Check your connection and try again.");}
    let data={};try{data=await response.json();}catch{}
    if(!response.ok)throw new Error(data.error||"The request could not be completed.");
    return data;
  }
  function categories(){
    const available=new Set(state.gifts.map(g=>g.category));
    return ["all",...Object.keys(labels).filter(k=>k!=="all"&&available.has(k))];
  }
  function categoryMarkup(){
    return categories().map(k=>"<button type='button' class='gift-category-chip "+(state.category===k?"active":"")+"' data-gift-category='"+k+"'><span>"+emojis[k]+"</span> "+labels[k]+"</button>").join("");
  }
  function filtered(){
    const q=state.search.trim().toLowerCase();
    const rows=state.gifts.filter(g=>(state.category==="all"||g.category===state.category)&&(!q||(g.name+" "+(labels[g.category]||"")+" "+g.code+" "+String(g.coin_price)).toLowerCase().includes(q)));
    if(state.sort==="name")rows.sort((a,b)=>a.name.localeCompare(b.name));
    else if(state.sort==="high")rows.sort((a,b)=>Number(b.asset_version==="2")-Number(a.asset_version==="2")||b.coin_price-a.coin_price||a.name.localeCompare(b.name));
    else rows.sort((a,b)=>a.coin_price-b.coin_price||a.name.localeCompare(b.name));
    return rows;
  }
  function selected(){return state.gifts.find(g=>g.code===state.selectedCode)||null;}
  function card(g){
    const image=g.image_url?"<img class='gift-card-image' loading='lazy' decoding='async' src='"+esc(g.image_url)+"' alt='Original Minglora artwork: "+esc(g.name)+"'>":"<span class='gift-emoji-preview' aria-label='"+esc(g.name)+"'>"+esc(g.emoji||"🎁")+"</span>";
    return "<button type='button' class='gift-catalog-card "+(state.selectedCode===g.code?"selected":"")+"' data-gift-select='"+esc(g.code)+"' aria-pressed='"+(state.selectedCode===g.code)+"'><span class='gift-catalog-art'>"+image+"</span><strong>"+esc(g.name)+"</strong><small>◈ "+Number(g.coin_price).toLocaleString()+" Coins</small></button>";
  }
  function updateSelected(){
    const g=selected(),title=document.getElementById("minglora-gift-selected"),price=document.getElementById("minglora-gift-selected-price");
    const image=document.getElementById("minglora-gift-selected-image"),model=document.getElementById("minglora-gift-selected-model");
    const sound=document.getElementById("minglora-gift-sound"),send=document.getElementById("minglora-gift-send");
    if(title)title.textContent=g?g.name:"Choose a gift above";
    if(price)price.textContent=g?Number(g.coin_price).toLocaleString()+" Minglora Coins · "+(labels[g.category]||"Gift"):"Select a gift to preview it";
    if(image){image.src=g?.image_url||"";image.alt=g?g.name+" original Minglora artwork":"";image.hidden=!g?.image_url;}
    if(model){if(g?.model_url){model.src=g.model_url;model.alt=g.name+" original Minglora 3D gift";model.hidden=false;}else{model.removeAttribute("src");model.hidden=true;}}
    if(sound)sound.disabled=!g;
    if(send)send.disabled=!g;
  }
  function drawGrid(){
    const grid=document.getElementById("minglora-gift-grid"),count=document.getElementById("minglora-gift-count"),more=document.getElementById("minglora-gift-more");
    if(!grid)return;
    const rows=filtered(),shown=rows.slice(0,(state.page+1)*state.pageSize);
    if(count)count.textContent=rows.length.toLocaleString()+" gifts";
    grid.innerHTML=shown.length?shown.map(card).join(""):"<div class='gift-empty-state'>No gifts match your search.</div>";
    if(more){more.hidden=shown.length>=rows.length;more.textContent="Show more gifts · "+Math.max(0,rows.length-shown.length).toLocaleString()+" remaining";}
    grid.querySelectorAll("[data-gift-select]").forEach(b=>b.addEventListener("click",()=>{state.selectedCode=b.dataset.giftSelect;drawGrid();updateSelected();}));
    updateSelected();
  }
  function updateContext(){
    const type=document.getElementById("minglora-gift-context"),wrap=document.getElementById("minglora-gift-context-id-wrap"),input=document.getElementById("minglora-gift-context-id"),help=document.getElementById("minglora-gift-context-help");
    if(!type||!wrap||!input)return;
    wrap.hidden=type.value==="user";input.required=type.value!=="user";
    if(type.value==="post"){input.placeholder="Post ID";if(help)help.textContent="The Gift button on a post fills in its post ID automatically.";}
    else if(type.value==="video"){input.placeholder="Short video ID";if(help)help.textContent="Use the published Minglora short-video ID.";}
    else if(type.value==="photo"){input.placeholder="Photo album ID";if(help)help.textContent="Use the active Minglora photo album ID.";}
    else if(help)help.textContent="Send directly to a member using their unique @username.";
  }
  async function render(){
    const main=document.getElementById("main-content");if(!main)return;
    main.innerHTML="<section class='card empty-state'><h3>Loading Minglora Gifts</h3><p>Connecting to the complete gift collection…</p></section>";
    const results=await Promise.allSettled([request("/coins/catalog"),request("/coins/wallet")]);
    if(results[0].status!=="fulfilled")throw results[0].reason;
    state.gifts=Array.isArray(results[0].value.gifts)?results[0].value.gifts:[];
    state.balance=results[1].status==="fulfilled"?Number(results[1].value.wallet?.balance_coins??0):null;
    if(!state.selectedCode&&state.gifts.length)state.selectedCode=state.gifts[0].code;
    const balance=state.balance===null?"Balance unavailable":state.balance.toLocaleString()+" Coins available";
    main.innerHTML=
      "<section class='page-heading gift-page-heading'><div><span class='eyebrow'>Minglora Gift Studio</span><h1>Every moment deserves a gift 🎁</h1><p class='muted'>Explore the complete Minglora collection. Each gift is built as original Minglora artwork and a 3D model, with its own animated presentation and synthesized sound effect.</p></div><div class='gift-balance-pill'><small>Your balance</small><strong>"+esc(balance)+"</strong><button type='button' class='secondary' id='minglora-gift-recharge'>Recharge Coins</button></div></section>"+
      "<section class='card gift-catalogue-panel'><div class='gift-catalogue-toolbar'><div><h2>The complete gift collection</h2><p class='muted'>"+state.gifts.length.toLocaleString()+" individual Minglora gifts · original assets</p></div><span class='gift-count' id='minglora-gift-count'>"+state.gifts.length+" gifts</span></div>"+
      "<div class='gift-browse-controls'><label class='gift-search-label'><span>Find a gift</span><input id='minglora-gift-search' type='search' placeholder='Search every gift by name…' value='"+esc(state.search)+"'></label><label class='gift-sort-label'><span>Sort</span><select id='minglora-gift-sort'><option value='high'>Price: high to low · Premium first</option><option value='price'>Price: low to high</option><option value='name'>Name A–Z</option></select></label></div>"+
      "<div class='gift-category-row' id='minglora-gift-categories'>"+categoryMarkup()+"</div><div class='gift-catalogue-grid' id='minglora-gift-grid'></div><button type='button' class='secondary gift-load-more' id='minglora-gift-more' hidden>Show more gifts</button></section>"+
      "<section class='card gift-preview-panel'><div class='gift-preview-copy'><span class='eyebrow'>Gift preview</span><h2 id='minglora-gift-selected'>Choose a gift above</h2><p class='muted' id='minglora-gift-selected-price'>Select a gift to preview it</p><div class='gift-preview-actions'><button type='button' class='secondary' id='minglora-gift-sound' disabled>♫ Preview sound</button></div></div><div class='gift-preview-stage'><img id='minglora-gift-selected-image' alt='' hidden><model-viewer id='minglora-gift-selected-model' camera-controls auto-rotate rotation-per-second='22deg' interaction-prompt='none' shadow-intensity='.7' exposure='1.12' hidden></model-viewer></div></section>"+
      "<section class='card gift-send-panel'><div class='gift-send-panel-heading'><div><span class='eyebrow'>Send a gift</span><h2>Choose who receives it</h2></div></div><form id='minglora-gift-form' class='gift-send-form'>"+
      "<label>Recipient username<input id='minglora-gift-recipient' name='username' maxlength='31' autocomplete='off' placeholder='@Username' value='"+esc(state.recipient)+"' required></label>"+
      "<label>Gift destination<select id='minglora-gift-context' name='contextType'><option value='user'>Direct to member</option><option value='post'>Post / photo / attached video</option><option value='video'>Short video</option><option value='photo'>Photo album</option></select></label>"+
      "<label id='minglora-gift-context-id-wrap' hidden>Content ID<input id='minglora-gift-context-id' name='contextId' value='"+esc(state.contextId)+"' placeholder='Content ID'></label>"+
      "<p class='gift-context-help' id='minglora-gift-context-help'>Send directly to a member using their unique @username.</p>"+
      "<div class='gift-send-form-footer'><span class='muted'>The selected gift's exact coin price is deducted after the recipient and destination pass verification.</span><button type='submit' class='primary' id='minglora-gift-send' disabled>Send gift</button></div><p id='minglora-gift-status' class='gift-send-status' role='status'></p></form></section>";
    const sort=document.getElementById("minglora-gift-sort");if(sort)sort.value=state.sort;
    document.getElementById("minglora-gift-search")?.addEventListener("input",e=>{state.search=e.target.value;state.page=0;drawGrid();});
    document.getElementById("minglora-gift-sort")?.addEventListener("change",e=>{state.sort=e.target.value;state.page=0;drawGrid();});
    document.getElementById("minglora-gift-categories")?.addEventListener("click",e=>{
      const b=e.target.closest("[data-gift-category]");if(!b)return;state.category=b.dataset.giftCategory;state.page=0;document.getElementById("minglora-gift-categories").innerHTML=categoryMarkup();drawGrid();
    });
    document.getElementById("minglora-gift-more")?.addEventListener("click",()=>{state.page++;drawGrid();});
    document.getElementById("minglora-gift-sound")?.addEventListener("click",()=>{const g=selected();if(g){window.MingloraGiftFX?.prime();window.MingloraGiftFX?.preview(g);}});
    document.getElementById("minglora-gift-context")?.addEventListener("change",e=>{state.contextType=e.target.value;state.contextId="";const input=document.getElementById("minglora-gift-context-id");if(input)input.value="";updateContext();});
    document.getElementById("minglora-gift-recipient")?.addEventListener("input",e=>{state.recipient=e.target.value;});
    document.getElementById("minglora-gift-context-id")?.addEventListener("input",e=>{state.contextId=e.target.value;});
    document.getElementById("minglora-gift-recharge")?.addEventListener("click",()=>window.activateNav?.("coins"));
    document.getElementById("minglora-gift-form")?.addEventListener("submit",sendGift);
    updateContext();drawGrid();
  }
  async function sendGift(event){
    event.preventDefault();
    const button=document.getElementById("minglora-gift-send"),status=document.getElementById("minglora-gift-status"),gift=selected();
    const username=String(document.getElementById("minglora-gift-recipient")?.value||"").trim().replace(/^@/,"").toLowerCase();
    const contextType=document.getElementById("minglora-gift-context")?.value||"user";
    const contextId=contextType==="user"?null:String(document.getElementById("minglora-gift-context-id")?.value||"").trim();
    if(!gift){if(status)status.textContent="Select a gift before sending.";return;}
    if(!/^[a-z0-9_]{3,30}$/.test(username)){if(status)status.textContent="Enter a valid @username (3–30 letters, numbers or underscores).";return;}
    if(contextType!=="user"&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contextId||"")){if(status)status.textContent="Enter a valid content ID, or open Gifts from the relevant post.";return;}
    window.MingloraGiftFX?.prime();if(button)button.disabled=true;if(status)status.textContent="Verifying recipient and sending gift…";
    try{
      const result=await request("/gifts/send",{method:"POST",body:JSON.stringify({username,giftCode:gift.code,contextType,contextId})});
      const sent=result.gift||{};state.recipient="@"+(sent.recipientUsername||username);state.balance=Number(sent.remainingCoins);
      if(status)status.textContent=(sent.giftName||gift.name)+" sent to @"+(sent.recipientUsername||username)+". "+state.balance.toLocaleString()+" Coins remaining.";
      const balance=document.querySelector(".gift-balance-pill strong");if(balance&&Number.isFinite(state.balance))balance.textContent=state.balance.toLocaleString()+" Coins available";
      window.MingloraGiftFX?.show(gift);window.toast?.("Gift sent successfully.");
    }catch(error){if(status)status.textContent=error.message;window.toast?.(error.message);}
    finally{if(button)button.disabled=!selected();}
  }
  function open(options={}){
    state.recipient=options.username?"@"+String(options.username).replace(/^@/,""):state.recipient;
    state.contextType=options.contextType||"user";state.contextId=options.contextId||"";
    window.activateNav?.("gifts");
  }
  document.addEventListener("click",event=>{
    const b=event.target.closest("[data-gift-content]");if(!b)return;event.preventDefault();event.stopPropagation();
    open({username:b.dataset.giftUsername||"",contextType:b.dataset.giftContent||"post",contextId:b.dataset.giftId||""});
  });
  window.MingloraGifts={render,open};
})();