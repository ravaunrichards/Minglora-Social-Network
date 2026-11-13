const $ = (selector, root=document) => root.querySelector(selector);
const state={categories:[],subcategories:[],popular:[],featured:[],recent:[],recentlyViewed:[],articles:[],adminAccess:false,currentCategory:null,currentSubcategory:null,currentArticle:null,adminOverview:null,bookmarks:[]};
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const sprite=name=>'<svg viewBox="0 0 64 64" aria-hidden="true"><use href="/assets/icons/navigation-3d.svg#'+esc(name)+'"></use></svg>';
const dateLabel=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?"":date.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});};
async function api(path,options={}) {
  const response=await fetch("/api/help-center"+path,{...options,credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||"The request could not be completed."),{status:response.status});
  return data;
}
function showError(message){const box=$("#hc-error");box.textContent=message;box.hidden=!message;}
function showStatus(message){$("#hc-status").textContent=message||"";}
function renderQuestion(item,meta="") {
  const title=item.question||item.title||"";
  const slug=item.article_slug||item.slug||item.help_articles?.slug||"";
  const category=item.category_title||item.category?.title||item.category_slug||"";
  const excerpt=item.excerpt||"";
  return '<button type="button" class="hc-question-card" data-open-article="'+esc(slug)+'"><span class="hc-question-mark" aria-hidden="true">?</span><span class="hc-question-copy"><strong>'+esc(title)+'</strong><small>'+esc(meta||[category,excerpt].filter(Boolean).join(" · "))+'</small></span><span class="hc-question-arrow" aria-hidden="true">›</span></button>';
}
function fillSelect(select,items,firstLabel="Choose a category") {
  select.innerHTML='<option value="">'+esc(firstLabel)+'</option>'+items.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.title)+'</option>').join("");
}
function renderCategoryGrid(){
  $("#hc-category-total").textContent=state.categories.length+" categories";
  $("#hc-category-grid").innerHTML=state.categories.map(category=>
    '<button type="button" class="hc-category-card" data-category="'+esc(category.slug)+'"><span class="hc-category-icon">'+sprite(category.icon)+'</span><span class="hc-category-copy"><strong>'+esc(category.title)+'</strong><small>'+esc(category.description||"Browse questions and guidance")+' · '+Number(category.articleCount||0)+' published articles</small></span></button>'
  ).join("");
  $("#hc-category-filter").innerHTML='<option value="">All categories</option>'+state.categories.map(c=>'<option value="'+esc(c.slug)+'">'+esc(c.title)+'</option>').join("");
  $("#hc-search-suggestions").innerHTML=state.categories.map(c=>'<option value="'+esc(c.title)+'"></option>').join("")+state.popular.map(p=>'<option value="'+esc(p.question)+'"></option>').join("");
  fillSelect($('[name="categoryId"]',$("#hc-article-form")),state.categories);
  fillSelect($('[name="categoryId"]',$("#hc-subcategory-form")),state.categories);
  $("#hc-category-admin-list").innerHTML=state.categories.map(c=>'<button type="button" data-edit-category="'+esc(c.id)+'"><span>'+esc(c.title)+'</span><small>Edit · order '+Number(c.sortOrder||0)+'</small></button>').join("");
}
function renderQuestionList(selector,items,emptyText){
  const node=$(selector);
  node.innerHTML=items.length?items.map(item=>renderQuestion(item)).join(""):'<p class="hc-empty-inline">'+esc(emptyText)+'</p>';
}
function setContentMode(mode){
  $("#hc-results").hidden=mode!=="results";
  $("#hc-article-view").hidden=mode!=="article";
  $("#hc-bookmarks-view").hidden=mode!=="bookmarks";
  $("#hc-category-detail").hidden=mode!=="category";
  $("#hc-categories").hidden=mode==="article"||mode==="bookmarks";
  $(".hc-discovery-grid").hidden=mode==="article"||mode==="bookmarks"||mode==="results";
  $("#hc-recent-section").hidden=mode==="article"||mode==="bookmarks"||mode==="results"||!state.recent.length;
  $("#hc-recently-viewed-section").hidden=mode!=="home"||!state.recentlyViewed.length;
  $("#hc-directory-empty").hidden=mode==="article"||mode==="bookmarks"||mode==="results"||state.articles.length>0;
  $("#hc-admin").hidden=mode!=="admin";
}
async function runSearch(query="",category="",subcategory=""){
  const params=new URLSearchParams({q:query,limit:"40"});
  if(category)params.set("category",category);
  if(subcategory)params.set("subcategory",subcategory);
  const result=await api("/search?"+params.toString());
  state.currentCategory=category||null;state.currentSubcategory=subcategory||null;
  $("#hc-results-title").textContent=query?"Results for “"+query+"”":category?(state.categories.find(c=>c.slug===category)?.title||"Category questions"):"All published questions";
  $("#hc-results-list").innerHTML=result.results.length?result.results.map(r=>renderQuestion(r)).join(""):'<p class="hc-empty-inline">No published questions match this search yet. Try another phrase or category, or contact Minglora Support.</p>';
  setContentMode("results");$("#hc-results").hidden=false;
}
async function loadCategoryQuestions(categorySlug,subcategorySlug=""){
  const params=new URLSearchParams({q:"",category:categorySlug,limit:"40"});
  if(subcategorySlug)params.set("subcategory",subcategorySlug);
  const result=await api("/search?"+params.toString());
  $("#hc-category-questions").innerHTML=result.results.length?result.results.map(r=>renderQuestion(r)).join("")
    :'<p class="hc-empty-inline">No verified questions are published for this topic yet. Use Contact Support for assistance.</p>';
}
async function renderCategoryDetail(slug){
  const category=state.categories.find(c=>c.slug===slug);if(!category)return;
  state.currentCategory=slug;state.currentSubcategory=null;
  $("#hc-category-detail-title").textContent=category.title;
  $("#hc-category-description").textContent=category.description||"Browse the subtopics within this area.";
  const subcategories=state.subcategories.filter(s=>s.categoryId===category.id).sort((a,b)=>a.sortOrder-b.sortOrder);
  $("#hc-subcategory-pills").innerHTML='<button type="button" data-subcategory="" aria-pressed="true">All topics</button>'+subcategories.map(s=>'<button type="button" data-subcategory="'+esc(s.slug)+'" aria-pressed="false">'+esc(s.title)+'</button>').join("");
  $("#hc-category-detail").hidden=false;$("#hc-results").hidden=true;$("#hc-article-view").hidden=true;$("#hc-bookmarks-view").hidden=true;$("#hc-categories").hidden=false;
  $(".hc-discovery-grid").hidden=true;$("#hc-recent-section").hidden=true;$("#hc-directory-empty").hidden=true;
  $("#hc-category-filter").value=slug;$("#hc-subcategory-filter").innerHTML='<option value="">All subcategories</option>'+subcategories.map(s=>'<option value="'+esc(s.slug)+'">'+esc(s.title)+'</option>').join("");$("#hc-subcategory-filter").disabled=!subcategories.length;
  $("#hc-category-questions").innerHTML='<p class="hc-empty-inline">Loading published questions…</p>';
  try{await loadCategoryQuestions(slug);}catch(error){$("#hc-category-questions").innerHTML='<p class="hc-empty-inline">'+esc(error.message)+'</p>';}
}
function markdownInline(source){
  let value=esc(source);
  value=value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(all,label,url)=>{
    const safe=url.replace(/&amp;/g,"&");
    if(/\.(mp4|webm)(?:\?|$)/i.test(safe))return '<a href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'+label+' (video)</a>';
    return '<a href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'+label+'</a>';
  });
  value=value.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>").replace(/`([^`]+)`/g,"<code>$1</code>");
  return value;
}
function markdownToHtml(markdown){
  const lines=String(markdown||"").replace(/\r/g,"").split("\n");
  const out=[];let list=null;
  const endList=()=>{if(list){out.push("</"+list+">");list=null;}};
  for(const raw of lines){
    const line=raw.trim();
    if(!line){endList();continue;}
    const image=line.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
    if(image){endList();out.push('<img src="'+esc(image[2])+'" alt="'+esc(image[1])+'" loading="lazy" referrerpolicy="no-referrer">');continue;}
    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    if(heading){endList();const level=heading[1].length+1;out.push('<h'+level+'>'+markdownInline(heading[2])+'</h'+level+'>');continue;}
    const bullet=line.match(/^[-*]\s+(.+)$/);const numbered=line.match(/^\d+[.)]\s+(.+)$/);
    if(bullet||numbered){const kind=bullet?"ul":"ol";if(list!==kind){endList();list=kind;out.push("<"+kind+">");}out.push("<li>"+markdownInline((bullet||numbered)[1])+"</li>");continue;}
    if(line.startsWith(">")){endList();out.push("<blockquote>"+markdownInline(line.slice(1).trim())+"</blockquote>");continue;}
    endList();out.push("<p>"+markdownInline(line)+"</p>");
  }
  endList();return out.join("");
}
async function openArticle(slug){
  if(!slug)return;
  showError("");showStatus("Loading article…");
  try{
    const result=await api("/articles/"+encodeURIComponent(slug));
    state.currentArticle=result;
    const a=result.article;
    $("#hc-article-title").textContent=a.title;
    $("#hc-article-excerpt").textContent=a.excerpt||"";
    $("#hc-article-meta").textContent=[a.category.title,a.subcategory.title,dateLabel(a.updatedAt)?"Updated "+dateLabel(a.updatedAt):""].filter(Boolean).join(" · ");
    $("#hc-article-content").innerHTML=markdownToHtml(a.answerMarkdown);
    $("#hc-breadcrumb").innerHTML='<button type="button" id="hc-breadcrumb-home">Help Center</button><span>›</span><button type="button" id="hc-breadcrumb-category">'+esc(a.category.title)+'</button><span>›</span><span>'+esc(a.title)+'</span>';
    $("#hc-related-wrap").hidden=!result.related.length;
    renderQuestionList("#hc-related-list",result.related,"No related questions have been published yet.");
    $("#hc-bookmark-toggle").textContent=state.bookmarks.some(row=>row.translation_id===a.translationId)?"Saved":"Save answer";
    $("#hc-feedback-message").textContent="";
    setContentMode("article");$("#hc-article-view").hidden=false;$("#hc-categories").hidden=true;
    $("#hc-directory-empty").hidden=true;$(".hc-discovery-grid").hidden=true;$("#hc-recent-section").hidden=true;
    const href=new URL(window.location.href);href.searchParams.set("article",slug);history.pushState({article:slug},"",href);
    api("/articles/"+encodeURIComponent(slug)+"/view",{method:"POST",body:JSON.stringify({translationId:a.translationId})}).catch(()=>{});
    showStatus("");
  }catch(error){showStatus("");showError(error.message);}
}
async function loadBookmarks(){
  try{
    const data=await api("/bookmarks");state.bookmarks=data.bookmarks||[];
    $("#hc-bookmarks-list").innerHTML=state.bookmarks.length?state.bookmarks.map(row=>{
      const t=row.help_article_translations||{},article=t.help_articles||{};
      return renderQuestion({slug:article.slug,title:t.title,excerpt:t.excerpt}, "Saved answer");
    }).join(""):'<p class="hc-empty-inline">You have not saved any Help Center answers yet.</p>';
    setContentMode("bookmarks");$("#hc-bookmarks-view").hidden=false;$("#hc-categories").hidden=true;
  }catch(error){showError(error.status===401?"Sign in to view your saved answers.":error.message);}
}
function renderAdmin(){
  const data=state.adminOverview;if(!data)return;
  const categories=data.categories||[],articles=data.articles||[];
  $("#hc-admin-article-list").innerHTML=articles.length?articles.map(row=>{
    const a=row.help_articles||{},status=row.status||"draft";
    const controls=status==="draft"?'<button data-transition="submit_review" data-article="'+esc(a.id)+'" data-translation="'+esc(row.id)+'">Submit for review</button>':
      status==="review"?'<button data-transition="complete_fact_check" data-article="'+esc(a.id)+'" data-translation="'+esc(row.id)+'">Complete fact-check</button>':
      status==="fact_check"?'<button data-transition="approve" data-article="'+esc(a.id)+'" data-translation="'+esc(row.id)+'">Approve</button>':
      status==="approved"?'<button data-transition="publish" data-article="'+esc(a.id)+'" data-translation="'+esc(row.id)+'">Publish</button>':
      status==="archived"?'<button data-transition="restore" data-article="'+esc(a.id)+'" data-translation="'+esc(row.id)+'">Restore draft</button>':"";
    const archive=status==="archived"?"":'<button data-transition="archive" data-article="'+esc(a.id)+'" data-translation="'+esc(row.id)+'">Archive</button>';
    return '<article class="hc-admin-article"><div class="hc-admin-article-head"><div><h4>'+esc(row.title)+'</h4><small>'+esc(a.slug||"")+" · "+esc(row.locale)+" · Updated "+esc(dateLabel(row.updated_at))+'</small></div><span class="hc-status-pill">'+esc(status)+'</span></div><div class="hc-admin-actions"><button data-edit-article="'+esc(a.id)+'" data-locale="'+esc(row.locale)+'">Edit</button><button data-revisions="'+esc(row.id)+'">Revision history</button>'+controls+archive+'</div></article>';
  }).join(""):'<p class="hc-empty-inline">No Help Center articles have been drafted yet.</p>';
  $("#hc-admin-searches").innerHTML=(data.popularSearches||[]).filter(s=>Number(s.result_count)===0).length
    ?data.popularSearches.filter(s=>Number(s.result_count)===0).map(s=>'<div class="hc-admin-mini-list"><small>'+esc(s.query_normalized)+' · '+Number(s.search_count)+' searches · last '+esc(dateLabel(s.last_searched_at))+'</small></div>').join("")
    :'<p class="hc-empty-inline">No unanswered search terms have been recorded yet.</p>';
  $("#hc-category-admin-list").innerHTML=categories.map(c=>'<button type="button" data-edit-category="'+esc(c.id)+'"><span>'+esc(c.title)+'</span><small>Edit · order '+Number(c.sortOrder||0)+'</small></button>').join("");
}
async function loadAdmin(){
  try{
    const data=await api("/admin/overview");state.adminOverview=data;state.categories=data.categories||state.categories;state.subcategories=data.subcategories||state.subcategories;
    renderCategoryGrid();renderAdmin();$("#hc-admin").hidden=false;
  }catch(error){$("#hc-admin").hidden=true;if(error.status!==403)showError(error.message);}
}
function field(form,name){return form.elements.namedItem(name);}
function resetArticleForm(){const form=$("#hc-article-form");form.reset();field(form,"articleId").value="";$("#hc-editor-heading").textContent="Create a Help article";$("#hc-editor-status").textContent="";updateSubcategoryChoices();}
function updateSubcategoryChoices(selected=""){
  const form=$("#hc-article-form"),categoryId=field(form,"categoryId").value;
  const items=state.subcategories.filter(s=>s.categoryId===categoryId);
  const select=field(form,"subcategoryId");select.innerHTML='<option value="">No subcategory</option>'+items.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.title)+'</option>').join("");select.value=selected;
}
function editArticle(id,locale){
  const row=(state.adminOverview?.articles||[]).find(x=>x.article_id===id&&x.locale===locale);if(!row)return;
  const form=$("#hc-article-form"),a=row.help_articles||{};
  field(form,"articleId").value=a.id;field(form,"title").value=row.title;field(form,"slug").value=a.slug;field(form,"categoryId").value=a.category_id;updateSubcategoryChoices(a.subcategory_id||"");
  field(form,"locale").value=row.locale;field(form,"excerpt").value=row.excerpt||"";field(form,"answerMarkdown").value=row.answer_markdown||"";
  field(form,"searchTerms").value=(row.search_terms||[]).join(", ");field(form,"sourceReference").value=row.source_reference||"";field(form,"isFeatured").checked=Boolean(a.is_featured);
  $("#hc-editor-heading").textContent="Edit Help article";$("#hc-editor-status").textContent="Saving edits returns the article to Draft so it must be reviewed again.";
  form.scrollIntoView({behavior:"smooth",block:"start"});
}
async function refreshAdmin(){const data=await api("/admin/overview");state.adminOverview=data;state.categories=data.categories||[];state.subcategories=data.subcategories||[];renderCategoryGrid();renderAdmin();}
function wireEvents(){
  $("#hc-search-form").addEventListener("submit",async event=>{event.preventDefault();try{await runSearch($("#hc-search-input").value.trim(),$("#hc-category-filter").value,$("#hc-subcategory-filter").value);}catch(error){showError(error.message);}});
  let searchTimer;
  $("#hc-search-input").addEventListener("input",()=>{clearTimeout(searchTimer);const value=$("#hc-search-input").value.trim();if(value.length<2)return;searchTimer=setTimeout(()=>runSearch(value,$("#hc-category-filter").value,$("#hc-subcategory-filter").value).catch(error=>showError(error.message)),350);});
  $("#hc-category-filter").addEventListener("change",()=>{const slug=$("#hc-category-filter").value;const category=state.categories.find(c=>c.slug===slug);const subs=state.subcategories.filter(s=>s.categoryId===category?.id);$("#hc-subcategory-filter").disabled=!subs.length;$("#hc-subcategory-filter").innerHTML='<option value="">All subcategories</option>'+subs.map(s=>'<option value="'+esc(s.slug)+'">'+esc(s.title)+'</option>').join("");runSearch($("#hc-search-input").value.trim(),slug,"").catch(error=>showError(error.message));});
  $("#hc-subcategory-filter").addEventListener("change",()=>runSearch($("#hc-search-input").value.trim(),$("#hc-category-filter").value,$("#hc-subcategory-filter").value).catch(error=>showError(error.message)));
  $("#hc-clear-search").addEventListener("click",()=>{ $("#hc-search-input").value="";$("#hc-category-filter").value="";$("#hc-subcategory-filter").innerHTML='<option value="">All subcategories</option>';$("#hc-subcategory-filter").disabled=true;$("#hc-results").hidden=true;setContentMode("home");});
  $("#hc-category-clear").addEventListener("click",()=>{ $("#hc-category-detail").hidden=true;$("#hc-categories").hidden=false;$(".hc-discovery-grid").hidden=false;$("#hc-recent-section").hidden=!state.recent.length;$("#hc-directory-empty").hidden=state.articles.length>0;});
  $("#hc-category-grid").addEventListener("click",event=>{const card=event.target.closest("[data-category]");if(card)renderCategoryDetail(card.dataset.category).catch(error=>showError(error.message));});
  $("#hc-category-detail").addEventListener("click",event=>{const button=event.target.closest("[data-subcategory]");if(!button)return;const category=state.currentCategory;const slug=button.dataset.subcategory;state.currentSubcategory=slug||null;$("#hc-subcategory-pills").querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));if(category){$("#hc-category-filter").value=category;$("#hc-subcategory-filter").value=slug;loadCategoryQuestions(category,slug).catch(error=>showError(error.message));}});
  $("#hc-breadcrumb").addEventListener("click",event=>{if(event.target.closest("#hc-breadcrumb-home")){history.pushState({},"","/help-center.html");setContentMode("home");$("#hc-categories").hidden=false;$(".hc-discovery-grid").hidden=false;$("#hc-recent-section").hidden=!state.recent.length;$("#hc-directory-empty").hidden=state.articles.length>0;}else if(event.target.closest("#hc-breadcrumb-category")&&state.currentArticle?.article?.category?.slug){renderCategoryDetail(state.currentArticle.article.category.slug).catch(error=>showError(error.message));}});
  document.body.addEventListener("click",event=>{
    const article=event.target.closest("[data-open-article]");if(article){openArticle(article.dataset.openArticle);return;}
    const category=event.target.closest("[data-edit-category]");if(category){const c=state.categories.find(x=>x.id===category.dataset.editCategory);if(!c)return;const f=$("#hc-category-form");field(f,"categoryId").value=c.id;field(f,"title").value=c.title;field(f,"slug").value=c.slug;field(f,"description").value=c.description||"";field(f,"icon").value=c.icon;field(f,"sortOrder").value=c.sortOrder||0;f.scrollIntoView({behavior:"smooth",block:"center"});return;}
    const edit=event.target.closest("[data-edit-article]");if(edit){editArticle(edit.dataset.editArticle,edit.dataset.locale);return;}
    const action=event.target.closest("[data-transition]");if(action){performTransition(action);return;}
    const revisions=event.target.closest("[data-revisions]");if(revisions){loadRevisions(revisions.dataset.revisions);return;}
    const restore=event.target.closest("[data-restore-revision]");if(restore){restoreRevision(restore.dataset.restoreRevision);return;}
  });
  $("#hc-bookmark-toggle").addEventListener("click",async()=>{
    const a=state.currentArticle?.article;if(!a)return;
    try{
      const saved=state.bookmarks.some(row=>row.translation_id===a.translationId);
      await api("/bookmarks/"+encodeURIComponent(a.translationId),{method:saved?"DELETE":"POST",body:"{}"});
      if(saved)state.bookmarks=state.bookmarks.filter(row=>row.translation_id!==a.translationId);
      else state.bookmarks.push({translation_id:a.translationId});
      $("#hc-bookmark-toggle").textContent=saved?"Save answer":"Saved";
    }catch(error){$("#hc-feedback-message").textContent=error.status===401?"Sign in to save this answer.":error.message;}
  });
  $("#hc-feedback-yes").addEventListener("click",()=>sendFeedback(true));
  $("#hc-feedback-no").addEventListener("click",()=>sendFeedback(false));
  $("#hc-saved-open").addEventListener("click",loadBookmarks);
  $("#hc-bookmarks-close").addEventListener("click",()=>{setContentMode("home");$("#hc-categories").hidden=false;$(".hc-discovery-grid").hidden=false;$("#hc-recent-section").hidden=!state.recent.length;$("#hc-directory-empty").hidden=state.articles.length>0;});
  $("#hc-editor-reset").addEventListener("click",resetArticleForm);
  $("#hc-article-form").addEventListener("change",event=>{if(event.target.name==="categoryId")updateSubcategoryChoices();});
  $("#hc-article-form").addEventListener("input",event=>{if(event.target.name==="title"&&!field($("#hc-article-form"),"articleId").value){const slug=event.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");$("#hc-article-form").slug.value=slug;}});
  $("#hc-article-form").addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),status=$("#hc-editor-status");button.disabled=true;status.textContent="Saving draft…";
    try{const payload=Object.fromEntries(new FormData(form).entries());payload.isFeatured=field(form,"isFeatured").checked;payload.searchTerms=String(payload.searchTerms||"").split(",").map(x=>x.trim()).filter(Boolean);
      const result=await api("/admin/articles",{method:"POST",body:JSON.stringify(payload)});status.textContent="Saved as Draft. It is not visible to members.";await refreshAdmin();field(form,"articleId").value=result.articleId;$("#hc-editor-heading").textContent="Edit Help article";
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  });
  $("#hc-category-form").addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{const payload=Object.fromEntries(new FormData(form).entries());await api("/admin/categories",{method:"POST",body:JSON.stringify(payload)});form.reset();field(form,"categoryId").value="";await refreshAdmin();}catch(error){showError(error.message);}finally{button.disabled=false;}
  });
  $("#hc-category-reset").addEventListener("click",()=>$("#hc-category-form").reset());
  $("#hc-subcategory-form").addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{await api("/admin/subcategories",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});form.reset();await refreshAdmin();}catch(error){showError(error.message);}finally{button.disabled=false;}
  });
}
async function sendFeedback(helpful){
  const article=state.currentArticle?.article;if(!article)return;
  try{await api("/articles/"+encodeURIComponent(article.slug)+"/feedback",{method:"POST",body:JSON.stringify({translationId:article.translationId,helpful})});$("#hc-feedback-message").textContent="Thank you. Your feedback has been recorded."; }
  catch(error){$("#hc-feedback-message").textContent=error.status===401?"Sign in to send feedback.":error.message;}
}
async function performTransition(button){
  button.disabled=true;try{await api("/admin/articles/transition",{method:"POST",body:JSON.stringify({
    articleId:button.dataset.article,translationId:button.dataset.translation,transition:button.dataset.transition
  })});await refreshAdmin();showStatus("Workflow updated.");}catch(error){showError(error.message);}finally{button.disabled=false;}
}
async function loadRevisions(translationId){
  try{const result=await api("/admin/articles/revisions?translationId="+encodeURIComponent(translationId));
    $("#hc-admin-revisions").innerHTML=(result.revisions||[]).length?result.revisions.map(r=>'<div class="hc-admin-revision"><span>Revision '+Number(r.revision_number)+' · '+esc(dateLabel(r.created_at))+' · '+esc(r.change_note)+'</span><button type="button" class="hc-quiet-button" data-restore-revision="'+esc(r.id)+'">Restore as draft</button></div>').join(""):'<p class="hc-empty-inline">No saved revisions are available for this article.</p>';
  }catch(error){showError(error.message);}
}
async function restoreRevision(id){
  if(!window.confirm("Restore this revision as a new Draft? The current version will be saved in revision history."))return;
  try{await api("/admin/articles/restore",{method:"POST",body:JSON.stringify({revisionId:id})});await refreshAdmin();showStatus("Revision restored as Draft. Review it before publishing.");}catch(error){showError(error.message);}
}
async function applyTheme(){
  const prefersDark=window.matchMedia?.("(prefers-color-scheme: dark)").matches===true;
  document.body.classList.toggle("theme-dark",prefersDark);
  document.body.classList.toggle("theme-system",true);
  document.body.style.colorScheme="light dark";
  try{
    const response=await fetch("/api/settings",{credentials:"same-origin",headers:{Accept:"application/json"}});
    if(!response.ok)return;
    const result=await response.json(),preferences=result.settings?.preferences||{};
    const mode=["light","dark","system"].includes(preferences.theme)?preferences.theme:"system";
    const themes=["minglora","ocean","tropical","royal","emerald","rose","golden","lavender","midnight","graphite"];
    const colorTheme=themes.includes(preferences.colorTheme)?preferences.colorTheme:"minglora";
    document.body.classList.toggle("theme-dark",mode==="dark"||(mode==="system"&&prefersDark));
    document.body.classList.toggle("theme-system",mode==="system");
    document.body.classList.toggle("reduce-motion",preferences.reducedMotion===true);
    document.body.classList.toggle("lite-mode",preferences.liteMode===true);
    document.body.dataset.colorTheme=colorTheme;
    document.body.style.colorScheme=mode==="system"?"light dark":mode;
  }catch{}
}
async function boot(){
  wireEvents();
  try{
    await applyTheme();
    const bootstrap=await api("/bootstrap");
    state.categories=bootstrap.categories||[];state.subcategories=bootstrap.subcategories||[];
    state.popular=bootstrap.popular||[];state.featured=bootstrap.featured||[];state.recent=bootstrap.recent||[];
    state.articles=state.recent;state.adminAccess=Boolean(bootstrap.adminAccess);
    renderCategoryGrid();
    if(state.featured.length){$("#hc-featured-section").hidden=false;renderQuestionList("#hc-featured-list",state.featured,"No featured articles have been published.");}
    if(state.popular.length){$("#hc-popular-section").hidden=false;renderQuestionList("#hc-popular-list",state.popular,"No popular articles have been recorded.");}
    if(state.recent.length){$("#hc-recent-section").hidden=false;renderQuestionList("#hc-recent-list",state.recent,"No recently updated answers.");}
    $("#hc-directory-empty").hidden=Boolean(bootstrap.articleCount);
    api("/bookmarks").then(data=>{state.bookmarks=data.bookmarks||[];if(state.currentArticle?.article)$("#hc-bookmark-toggle").textContent=state.bookmarks.some(row=>row.translation_id===state.currentArticle.article.translationId)?"Saved":"Save answer";}).catch(()=>{});
    api("/recently-viewed").then(data=>{
      state.recentlyViewed=data.recentlyViewed||[];
      if(state.recentlyViewed.length){
        renderQuestionList("#hc-recently-viewed-list",state.recentlyViewed,"No recently viewed answers.");
        $("#hc-recently-viewed-section").hidden=false;
      }
    }).catch(()=>{});
    if(bootstrap.adminAccess)await loadAdmin();
    const articleSlug=new URLSearchParams(location.search).get("article");
    if(articleSlug)await openArticle(articleSlug);
    showStatus("");
  }catch(error){showError(error.message||"The Minglora Help Center is temporarily unavailable.");showStatus("Check your connection or use Contact Support.");}
}
window.addEventListener("popstate",()=>{const slug=new URLSearchParams(location.search).get("article");if(slug)openArticle(slug);else{setContentMode("home");$("#hc-article-view").hidden=true;$("#hc-categories").hidden=false;$(".hc-discovery-grid").hidden=false;$("#hc-directory-empty").hidden=state.articles.length>0;}});
boot();
