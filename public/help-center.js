(() => {
  'use strict';
  const root = () => document.querySelector('#main-content');
  const ICONS = '/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2';
  const CATEGORY_ICONS = {
    'getting-started':'home','accounts-registration':'profile','passwords-security':'lock',
    'profiles-personalization':'palette','friends-followers':'friends','home-feed-posts':'activity',
    'photos-albums':'photo','videos-reels-stories':'video','messenger':'messages',
    'voice-video-calls':'call','groups-pages':'groups','live-streaming':'live',
    'creator-features':'creator','gifts-coins':'gift','creator-earnings-payouts':'recharge',
    'meetwave':'meetwave','notifications-activity':'activity','privacy-permissions':'privacy',
    'safety-reporting':'request','settings-accessibility':'settings','troubleshooting':'more',
    'rules-policies':'saved'
  };
  const state = {
    categories: [], section: 'home', category: null, subcategory: null, article: null,
    query: '', results: [], resultTotal: 0, page: 1, access: null, adminStatus: 'all',
    adminArticles: [], editing: null, adminCategories: [], adminFeedback: [], adminUnanswered: []
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const icon = (name, css = 'hc-icon') =>
    '<svg class="'+css+'" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="'+ICONS+'#'+esc(name)+'"></use></svg>';
  const fmtDate = value => {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? 'Date not available' : date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  };
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials:'same-origin',
      headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The Help Center could not complete that request.');
    return payload;
  };
  const set = html => { const target=root(); if(target) target.innerHTML=html; };
  const button = (label, attrs='', css='hc-button') => '<button type="button" class="'+css+'" '+attrs+'>'+label+'</button>';
  const backBar = (crumbs = []) => '<nav class="hc-breadcrumbs" aria-label="Breadcrumb">'+
    '<button type="button" data-hc-home>Help Center</button>'+crumbs.map(item=>'<span aria-hidden="true">›</span><span>'+esc(item)+'</span>').join('')+'</nav>';
  const empty = (title, copy) => '<div class="hc-empty"><span class="hc-empty-icon">'+icon('request')+'</span><h3>'+esc(title)+'</h3><p>'+esc(copy)+'</p></div>';
  function markdown(raw) {
    const lines=String(raw||'').split(/\r?\n/),out=[];
    let listType='';
    const inline=line=>esc(line)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/\[(.{1,100})\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const closeList=()=>{if(listType){out.push('</'+listType+'>');listType='';}};
    for(const line of lines){
      const value=line.trim();
      if(!value){closeList();continue;}
      const heading=value.match(/^(#{1,3})\s+(.+)$/);
      const bullet=value.match(/^[-*]\s+(.+)$/);
      const numbered=value.match(/^\d+[.)]\s+(.+)$/);
      if(heading){closeList();const n=heading[1].length;out.push('<h'+n+'>'+inline(heading[2])+'</h'+n+'>');}
      else if(bullet||numbered){const next=bullet?'ul':'ol';if(listType!==next){closeList();listType=next;out.push('<'+next+'>');}out.push('<li>'+inline((bullet||numbered)[1])+'</li>');}
      else {closeList();out.push('<p>'+inline(value)+'</p>');}
    }
    closeList();return out.join('');
  }
  function memberSupport(destination='contact') {
    const close=()=>{if(typeof window.closeAccountSwitcherMenu==='function')window.closeAccountSwitcherMenu();};
    close();
    const openSettings=window.MingloraSettings?.open;
    if(typeof openSettings!=='function'){showError('Minglora Support is not available right now.');return;}
    openSettings().then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))).then(()=>{
      const click=selector=>document.querySelector(selector)?.click();
      click('#settings-navigation [data-settings-open-page="help-support"]');
      requestAnimationFrame(()=>{
        if(destination==='inbox') click('#settings-navigation [data-settings-page="help-support"] [data-settings-title="Support Inbox"]');
        else if(destination==='report') click('#settings-navigation [data-settings-page="help-support"] [data-settings-report-problem]');
        else click('#settings-navigation [data-settings-title="Contact Support"]');
      });
    }).catch(error=>showError(error.message));
  }
  function showError(message) {
    const target=root();
    if(target){
      let notice=target.querySelector('.hc-notice');
      if(!notice){notice=document.createElement('div');notice.className='hc-notice';notice.setAttribute('role','alert');target.prepend(notice);}
      notice.textContent=message;
    }
  }
  async function loadBase() {
    const [categories,access]=await Promise.all([
      api('/api/help/categories'),
      api('/api/help/access').catch(()=>({canManage:false,canReview:false,canApprove:false,canPublish:false}))
    ]);
    state.categories=Array.isArray(categories.categories)?categories.categories:[];
    state.access=access;
  }
  function header(title, subtitle='') {
    return '<header class="hc-page-header"><div class="hc-header-mark">'+icon('request')+'</div><div><p class="hc-eyebrow">MINGLORA KNOWLEDGE BASE</p><h1>'+esc(title)+'</h1>'+(subtitle?'<p>'+esc(subtitle)+'</p>':'')+'</div></header>';
  }
  function searchBox(value='', placeholder='Search all Minglora questions and answers') {
    return '<form class="hc-search" id="hc-search-form" role="search"><label class="hc-search-control">'+icon('search')+'<input id="hc-search-input" type="search" autocomplete="off" value="'+esc(value)+'" placeholder="'+esc(placeholder)+'" aria-label="Search the Help Center" aria-controls="hc-search-suggestions"><button type="button" id="hc-search-clear" aria-label="Clear search">×</button></label><button class="hc-search-submit" type="submit">Search</button></form><div id="hc-search-suggestions" class="hc-search-suggestions" hidden></div><div class="hc-search-hint">Search by question, feature, keyword or describe the problem in your own words.</div>';
  }
  function categoryCard(category) {
    const graphic=CATEGORY_ICONS[category.slug]||'request';
    const count=(category.subcategories||[]).length;
    return '<button class="hc-category-card" type="button" data-hc-category="'+esc(category.slug)+'">'+
      '<span class="hc-category-icon">'+icon(graphic)+'</span><span class="hc-category-copy"><strong>'+esc(category.name)+'</strong><small>'+esc(category.description||'Browse related help topics')+'</small><em>'+count+' topics <span aria-hidden="true">›</span></em></span></button>';
  }
  function articleCard(article, meta='') {
    return '<button class="hc-article-card" type="button" data-hc-article="'+esc(article.slug)+'">'+
      '<span class="hc-article-symbol">'+icon('saved')+'</span><span class="hc-article-copy"><strong>'+esc(article.question)+'</strong>'+
      '<small>'+esc(article.excerpt||'Open this answer for full instructions.')+'</small><em>'+esc(meta||article.help_categories?.name||'Help Center')+'</em></span><span class="hc-chevron" aria-hidden="true">›</span></button>';
  }
  function sectionBlock(title, desc, articles, emptyCopy='No published answers in this section yet.') {
    const content=articles?.length?'<div class="hc-article-list">'+articles.map(item=>articleCard(item,item.realViews90d?'Viewed '+item.realViews90d+' times in 90 days':'')).join('')+'</div>':'<p class="hc-muted hc-section-empty">'+esc(emptyCopy)+'</p>';
    return '<section class="hc-content-section"><div class="hc-section-heading"><div><h2>'+esc(title)+'</h2><p>'+esc(desc)+'</p></div></div>'+content+'</section>';
  }
  async function renderHome() {
    state.section='home';state.category=null;state.subcategory=null;state.article=null;
    set('<div class="hc-shell">'+header('How can we help you?','Find clear answers about using Minglora, managing your account and getting support.')+
      searchBox()+
      '<div class="hc-shortcuts">'+button('Saved answers','data-hc-saved','hc-button hc-button-secondary')+button('Recently viewed','data-hc-recent','hc-button hc-button-secondary')+(state.access?.canManage||state.access?.canReview||state.access?.canApprove||state.access?.canPublish?button('Manage Help Center','data-hc-admin','hc-button hc-button-secondary'):'')+'</div>'+
      '<section class="hc-content-section"><div class="hc-section-heading"><div><h2>Browse by category</h2><p>Choose an area to find its topics and published answers.</p></div></div><div class="hc-category-grid" id="hc-category-grid"></div></section>'+
      '<div class="hc-home-columns"><div id="hc-home-featured"></div><div id="hc-home-popular"></div><div id="hc-home-added"></div><div id="hc-home-updated"></div></div>'+
      '<section class="hc-contact-strip"><div class="hc-contact-icon">'+icon('messages')+'</div><div><h2>Still need help?</h2><p>Contact the Minglora team or continue an existing support conversation.</p></div><div class="hc-contact-actions">'+button('Contact Support','data-hc-contact')+button('Support Inbox','data-hc-inbox','hc-button hc-button-secondary')+'</div></section>'+
      '<p class="hc-data-note" id="hc-data-note">Only reviewed and published answers appear here. Articles appear after verification and approval by authorized Minglora staff.</p></div>');
    const grid=root()?.querySelector('#hc-category-grid');
    if(grid)grid.innerHTML=state.categories.map(categoryCard).join('')||empty('Categories are unavailable','The Help Center categories could not be loaded.');
    const [featured,popular,added,updated]=await Promise.all([
      api('/api/help/featured?limit=4').catch(()=>({articles:[]})),
      api('/api/help/popular?limit=4').catch(()=>({articles:[]})),
      api('/api/help/articles?limit=4&sort=published').catch(()=>({articles:[]})),
      api('/api/help/recently-updated?limit=4').catch(()=>({articles:[]}))
    ]);
    const f=root()?.querySelector('#hc-home-featured'),p=root()?.querySelector('#hc-home-popular'),n=root()?.querySelector('#hc-home-added'),u=root()?.querySelector('#hc-home-updated');
    if(f)f.innerHTML=sectionBlock('Featured answers','Important guidance selected by Minglora editors.',featured.articles,'No answers have been manually featured yet.');
    if(p)p.innerHTML=sectionBlock('Popular questions','Based on real member views recorded in the last 90 days.',popular.articles,'Popularity data will appear after published answers receive genuine member views.');
    if(n)n.innerHTML=sectionBlock('Recently added','The newest published answers.',added.articles,'No answers have been published yet.');
    if(u)u.innerHTML=sectionBlock('Recently updated','Published answers that have genuinely been updated.',updated.articles,'No recently updated answers are available yet.');
    bindCommon();bindSearch();
  }
  function topicMarkup(category) {
    const groups=(category.subcategories||[]).filter(item=>item.kind==='master_group');
    const topics=(category.subcategories||[]).filter(item=>item.kind!=='master_group');
    return (groups.length?'<div class="hc-topic-groups"><h3>Master QA topics</h3><div>'+groups.map(item=>'<button type="button" data-hc-subcategory="'+esc(item.slug)+'">'+esc(item.name)+'</button>').join('')+'</div></div>':'')+
      '<details class="hc-topic-details"><summary>Browse all '+topics.length+' help topics</summary><div class="hc-topic-list">'+topics.map(item=>'<button type="button" data-hc-subcategory="'+esc(item.slug)+'">'+esc(item.name)+'</button>').join('')+'</div></details>';
  }
  async function renderCategory(slug,subSlug=null) {
    const category=state.categories.find(item=>item.slug===slug);
    if(!category){await renderHome();showError('That Help Center category could not be found.');return;}
    state.section='category';state.category=category;state.subcategory=subSlug;state.article=null;
    const sub=(category.subcategories||[]).find(item=>item.slug===subSlug);
    const title=sub?.name||category.name;
    set('<div class="hc-shell">'+backBar([category.name,...(sub?[sub.name]:[])])+
      header(title,category.description||'Browse questions and instructions for this area.')+
      searchBox(state.query)+topicMarkup(category)+
      '<section class="hc-content-section"><div class="hc-section-heading"><div><h2>Questions & answers</h2><p>Published guidance for this topic.</p></div><label class="hc-sort-label">Sort <select id="hc-sort"><option value="published">Recently added</option><option value="updated">Recently updated</option><option value="alphabetical">A–Z</option></select></label></div><div id="hc-category-articles" class="hc-article-list"></div><div class="hc-pagination" id="hc-pagination"></div></section>'+
      '<section class="hc-contact-strip compact"><div><h2>Could not find the answer?</h2><p>Ask the support team through the existing Minglora ticket system.</p></div><div class="hc-contact-actions">'+button('Contact Support','data-hc-contact')+button('Support Inbox','data-hc-inbox','hc-button hc-button-secondary')+'</div></section></div>');
    const load=async(page=1)=>{
      state.page=page;
      const params=new URLSearchParams({category:category.slug,page:String(page),limit:'20'});
      if(subSlug)params.set('subcategory',subSlug);
      const sort=root()?.querySelector('#hc-sort')?.value||'published';
      if(sort!=='published')params.set('sort',sort);
      const payload=await api('/api/help/articles?'+params.toString());
      state.results=payload.articles||[];state.resultTotal=payload.total||0;
      const list=root()?.querySelector('#hc-category-articles');
      if(list)list.innerHTML=state.results.length?state.results.map(articleCard).join(''):empty('No published answers yet','There are no verified answers published in this category yet. You can still contact Minglora Support.');
      const pagination=root()?.querySelector('#hc-pagination');
      if(pagination){const pages=Math.ceil(state.resultTotal/20);pagination.innerHTML=pages>1?button('Previous','data-hc-page="'+(page-1)+'" '+(page<=1?'disabled':''),'hc-button hc-button-secondary')+'<span>Page '+page+' of '+pages+'</span>'+button('Next','data-hc-page="'+(page+1)+'" '+(page>=pages?'disabled':'')):'';}
      bindArticleCards();
      pagination?.querySelectorAll('[data-hc-page]').forEach(btn=>btn.addEventListener('click',()=>load(Number(btn.dataset.hcPage))));
    };
    await load(1);
    root()?.querySelector('#hc-sort')?.addEventListener('change',()=>load(1));
    bindCommon();bindSearch();bindSubcategories();
  }
  async function renderSearch(query) {
    state.section='search';state.query=query;state.category=null;state.subcategory=null;state.article=null;
    set('<div class="hc-shell">'+backBar()+header('Search the Help Center','Results for “'+query+'”')+searchBox(query)+
      '<div class="hc-search-filters"><label>Category <select id="hc-category-filter"><option value="">All categories</option>'+state.categories.map(item=>'<option value="'+esc(item.slug)+'">'+esc(item.name)+'</option>').join('')+'</select></label></div>'+
      '<section class="hc-content-section"><div id="hc-search-results" class="hc-article-list"></div><div id="hc-search-total" class="hc-search-total"></div></section></div>');
    const run=async()=>{
      const category=root()?.querySelector('#hc-category-filter')?.value||'';
      const params=new URLSearchParams({q:query,limit:'40'});
      if(category)params.set('category',category);
      const payload=await api('/api/help/articles?'+params.toString());
      state.results=payload.articles||[];state.resultTotal=payload.total||0;
      const list=root()?.querySelector('#hc-search-results');
      if(list)list.innerHTML=state.results.length?state.results.map(articleCard).join(''):empty('No matching answers found','Try another phrase, choose a broader term, or contact Minglora Support.');
      const total=root()?.querySelector('#hc-search-total');
      if(total)total.textContent=state.resultTotal+' published result'+(state.resultTotal===1?'':'s');
      bindArticleCards();
    };
    await run();root()?.querySelector('#hc-category-filter')?.addEventListener('change',run);
    bindCommon();bindSearch();
  }
  async function renderArticle(slug) {
    const payload=await api('/api/help/articles/'+encodeURIComponent(slug));
    const article=payload.article;
    state.section='article';state.article=payload;state.category=state.categories.find(item=>item.id===article.category_id)||null;
    state.subcategory=null;
    const categoryName=article.help_categories?.name||state.category?.name||'Help Center';
    const related=payload.related||[];
    const media=(payload.assets||[]).map(asset=>asset.asset_type==='video'
      ?'<figure class="hc-media-figure"><video controls preload="metadata" src="'+esc(asset.url)+'"></video><figcaption>'+esc(asset.caption||asset.alt_text||'')+'</figcaption></figure>'
      :'<figure class="hc-media-figure"><img loading="lazy" src="'+esc(asset.url)+'" alt="'+esc(asset.alt_text||'Instructional image')+'"><figcaption>'+esc(asset.caption||'')+'</figcaption></figure>').join('');
    set('<div class="hc-shell">'+backBar([categoryName,article.question])+
      '<div class="hc-article-layout"><article class="hc-article-main"><p class="hc-eyebrow">'+esc(categoryName)+'</p><h1>'+esc(article.question)+'</h1>'+
      '<p class="hc-article-updated">Last updated '+fmtDate(article.updated_at)+'</p>'+
      '<div class="hc-article-answer">'+markdown(article.answer_markdown)+'</div><div class="hc-article-media">'+media+'</div>'+
      '<div class="hc-answer-feedback"><strong>Was this answer helpful?</strong><div>'+button('Yes, this helped','data-hc-feedback="yes"')+button('No, I still need help','data-hc-feedback="no"','hc-button hc-button-secondary')+'</div><p id="hc-feedback-status" aria-live="polite"></p></div>'+
      '<div class="hc-article-contact">'+button(payload.bookmarked?'Remove bookmark':'Save answer','data-hc-bookmark','hc-button hc-button-secondary')+button('Contact Support','data-hc-contact')+'</div></article>'+
      '<aside class="hc-article-aside"><section><h2>Related questions</h2>'+(related.length?related.map(item=>articleCard(item)).join(''): '<p class="hc-muted">Related answers will appear as reviewed articles are published.</p>')+'</section>'+
      '<section><h2>Need more help?</h2><p>Continue through Minglora’s existing support system.</p>'+button('Open Support Inbox','data-hc-inbox','hc-button hc-button-secondary')+'</section></aside></div></div>');
    bindCommon();bindArticleCards();
    root()?.querySelectorAll('[data-hc-feedback]').forEach(btn=>btn.addEventListener('click',async()=>{
      const status=root()?.querySelector('#hc-feedback-status');btn.disabled=true;
      try{const res=await api('/api/help/articles/'+article.id+'/feedback',{method:'POST',body:JSON.stringify({helpful:btn.dataset.hcFeedback==='yes'})});if(status)status.textContent='Thank you. Your feedback has been recorded.';}
      catch(error){if(status)status.textContent=error.message;}
      finally{root()?.querySelectorAll('[data-hc-feedback]').forEach(item=>item.disabled=false);}
    }));
    root()?.querySelector('[data-hc-bookmark]')?.addEventListener('click',async event=>{
      const saved=!payload.bookmarked;
      try{await api('/api/help/articles/'+article.id+'/bookmark',{method:saved?'POST':'DELETE',body:saved?'{}':undefined});payload.bookmarked=saved;event.currentTarget.textContent=saved?'Remove bookmark':'Save answer';}
      catch(error){showError(error.message);}
    });
  }
  async function renderSaved() {
    state.section='saved';
    const payload=await api('/api/help/bookmarks');
    set('<div class="hc-shell">'+backBar()+header('Saved answers','Your bookmarked Help Center articles.')+
      (payload.articles?.length?'<div class="hc-article-list">'+payload.articles.map(articleCard).join('')+'</div>':empty('No saved answers yet','Save useful articles so you can return to them later.'))+'</div>');
    bindCommon();bindArticleCards();
  }
  async function renderRecent() {
    state.section='recent';
    const payload=await api('/api/help/recent');
    set('<div class="hc-shell">'+backBar()+header('Recently viewed','Answers you have opened recently.')+
      (payload.articles?.length?'<div class="hc-article-list">'+payload.articles.map(articleCard).join('')+'</div>':empty('No recently viewed answers','Published answers you open will appear here.'))+'</div>');
    bindCommon();bindArticleCards();
  }
  async function renderAdmin() {
    if(!state.access?.canManage&&!state.access?.canReview&&!state.access?.canApprove&&!state.access?.canPublish){
      set('<div class="hc-shell">'+backBar()+header('Help Center administration')+empty('Restricted workspace','Only authorized Minglora Help Center editors and administrators can manage knowledge-base content.')+'</div>');bindCommon();return;
    }
    state.section='admin';
    const [articles,feedback,unanswered]=await Promise.all([
      api('/api/help/admin/articles?status='+encodeURIComponent(state.adminStatus)).catch(()=>({articles:[]})),
      api('/api/help/admin/feedback').catch(()=>({feedback:[]})),
      api('/api/help/admin/unanswered').catch(()=>({articles:[]}))
    ]);
    state.adminArticles=articles.articles||[];state.adminFeedback=feedback.feedback||[];state.adminUnanswered=unanswered.articles||[];
    set('<div class="hc-shell">'+backBar()+header('Help Center workspace','Draft, review and publish accurate knowledge-base answers.')+
      '<div class="hc-admin-toolbar"><div><span class="hc-admin-status">Protected editor workspace</span><p>All content changes are revision-tracked and require the publishing workflow.</p></div>'+button('Create question','data-hc-admin-create')+'</div>'+
      '<div class="hc-admin-stats"><div><strong>'+state.adminArticles.length+'</strong><span>Articles in this list</span></div><div><strong>'+state.adminUnanswered.length+'</strong><span>Unanswered entries</span></div><div><strong>'+state.adminFeedback.length+'</strong><span>Feedback records</span></div></div>'+
      '<section class="hc-content-section"><div class="hc-section-heading"><div><h2>Knowledge base articles</h2><p>Drafts and published content.</p></div><select id="hc-admin-status"><option value="all">All statuses</option>'+['draft','review','fact_check','approval','published','unpublished','archived'].map(x=>'<option value="'+x+'" '+(state.adminStatus===x?'selected':'')+'>'+x.replace('_',' ')+'</option>').join('')+'</select></div>'+
      '<div class="hc-admin-list">'+state.adminArticles.map(item=>'<div class="hc-admin-row"><div><strong>'+esc(item.question)+'</strong><small>'+esc(item.help_categories?.name||'Uncategorized')+' · '+esc(item.status)+' · '+fmtDate(item.updated_at)+'</small></div>'+button('Edit','data-hc-edit="'+esc(item.id)+'"','hc-button hc-button-secondary')+'</div>').join('')+'</div>'+
      (state.adminFeedback.length?'<section class="hc-content-section"><h2>Member feedback</h2><div class="hc-admin-list">'+state.adminFeedback.slice(0,12).map(item=>'<div class="hc-admin-row"><div><strong>'+esc(item.help_articles?.question||'Article feedback')+'</strong><small>'+(item.helpful?'Helpful':'Needs improvement')+' · '+fmtDate(item.updated_at)+'</small></div></div>').join('')+'</div></section>':'')+
      (state.adminUnanswered.length?'<section class="hc-content-section"><h2>Unanswered entries</h2><div class="hc-admin-list">'+state.adminUnanswered.slice(0,12).map(item=>'<div class="hc-admin-row"><div><strong>'+esc(item.question)+'</strong><small>'+esc(item.help_categories?.name||'Help Center')+'</small></div><span class="hc-status-pill">'+esc(item.status)+'</span></div>').join('')+'</div></section>':'')+
      '<div id="hc-admin-editor-host"></div></div>');
    bindCommon();
    root()?.querySelector('#hc-admin-status')?.addEventListener('change',event=>{state.adminStatus=event.target.value;renderAdmin();});
    root()?.querySelector('[data-hc-admin-create]')?.addEventListener('click',()=>openEditor());
    root()?.querySelectorAll('[data-hc-edit]').forEach(btn=>btn.addEventListener('click',()=>openEditor(state.adminArticles.find(x=>x.id===btn.dataset.hcEdit))));
  }
  function openEditor(article=null) {
    state.editing=article;
    const categories=state.categories;
    const host=root()?.querySelector('#hc-admin-editor-host');
    if(!host)return;
    host.innerHTML='<section class="hc-admin-editor"><div class="hc-section-heading"><div><h2>'+(article?'Edit question':'Create a question')+'</h2><p>New content is saved as a draft and cannot appear to members until approved and published.</p></div>'+button('Close','data-hc-editor-close','hc-button hc-button-secondary')+'</div>'+
      '<form id="hc-admin-editor-form"><label>Question title<input name="question" maxlength="180" required value="'+esc(article?.question||'')+'"></label>'+
      '<label>Main category<select name="categoryId" required><option value="">Choose category</option>'+categories.map(c=>'<option value="'+esc(c.id)+'" '+(article?.category_id===c.id?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label>'+
      '<label>Short answer preview<input name="excerpt" maxlength="360" value="'+esc(article?.excerpt||'')+'"></label>'+
      '<label>Topics and subcategories<select name="subcategoryIds" id="hc-editor-subcategories" multiple size="6">'+categories.flatMap(c=>(c.subcategories||[]).map(sub=>'<option value="'+esc(sub.id)+'" data-category-id="'+esc(c.id)+'" '+((article?.help_article_subcategories||[]).some(link=>link.subcategory_id===sub.id)?'selected':'')+'>'+esc(c.name+' · '+sub.name)+'</option>')).join('')+'</select><small>Select only topics that match the chosen main category.</small></label>'+
      '<label>Full answer<textarea name="answerMarkdown" rows="10" maxlength="30000" placeholder="Write the verified answer. Use headings, numbered steps and bullet points where helpful." required>'+esc(article?.answer_markdown||'')+'</textarea></label>'+
      '<label>Source / verification note<input name="sourceReference" maxlength="300" value="'+esc(article?.source_reference||'')+'" placeholder="Link or note for the verified Minglora behavior"></label>'+
      '<label class="hc-checkbox-label"><input type="checkbox" name="featured" '+(article?.featured?'checked':'')+'> Feature this answer after publication</label>'+
      '<label>Revision note<input name="revisionNote" maxlength="300" placeholder="What changed and why"></label>'+
      '<div class="hc-editor-actions"><button class="hc-search-submit" type="submit">'+(article?'Save revision':'Save draft')+'</button>'+(article?'<span class="hc-status-pill">Current status: '+esc(article.status)+'</span>':'')+'</div><p class="hc-form-status" id="hc-admin-editor-status" aria-live="polite"></p></form>'+
      (article?'<section class="hc-media-editor"><h3>Instructional images and videos</h3><p>Attach a verified screenshot, illustration or demonstration video to this draft.</p><label>Choose an image or video<input type="file" id="hc-media-file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"></label><label>Alternative text<input id="hc-media-alt" maxlength="200" placeholder="Describe the image for accessibility"></label><label>Caption<input id="hc-media-caption" maxlength="300" placeholder="Optional caption"></label>'+button('Upload selected media','data-hc-upload','hc-button hc-button-secondary')+'<p class="hc-form-status" id="hc-media-status" aria-live="polite"></p></section>':'')+
      (article?'<div class="hc-workflow-actions">'+[['review','Submit for review'],['fact_check','Complete fact-check'],['approval','Submit for approval'],['published','Publish approved answer'],['unpublished','Unpublish'],['archived','Archive']].map(([status,label])=>button(esc(label),'data-hc-workflow="'+status+'"','hc-button hc-button-secondary')).join('')+
      '</div><div id="hc-revision-list"></div>':'')+'</section>';
    host.scrollIntoView({block:'nearest',behavior:'smooth'});
    host.querySelector('[data-hc-editor-close]')?.addEventListener('click',()=>{host.innerHTML='';});
    host.querySelector('#hc-admin-editor-form')?.addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget;const data=new FormData(form);
      const values=Object.fromEntries(data.entries());values.featured=data.has('featured');values.subcategoryIds=data.getAll('subcategoryIds');
      const status=host.querySelector('#hc-admin-editor-status');
      const action=article?'/api/help/admin/articles/'+article.id:'/api/help/admin/articles';
      try{const saved=await api(action,{method:article?'PATCH':'POST',body:JSON.stringify(values)});if(status)status.textContent='Saved. The answer remains in draft or review until approved.';await renderAdmin();if(!article&&saved.article){state.editing=saved.article;await openEditor(saved.article);const note=host.querySelector('#hc-admin-editor-status');if(note)note.textContent='Draft saved. You can now attach instructional images or video.';}}
      catch(error){if(status)status.textContent=error.message;}
    });
    host.querySelector('[data-hc-upload]')?.addEventListener('click',async()=>{
      const file=host.querySelector('#hc-media-file')?.files?.[0];
      const status=host.querySelector('#hc-media-status');const uploadButton=host.querySelector('[data-hc-upload]');
      if(!file){if(status)status.textContent='Choose an image or video first.';return;}
      const allowed=['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm'];
      if(!allowed.includes(file.type)||file.size>100*1024*1024){if(status)status.textContent='Choose a supported image or video smaller than 100 MB.';return;}
      uploadButton.disabled=true;
      try{
        const assetType=file.type.startsWith('image/')?'image':'video';
        const signed=await api('/api/help/admin/articles/'+article.id+'/assets/sign',{method:'POST',body:JSON.stringify({assetType,contentType:file.type})});
        const upload=await fetch(signed.signedUrl,{method:'PUT',headers:{'Content-Type':file.type},body:file});
        if(!upload.ok)throw new Error('The file upload failed. Please try again.');
        await api('/api/help/admin/articles/'+article.id+'/assets',{method:'POST',body:JSON.stringify({
          storagePath:signed.path,assetType,altText:host.querySelector('#hc-media-alt')?.value||file.name,
          caption:host.querySelector('#hc-media-caption')?.value||''
        })});
        if(status)status.textContent='Media uploaded and attached to the article.';
        host.querySelector('#hc-media-file').value='';
      }catch(error){if(status)status.textContent=error.message;}
      finally{uploadButton.disabled=false;}
    });
    host.querySelectorAll('[data-hc-workflow]').forEach(btn=>btn.addEventListener('click',async()=>{
      const status=host.querySelector('#hc-admin-editor-status');
      try{await api('/api/help/admin/articles/'+article.id+'/workflow',{method:'POST',body:JSON.stringify({status:btn.dataset.hcWorkflow})});if(status)status.textContent='Publishing workflow updated.';await renderAdmin();}
      catch(error){if(status)status.textContent=error.message;}
    }));
    if(article) loadRevisions(article.id,host.querySelector('#hc-revision-list'));
  }
  async function loadRevisions(articleId,host) {
    if(!host)return;
    try{const payload=await api('/api/help/admin/articles/'+articleId+'/revisions');host.innerHTML='<h3>Revision history</h3>'+(payload.revisions||[]).map(item=>'<div class="hc-revision-row"><span>Revision '+item.revision_no+' · '+fmtDate(item.created_at)+' · '+esc(item.revision_note||'Content update')+'</span>'+button('Restore','data-hc-restore="'+esc(item.id)+'"','hc-button hc-button-secondary')+'</div>').join('');host.querySelectorAll('[data-hc-restore]').forEach(btn=>btn.addEventListener('click',async()=>{if(!window.confirm('Restore this revision as a draft?'))return;try{await api('/api/help/admin/articles/'+articleId+'/restore',{method:'POST',body:JSON.stringify({revisionId:btn.dataset.hcRestore})});await renderAdmin();}catch(error){showError(error.message);}}));}
    catch(error){host.textContent=error.message;}
  }
  function bindCommon() {
    root()?.querySelectorAll('[data-hc-home]').forEach(btn=>btn.addEventListener('click',()=>renderHome()));
    root()?.querySelectorAll('[data-hc-contact]').forEach(btn=>btn.addEventListener('click',()=>memberSupport('contact')));
    root()?.querySelectorAll('[data-hc-inbox]').forEach(btn=>btn.addEventListener('click',()=>memberSupport('inbox')));
    root()?.querySelectorAll('[data-hc-saved]').forEach(btn=>btn.addEventListener('click',()=>renderSaved().catch(error=>showError(error.message))));
    root()?.querySelectorAll('[data-hc-recent]').forEach(btn=>btn.addEventListener('click',()=>renderRecent().catch(error=>showError(error.message))));
    root()?.querySelectorAll('[data-hc-admin]').forEach(btn=>btn.addEventListener('click',()=>renderAdmin().catch(error=>showError(error.message))));
    root()?.querySelectorAll('[data-hc-category]').forEach(btn=>btn.addEventListener('click',()=>renderCategory(btn.dataset.hcCategory)));
  }
  function bindSearch() {
    const form=root()?.querySelector('#hc-search-form');
    const input=root()?.querySelector('#hc-search-input');
    form?.addEventListener('submit',event=>{event.preventDefault();const q=input?.value.trim()||'';state.query=q;if(q)renderSearch(q);else renderHome();});
    root()?.querySelector('#hc-search-clear')?.addEventListener('click',()=>{if(input)input.value='';input?.focus();state.query='';});
    const suggestions=root()?.querySelector('#hc-search-suggestions');
    input?.addEventListener('input',()=>{
      if(!suggestions)return;
      const term=input.value.trim().toLocaleLowerCase();
      if(term.length<2){suggestions.hidden=true;suggestions.innerHTML='';return;}
      const matches=[];
      for(const category of state.categories){
        if(category.name.toLocaleLowerCase().includes(term))matches.push({label:category.name,category:category.slug});
        for(const sub of category.subcategories||[]){
          if(sub.name.toLocaleLowerCase().includes(term))matches.push({label:sub.name,category:category.slug,subcategory:sub.slug});
        }
      }
      const items=matches.slice(0,8);
      suggestions.innerHTML=items.map(item=>'<button type="button" data-hc-suggest-category="'+esc(item.category)+'" data-hc-suggest-sub="'+esc(item.subcategory||'')+'">'+esc(item.label)+'</button>').join('');
      suggestions.hidden=!items.length;
      suggestions.querySelectorAll('[data-hc-suggest-category]').forEach(btn=>btn.addEventListener('click',()=>{
        suggestions.hidden=true;
        if(btn.dataset.hcSuggestSub)renderCategory(btn.dataset.hcSuggestCategory,btn.dataset.hcSuggestSub);
        else renderCategory(btn.dataset.hcSuggestCategory);
      }));
    });
    input?.addEventListener('keydown',event=>{if(event.key==='Escape'){input.value='';state.query='';if(suggestions)suggestions.hidden=true;}});
  }
  function bindArticleCards() { root()?.querySelectorAll('[data-hc-article]').forEach(btn=>btn.addEventListener('click',()=>renderArticle(btn.dataset.hcArticle).catch(error=>showError(error.message)))); }
  function bindSubcategories(){root()?.querySelectorAll('[data-hc-subcategory]').forEach(btn=>btn.addEventListener('click',()=>{state.query='';renderCategory(state.category.slug,btn.dataset.hcSubcategory);}));}
  async function render() {
    try { await loadBase(); await renderHome(); }
    catch(error){set('<div class="hc-shell">'+header('Help Center','Minglora knowledge and support.')+empty('Help Center temporarily unavailable',error.message)+button('Try again','data-hc-retry')+'</div>');root()?.querySelector('[data-hc-retry]')?.addEventListener('click',render);}
  }
  window.MingloraHelpCenter=Object.freeze({
    render, home:renderHome, category:renderCategory, search:renderSearch,
    article:renderArticle, saved:renderSaved, recent:renderRecent, admin:renderAdmin
  });
})();