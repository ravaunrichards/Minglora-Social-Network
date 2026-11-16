(() => {
  "use strict";
  const state={gifts:[],balance:null,promoWallet:null,selectedCode:"",category:"all",search:"",recipient:"",page:0,pageSize:72,sort:"high"};
  const labels={all:"All gifts",flowers:"Flowers",hearts:"Love & hearts",animals:"Animals & creatures",vehicles:"Vehicles",music:"Music",sports:"Sports",food_drink:"Food & drinks",fashion_beauty:"Fashion & beauty",luxury:"Luxury",celebrations:"Celebrations",fantasy:"Fantasy & cosmic",nature:"Nature",travel:"Travel",games:"Games",community:"Community",symbols:"Symbols",everyday:"Everyday",reactions:"Reactions",seasonal:"Seasonal",jamaican_culture:"Jamaican culture",other:"More gifts"};
  const categoryIconFiles=Object.freeze({all:"all",flowers:"flowers",hearts:"hearts",animals:"animals",vehicles:"vehicles",music:"music",sports:"sports",food_drink:"food_drink",fashion_beauty:"fashion_beauty",luxury:"luxury",celebrations:"celebrations",fantasy:"fantasy",nature:"nature",travel:"travel",games:"games",community:"community",symbols:"symbols",everyday:"everyday",reactions:"reactions",seasonal:"seasonal",jamaican_culture:"jamaican_culture",other:"other"});
  const categoryIconUrl=k=>"/assets/icons/live-gift-categories/"+(categoryIconFiles[k]||"other")+".svg";
  const giftIconUrl=g=>g?.code&&/^[a-z0-9_-]{1,59}$/.test(String(g.code))?"/assets/gifts/catalog/"+encodeURIComponent(g.code)+"-icon.svg":"";
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
    return categories().map(k=>"<button type='button' class='gift-category-chip "+(state.category===k?"active":"")+"' data-gift-category='"+k+"'><img class='gift-category-icon' loading='lazy' decoding='async' src='"+esc(categoryIconUrl(k))+"' alt='' aria-hidden='true'> "+labels[k]+"</button>").join("");
  }
  function filtered(){
    const q=state.search.trim().toLowerCase();
    const rows=state.gifts.filter(g=>(state.category==="all"||g.category===state.category)&&(!q||(g.name+" "+(labels[g.category]||"")+" "+g.code+" "+String(g.coin_price)).toLowerCase().includes(q)));
    if(state.sort==="name")rows.sort((a,b)=>a.name.localeCompare(b.name));
    else if(state.sort==="high")rows.sort((a,b)=>Number(b.asset_version==="3")-Number(a.asset_version==="3")||b.coin_price-a.coin_price||a.name.localeCompare(b.name));
    else rows.sort((a,b)=>a.coin_price-b.coin_price||a.name.localeCompare(b.name));
    return rows;
  }
  function selected(){return state.gifts.find(g=>g.code===state.selectedCode)||null;}
  function card(g){
    const iconUrl=giftIconUrl(g);
    const image=iconUrl?"<img class='gift-card-image' data-gift-icon loading='lazy' decoding='async' src='"+esc(iconUrl)+"' alt='Transparent Minglora gift icon: "+esc(g.name)+"'>":"<span class='gift-art-unavailable' role='status'>Gift icon unavailable</span>";
    return "<button type='button' class='gift-catalog-card "+(state.selectedCode===g.code?"selected":"")+"' data-gift-select='"+esc(g.code)+"' aria-pressed='"+(state.selectedCode===g.code)+"'><span class='gift-catalog-art'>"+image+"</span><strong>"+esc(g.name)+"</strong><small>◈ "+Number(g.coin_price).toLocaleString()+" Coins</small></button>";
  }
  function updateSelected(){
    const gift=selected();
    const summary=document.getElementById("minglora-gift-selected-summary");
    const sound=document.getElementById("minglora-gift-sound");
    const send=document.getElementById("minglora-gift-send");
    if(summary)summary.textContent=gift
      ?"Selected: "+gift.name+" · "+Number(gift.coin_price).toLocaleString()+" Coins"
      :"Select a gift to send.";
    if(sound)sound.disabled=!gift;
    if(send)send.disabled=!gift;
    if(gift)void window.MingloraGiftFX?.preloadGiftSound?.(gift);
  }
  function drawGrid(){
    const grid=document.getElementById("minglora-gift-grid"),count=document.getElementById("minglora-gift-count"),more=document.getElementById("minglora-gift-more");
    if(!grid)return;
    if(!grid.dataset.giftIconErrorsBound){
      grid.addEventListener("error",event=>{
        const image=event.target;
        if(!image||image.tagName!=="IMG"||!image.matches("[data-gift-icon]"))return;
        const fallback=document.createElement("span");
        fallback.className="gift-art-unavailable";
        fallback.setAttribute("role","status");
        fallback.textContent="Gift icon unavailable";
        image.replaceWith(fallback);
      },true);
      grid.dataset.giftIconErrorsBound="true";
    }
    const rows=filtered(),shown=rows.slice(0,(state.page+1)*state.pageSize);
    if(count)count.textContent=rows.length.toLocaleString()+" gifts";
    grid.innerHTML=shown.length?shown.map(card).join(""):"<div class='gift-empty-state'>No gifts match your search.</div>";
    if(more){more.hidden=shown.length>=rows.length;more.textContent="Show more gifts · "+Math.max(0,rows.length-shown.length).toLocaleString()+" remaining";}
    grid.querySelectorAll("[data-gift-select]").forEach(b=>b.addEventListener("click",()=>{state.selectedCode=b.dataset.giftSelect;drawGrid();updateSelected();}));
    updateSelected();
  }
  async function render(){
    const main=document.getElementById("main-content");if(!main)return;
    main.innerHTML="<section class='card empty-state'><h3>Loading Minglora Gifts</h3><p>Connecting to the complete gift collection…</p></section>";
    const results=await Promise.allSettled([request("/coins/catalog"),request("/coins/wallet"),request("/coins/promotional-gift-wallet")]);
    if(results[0].status!=="fulfilled")throw results[0].reason;
    state.gifts=Array.isArray(results[0].value.gifts)?results[0].value.gifts.filter(g=>g&&g.asset_version==="3"&&g.image_url&&g.model_url):[];
    await window.MingloraGiftFX?.loadCatalogMotionIndex?.();
    state.balance=results[1].status==="fulfilled"?Number(results[1].value.wallet?.balance_coins??0):null;state.promoWallet=results[2].status==="fulfilled"?(results[2].value.wallet||null):null;
    if(!state.gifts.some(g=>g.code===state.selectedCode))state.selectedCode=state.gifts[0]?.code||"";
    const balance=state.balance===null?"Balance unavailable":state.balance.toLocaleString()+" Coins available";
    main.innerHTML=
      "<section class='gift-level-up-banner' aria-labelledby='minglora-gifter-rewards-title'><img src='/assets/gifters-rewards.png' alt='Gifters Rewards' loading='eager' decoding='async'><div class='gift-level-up-copy'><span class='eyebrow'>MINGLORA GIFTER REWARDS</span><h2 id='minglora-gifter-rewards-title'>Gifters Rewards</h2><p>Explore all 50 Gifter Levels, the original badge artwork, your live progress and every reward milestone right here.</p><button type='button' class='primary' id='minglora-gifter-level-up-open'>View all 50 levels</button></div></section>"+
      "<section id='minglora-gifter-rewards-content' class='gift-gifter-rewards-content' aria-label='Complete Gifter Levels, badge artwork and rewards'><section class='card gp-loading' role='status' aria-live='polite'><strong>Loading all 50 Gifter Levels &amp; Badges…</strong><p>Connecting to your confirmed Minglora gifting progress.</p></section></section>"+
      "<section class='page-heading gift-page-heading'><div><span class='eyebrow'>Minglora Gift Studio</span><h1>Every moment deserves a gift 🎁</h1><p class='muted'>Explore the complete Minglora collection. Each gift has original Minglora artwork, a unique animation and its own sound effect.</p><button type='button' class='secondary' id='minglora-gifter-progress'>View Gifter LV &amp; Badges</button></div><div class='gift-balance-pill'><small>Your balance</small><strong>"+esc(balance)+"</strong><button type='button' class='secondary' id='minglora-gift-recharge'>Recharge Coins</button></div></section>"+
      "<section class='card gift-catalogue-panel'><div class='gift-catalogue-toolbar'><div><h2>The complete gift collection</h2><p class='muted'>"+state.gifts.length.toLocaleString()+" individual Minglora gifts · original artwork, animations and sounds</p></div><span class='gift-count' id='minglora-gift-count'>"+state.gifts.length+" gifts</span></div>"+
      "<div class='gift-selection-toolbar'><span id='minglora-gift-selected-summary' class='gift-selection-summary'>Select a gift to send.</span><button type='button' class='secondary' id='minglora-gift-sound' disabled>♫ Preview sound</button></div>" +
      "<div class='gift-browse-controls'><label class='gift-search-label'><span>Find a gift</span><input id='minglora-gift-search' type='search' placeholder='Search every gift by name…' value='"+esc(state.search)+"'></label><label class='gift-sort-label'><span>Sort</span><select id='minglora-gift-sort'><option value='high'>Price: high to low · Premium first</option><option value='price'>Price: low to high</option><option value='name'>Name A–Z</option></select></label></div>"+
      "<div class='gift-category-row' id='minglora-gift-categories'>"+categoryMarkup()+"</div><div class='gift-catalogue-grid' id='minglora-gift-grid'></div><button type='button' class='secondary gift-load-more' id='minglora-gift-more' hidden>Show more gifts</button></section>"+
      "<section class='card gift-send-panel'><div class='gift-send-panel-heading'><div><span class='eyebrow'>Send a gift</span><h2>Choose who receives it</h2></div></div><form id='minglora-gift-form' class='gift-send-form'>"+
      "<label>Recipient username<input id='minglora-gift-recipient' name='username' maxlength='31' autocomplete='off' placeholder='@Username' value='"+esc(state.recipient)+"' required></label>"+
      "<label class='gift-funding-source-label'>Pay with<select id='minglora-gift-funding-source' name='fundingSource'><option value='cash'>Main Coin Wallet · "+esc(balance)+"</option><option value='admin_promotional'>Promotional Gift Wallet · "+Number(state.promoWallet?.promotionalCoins||0).toLocaleString()+" Coins</option></select></label>"+
      "<p class='muted gift-funding-source-note'>Promotional gift cash reserve available: USD "+(Number(state.promoWallet?.availableMinor||0)/100).toFixed(2)+". Promotional gifts create creator USD earnings only while the separate PayPal-funded reserve has enough real funds.</p>"+
      "<div class='gift-send-form-footer'><span class='muted'>The selected gift's exact coin price is deducted after the recipient is verified.</span><button type='submit' class='primary' id='minglora-gift-send' disabled>Send gift</button></div><p id='minglora-gift-status' class='gift-send-status' role='status'></p></form></section>";
    const sort=document.getElementById("minglora-gift-sort");if(sort)sort.value=state.sort;
    document.getElementById("minglora-gift-search")?.addEventListener("input",e=>{state.search=e.target.value;state.page=0;drawGrid();});
    document.getElementById("minglora-gift-sort")?.addEventListener("change",e=>{state.sort=e.target.value;state.page=0;drawGrid();});
    document.getElementById("minglora-gift-categories")?.addEventListener("click",e=>{
      const b=e.target.closest("[data-gift-category]");if(!b)return;state.category=b.dataset.giftCategory;state.page=0;document.getElementById("minglora-gift-categories").innerHTML=categoryMarkup();drawGrid();
    });
    document.getElementById("minglora-gift-more")?.addEventListener("click",()=>{state.page++;drawGrid();});
    document.getElementById("minglora-gift-sound")?.addEventListener("click",()=>{const g=selected();if(g){window.MingloraGiftFX?.prime(g);window.MingloraGiftFX?.preview(g);}});
    document.getElementById("minglora-gift-recipient")?.addEventListener("input",e=>{state.recipient=e.target.value;});
    document.getElementById("minglora-gift-recharge")?.addEventListener("click",()=>window.activateNav?.("coins"));
    document.getElementById("minglora-gifter-progress")?.addEventListener("click",()=>window.activateNav?.("gifter-progression"));
    document.getElementById("minglora-gifter-level-up-open")?.addEventListener("click",()=>document.getElementById("minglora-gifter-rewards-content")?.scrollIntoView({behavior:"smooth",block:"start"}));
    document.getElementById("minglora-gift-form")?.addEventListener("submit",sendGift);
    drawGrid();
    void window.MingloraGifterProgression?.renderInto?.(document.getElementById("minglora-gifter-rewards-content"));
  }
  async function sendGift(event){
    event.preventDefault();
    const button=document.getElementById("minglora-gift-send"),status=document.getElementById("minglora-gift-status"),gift=selected();
    const username=String(document.getElementById("minglora-gift-recipient")?.value||"").trim().replace(/^@/,"").toLowerCase();
    if(!gift){if(status)status.textContent="Select a gift before sending.";return;}
    if(!/^[a-z0-9_]{3,30}$/.test(username)){if(status)status.textContent="Enter a valid @username (3–30 letters, numbers or underscores).";return;}
    window.MingloraGiftFX?.prime(gift);if(button)button.disabled=true;if(status)status.textContent="Verifying recipient and sending gift…";
    try{
      const fundingSource=String(document.getElementById("minglora-gift-funding-source")?.value||"cash");
      const result=fundingSource==="cash"
        ?await request("/gifts/send",{method:"POST",body:JSON.stringify({username,giftCode:gift.code})})
        :await request("/gifts/send",{method:"POST",body:JSON.stringify({username,giftCode:gift.code,fundingSource})});
      const sent=result.gift||{};state.recipient="@"+(sent.recipientUsername||username);
      let balanceAfterLabel="";
      if(fundingSource==="admin_promotional"){
        state.promoWallet=state.promoWallet||{};
        state.promoWallet.promotionalCoins=Number(sent.remainingPromotionalCoins??sent.remaining_promotional_coins??0);
        state.promoWallet.availableMinor=Math.max(0,Number(state.promoWallet.availableMinor||0)-Number(sent.grossMinor||0));
        balanceAfterLabel=state.promoWallet.promotionalCoins.toLocaleString()+" Promotional Coins remaining.";
      }else{
        state.balance=Number(sent.remainingCoins);
        balanceAfterLabel=state.balance.toLocaleString()+" Main Coins remaining.";
      }
      const nonCashPromotional=sent.fundingSource==="promo";
      const fundingNotice=nonCashPromotional
        ?" This gift used ordinary promotional Coins. It will appear in the recipient’s Gifts Received history but will not create withdrawable creator earnings."
        :"";
      if(status)status.textContent=(sent.giftName||gift.name)+" sent to @"+(sent.recipientUsername||username)+". "+balanceAfterLabel+fundingNotice;
      const balance=document.querySelector(".gift-balance-pill strong");if(balance&&fundingSource==="cash"&&Number.isFinite(state.balance))balance.textContent=state.balance.toLocaleString()+" Coins available";
      window.MingloraGiftFX?.show(gift);window.toast?.(nonCashPromotional?"Gift sent with promotional Coins · no cash earnings created.":"Gift sent successfully.");window.dispatchEvent(new CustomEvent("minglora:gifter-progression-refresh"));
    }catch(error){if(status)status.textContent=error.message;window.toast?.(error.message);}
    finally{if(button)button.disabled=!selected();}
  }
  function open(options={}){
    state.recipient=options.username?"@"+String(options.username).replace(/^@/,""):state.recipient;
    window.activateNav?.("gifts");
  }
  document.addEventListener("click",event=>{
    const b=event.target.closest("[data-gift-content]");if(!b)return;event.preventDefault();event.stopPropagation();
    open({username:b.dataset.giftUsername||"",contextType:b.dataset.giftContent||"post",contextId:b.dataset.giftId||""});
  });
  window.MingloraGifts={render,open};
})();