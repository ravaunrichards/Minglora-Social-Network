(() => {
"use strict";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={bootstrap:null,categories:[],subcategories:[],results:[],query:"",category:"",subcategory:"",offset:0,hasMore:false,member:false,bookmarks:new Set(),article:null,adminOverview:null,currentAdminTab:"articles",currentArticleId:"",currentTranslationId:"",debounce:null};
const locale=(navigator.language||"en").slice(0,16);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=v=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}):"Date unavailable";};
async function api(url,options={}){const headers={...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})};const response=await fetch(url,{credentials:"same-origin",...options,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"The Help Center request could not be completed.");return data;}
function announcement(message){$("#hc-announcement").textContent=message||"";}
function section(id){["hc-home","hc-directory","hc-article","hc-admin"].forEach(k=>$("#"+k).hidden=k!==id);}
function setUrl(values){const u=new URL(location.href);["article","category","subcategory","q","saved","recent","manage"].forEach(k=>u.searchParams.delete(k));Object.entries(values).forEach(([k,v])=>{if(v)u.searchParams.set(k,v);});history.pushState({},"",u.pathname+u.search);}
const cat=slug=>state.categories.find(x=>x.slug===slug);
const subcats=slug=>{const c=cat(slug);return state.subcategories.filter(x=>x.categoryId===c?.id);};
function empty(title,detail){return '<div class="hc-empty"><strong>'+esc(title)+'</strong>'+esc(detail)+'</div>';}
function questionRow(x){return '<a class="hc-question-row" href="/help-center.html?article='+encodeURIComponent(x.article_slug||x.slug)+'"><span><strong>'+esc(x.question||x.title)+'</strong><p>'+esc(x.excerpt||"")+'</p><small>'+esc(x.category_title||"Minglora Help Center")+'</small></span><span class="hc-row-arrow">›</span></a>';}
function questionCard(x){return '<a class="hc-question-card" href="/help-center.html?article='+encodeURIComponent(x.article_slug||x.slug)+'"><strong>'+esc(x.question||x.title)+'</strong><p>'+esc(x.excerpt||"")+'</p><small>'+esc(x.category_title||"Help Center")+'</small></a>';}
function renderCategoryCards(){
$("#hc-categories").innerHTML=state.categories.map(x=>'<button class="hc-category-card" type="button" data-hc-category="'+esc(x.slug)+'"><span class="hc-category-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="/assets/icons/navigation-3d.svg#'+esc(x.icon||"request")+'"></use></svg></span><span class="hc-category-copy"><strong>'+esc(x.title)+'</strong><small>'+esc(x.description||"Browse questions")+(Number(x.articleCount||0)?" · "+Number(x.articleCount)+" published":"")+'</small></span></button>').join("")||empty("Categories unavailable","Refresh the Help Center.");
$$("[data-hc-category]").forEach(b=>b.onclick=()=>openCategory(b.dataset.hcCategory));
}
function renderHome(){
section("hc-home");renderCategoryCards();
const collections=[["popular","hc-popular"],["featured","hc-featured"]];
collections.forEach(([key,id])=>{const rows=state.bootstrap[key]||[];$("#hc-"+key+"-section").hidden=!rows.length;$("#"+id).innerHTML=rows.map(questionCard).join("");});
const recent=state.bootstrap.recent||[];$("#hc-recent-section").hidden=!recent.length;
$("#hc-recent").innerHTML=recent.map(x=>'<a class="hc-question-row" href="/help-center.html?article='+encodeURIComponent(x.slug)+'"><span><strong>'+esc(x.title)+'</strong><p>'+esc(x.excerpt||"")+'</p><small>Updated '+esc(date(x.updatedAt))+'</small></span><span class="hc-row-arrow">›</span></a>').join("");
$("#hc-year").textContent=new Date().getFullYear();
announcement(!Number(state.bootstrap.articleCount||0)?"The category directory is ready. No verified Q&A articles have been published yet.":"");
renderPersonal().catch(()=>{});
}
async function renderPersonal(){
if(!state.member)return;
try{const d=await api("/api/help-center/bookmarks");const rows=(d.bookmarks||[]).map(x=>x.help_article_translations).filter(Boolean);
rows.forEach(x=>state.bookmarks.add(x.id));$("#hc-saved-section").hidden=!rows.length;
$("#hc-saved").innerHTML=rows.map(x=>questionRow({slug:x.help_articles?.slug,title:x.title,excerpt:x.excerpt,category_title:"Saved answer"})).join("");
}catch{}
try{const d=await api("/api/help-center/view-history");const rows=d.views||[];$("#hc-history-section").hidden=!rows.length;
$("#hc-history").innerHTML=rows.map(x=>questionRow({slug:x.slug,title:x.title,excerpt:x.excerpt,category_title:"Viewed "+date(x.lastViewedAt)})).join("");
}catch{}
}
function categoryOptions(){const s=$("#hc-category-filter"),v=s.value;s.innerHTML='<option value="">All categories</option>'+state.categories.map(x=>'<option value="'+esc(x.slug)+'">'+esc(x.title)+'</option>').join("");s.value=v;}
function subcategoryOptions(category,selected=""){const s=$("#hc-subcategory-filter"),rows=category?subcats(category):state.subcategories;s.innerHTML='<option value="">All subcategories</option>'+rows.map(x=>'<option value="'+esc(x.slug)+'">'+esc(x.title)+'</option>').join("");s.disabled=!rows.length;s.value=selected;}
async function search({query="",category="",subcategory="",append=false}={}){
if(!append){state.offset=0;state.results=[];}
const p=new URLSearchParams({query,locale,limit:"20",offset:String(state.offset)});if(category)p.set("category",category);if(subcategory)p.set("subcategory",subcategory);
const d=await api("/api/help-center/search?"+p.toString());state.results=append?state.results.concat(d.results||[]):d.results||[];state.hasMore=Boolean(d.hasMore);state.offset+=(d.results||[]).length;return state.results;
}
function renderRows(rows){
$("#hc-directory-results").innerHTML=rows.length?rows.map(x=>'<a class="hc-question-row" href="/help-center.html?article='+encodeURIComponent(x.article_slug)+'"><span><strong>'+esc(x.question)+'</strong><p>'+esc(x.excerpt||"")+'</p><small>'+esc(x.category_title)+(x.subcategory_title?" · "+esc(x.subcategory_title):"")+" · Updated "+esc(date(x.updated_at))+'</small></span><span class="hc-row-arrow">›</span></a>').join(""):empty(state.query?"No matching published answers":"No published answers in this section yet","Try another phrase or contact Support if you still need help.");
}
async function openDirectory(o={}){
state.query=o.query||"";state.category=o.category||"";state.subcategory=o.subcategory||"";
$("#hc-search-input").value=state.query;section("hc-directory");$("#hc-directory-title").textContent=cat(state.category)?.title||(state.query?"Search results":"All questions");
$("#hc-directory-crumb").textContent=cat(state.category)?.title||"Questions";$("#hc-directory-description").textContent=state.query?'Results for “'+state.query+'”.':"Browse published questions by category and subcategory.";
$("#hc-category-filter").value=state.category;subcategoryOptions(state.category,state.subcategory);$("#hc-load-more").hidden=true;$("#hc-directory-results").innerHTML='<div class="hc-loading">Loading published answers…</div>';
try{const rows=await search({query:state.query,category:state.category,subcategory:state.subcategory});const sort=$("#hc-sort-filter").value;if(sort==="alphabetical")rows.sort((a,b)=>a.question.localeCompare(b.question));if(sort==="recent")rows.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));renderRows(rows);$("#hc-load-more").hidden=!state.hasMore;setUrl({q:state.query,category:state.category,subcategory:state.subcategory});}
catch(e){$("#hc-directory-results").innerHTML=empty("Questions could not be loaded",e.message);}
}
async function openCategory(slug,sub=""){
const c=cat(slug);if(!c)return;await openDirectory({category:slug,subcategory:sub});
const children=subcats(slug);$("#hc-directory-description").innerHTML='<p>'+esc(c.description||"")+'</p><div class="hc-filters">'+children.map(x=>'<button class="hc-secondary-button" type="button" data-hc-sub="'+esc(x.slug)+'">'+esc(x.title)+'</button>').join("")+'</div>';
$$("[data-hc-sub]").forEach(b=>b.onclick=()=>openCategory(slug,b.dataset.hcSub));$("#hc-directory-title").textContent=c.title;$("#hc-directory-crumb").textContent=c.title;setUrl({category:slug,subcategory:sub});
}
function inlineMarkdown(v){
let t=esc(v);
t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(m,label,raw)=>/^(https?:\/\/|mailto:|\/|#)/i.test(raw.trim())?'<a href="'+esc(raw.trim())+'"'+(/^https?:\/\//i.test(raw.trim())?' target="_blank" rel="noopener noreferrer"':'')+'>'+label+'</a>':label);
t=t.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
t=t.replace(/(^|[^*])\*([^*]+)\*/g,"$1<em>$2</em>");
return t;
}
function markdown(markdownText){
const lines=String(markdownText||"").replace(/\r\n/g,"\n").split("\n"),out=[];let para=[],list="",items=[];
const flushP=()=>{if(para.length){out.push("<p>"+para.map(inlineMarkdown).join("<br>")+"</p>");para=[];}};
const flushL=()=>{if(items.length){out.push("<"+list+">"+items.map(x=>"<li>"+inlineMarkdown(x)+"</li>").join("")+"</"+list+">");items=[];list="";}};
lines.forEach(line=>{
const h=line.match(/^(#{1,3})\s+(.+)$/),b=line.match(/^\s*[-*]\s+(.+)$/),n=line.match(/^\s*\d+[.)]\s+(.+)$/);
if(h){flushP();flushL();const l=h[1].length;out.push("<h"+l+">"+inlineMarkdown(h[2])+"</h"+l+">");}
else if(b||n){flushP();const kind=b?"ul":"ol";if(list&&list!==kind)flushL();list=kind;items.push((b||n)[1]);}
else if(line.startsWith("> ")){flushP();flushL();out.push("<blockquote>"+inlineMarkdown(line.slice(2))+"</blockquote>");}
else if(!line.trim()){flushP();flushL();}
else{flushL();para.push(line);}
});
flushP();flushL();return out.join("")||"<p>No answer text has been added.</p>";
}
function addRecent(article){try{const old=JSON.parse(localStorage.getItem("minglora-help-recent")||"[]");localStorage.setItem("minglora-help-recent",JSON.stringify([{slug:article.slug,title:article.title,excerpt:article.excerpt,lastViewedAt:new Date().toISOString()},...old.filter(x=>x.slug!==article.slug)].slice(0,10)));}catch{}}
async function openArticle(slug){
section("hc-article");$("#hc-article-answer").innerHTML='<div class="hc-loading">Loading answer…</div>';
try{const d=await api("/api/help-center/articles/"+encodeURIComponent(slug)+"?locale="+encodeURIComponent(locale)),a=d.article;state.article=a;
$("#hc-article-title").textContent=a.title;$("#hc-article-excerpt").textContent=a.excerpt||"";$("#hc-article-updated").textContent="Last updated "+date(a.updatedAt);$("#hc-article-locale").textContent="Language: "+a.locale;$("#hc-article-answer").innerHTML=markdown(a.answerMarkdown);
$("#hc-article-category").textContent=a.category?.title||"Help Center";$("#hc-article-category").href="/help-center.html?category="+encodeURIComponent(a.category?.slug||"");$("#hc-article-subcategory").textContent=a.subcategory?.title||"";
$("#hc-feedback-status").textContent=(d.feedback?.helpful||0)+" found this helpful · "+(d.feedback?.notHelpful||0)+" still need help";$("#hc-feedback-status").dataset.translationId=a.translationId;
$("#hc-related-section").hidden=!(d.related||[]).length;$("#hc-related").innerHTML=(d.related||[]).map(x=>questionRow({slug:x.slug,title:x.title,excerpt:x.excerpt,category_title:a.category?.title})).join("");
$("#hc-bookmark").hidden=!state.member;$("#hc-bookmark").textContent=state.bookmarks.has(a.translationId)?"Remove saved answer":"Save this answer";$("#hc-bookmark").dataset.translationId=a.translationId;$("#hc-bookmark").onclick=toggleBookmark;
$$("[data-hc-feedback]").forEach(b=>b.onclick=()=>feedback(b.dataset.hcFeedback==="true"));
$("#hc-back-directory").onclick=()=>state.category?openCategory(state.category):openDirectory({query:state.query});
if(state.member)api("/api/help-center/record-view",{method:"POST",body:JSON.stringify({translationId:a.translationId})}).catch(()=>{});
addRecent(a);setUrl({article:slug});announcement("");window.scrollTo({top:0,behavior:"smooth"});
}catch(e){$("#hc-article-answer").innerHTML=empty("This answer is unavailable",e.message);}
}
async function feedback(helpful){
if(!state.member){$("#hc-feedback-status").textContent="Sign in to rate this answer.";return;}
$$("[data-hc-feedback]").forEach(b=>b.disabled=true);
try{await api("/api/help-center/feedback",{method:"POST",body:JSON.stringify({translationId:$("#hc-feedback-status").dataset.translationId,helpful,note:""})});$("#hc-feedback-status").textContent="Thank you. Your feedback has been saved.";}
catch(e){$("#hc-feedback-status").textContent=e.message;}
finally{$$("[data-hc-feedback]").forEach(b=>b.disabled=false);}
}
async function toggleBookmark(){
const b=$("#hc-bookmark"),id=b.dataset.translationId;if(!state.member){b.textContent="Sign in to save answers";return;}b.disabled=true;
try{if(state.bookmarks.has(id)){await api("/api/help-center/bookmarks/"+encodeURIComponent(id),{method:"DELETE"});state.bookmarks.delete(id);b.textContent="Save this answer";}
else{await api("/api/help-center/bookmarks",{method:"POST",body:JSON.stringify({translationId:id})});state.bookmarks.add(id);b.textContent="Remove saved answer";}}
catch(e){b.textContent=e.message;}finally{b.disabled=false;}
}
async function suggestions(q){
const box=$("#hc-suggestions");if(q.trim().length<2){box.hidden=true;return;}
try{const d=await api("/api/help-center/search?"+new URLSearchParams({query:q,locale,limit:"6"}));const rows=d.results||[];
box.innerHTML=rows.length?rows.map(x=>'<button type="button" data-hc-suggest="'+esc(x.article_slug)+'">'+esc(x.question)+'</button>').join(""):'<div class="hc-empty">No matching published answers yet.</div>';box.hidden=false;
$$("[data-hc-suggest]",box).forEach(b=>b.onclick=()=>{box.hidden=true;openArticle(b.dataset.hcSuggest);});
}catch{box.hidden=true;}
}
function adminStatus(v){$("#hc-admin-status").textContent=v||"";}
async function adminApi(path,options={}){return api(path,{...options,headers:{...(options.headers||{})}});}
async function refreshAdmin(){state.adminOverview=await adminApi("/api/help-center/admin/overview");}
function adminTab(tab){
state.currentAdminTab=tab;$$(".hc-admin-tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.hcAdminTab===tab)));
if(tab==="articles")renderAdminArticles();else if(tab==="categories")renderAdminCategories();else if(tab==="feedback")renderAdminFeedback();else renderAdminSearches();
}
async function openAdmin(){
if(!state.bootstrap?.adminAccess){announcement("You do not have Help Center content-management permission.");return;}
section("hc-admin");adminStatus("Loading management data…");
try{await refreshAdmin();adminStatus("");adminTab("articles");setUrl({manage:"1"});}catch(e){adminStatus(e.message);}
}
function renderAdminArticles(){
const rows=state.adminOverview?.articles||[];
$("#hc-admin-panel").innerHTML='<div class="hc-admin-panel"><div class="hc-section-heading"><div><h2>Knowledge-base articles</h2><p>Only approved, fact-checked answers can be published.</p></div><span>'+rows.length+' translations</span></div><div class="hc-admin-list">'+(rows.length?rows.map(r=>'<div class="hc-admin-row"><div><strong>'+esc(r.title)+'<span class="hc-status-pill">'+esc(r.status)+'</span></strong><small>'+esc(r.help_articles?.slug||"")+' · '+esc(r.locale)+' · '+esc(date(r.updated_at))+'</small></div><button type="button" class="hc-secondary-button" data-hc-edit="'+esc(r.id)+'">Edit</button></div>').join(""):empty("No articles yet","Create a draft from approved Minglora material. No sample articles are inserted."))+'</div></div><div id="hc-admin-editor"></div>';
$$("[data-hc-edit]").forEach(b=>b.onclick=()=>editAdminArticle(b.dataset.hcEdit));
}
async function editAdminArticle(id){
adminStatus("Loading article…");
try{const d=await adminApi("/api/help-center/admin/article?translationId="+encodeURIComponent(id));state.currentArticleId=d.articleId;state.currentTranslationId=d.translationId;renderAdminEditor(d);adminStatus("");}
catch(e){adminStatus(e.message);}
}
function renderAdminEditor(d={}){
const categories=state.adminOverview?.categories||state.categories,categoryId=d.categoryId||categories[0]?.id||"";
const subs=(state.adminOverview?.subcategories||state.subcategories).filter(x=>x.category_id===categoryId||x.categoryId===categoryId);
const host=$("#hc-admin-editor");if(!host)return;
host.innerHTML='<div class="hc-admin-panel"><h2>'+(d.articleId?"Edit article":"Create article")+'</h2><form id="hc-article-form" class="hc-admin-form"><div class="hc-inline-fields"><label>Question / title<input name="title" required maxlength="180" value="'+esc(d.title||"")+'"></label><label>URL slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="120" value="'+esc(d.slug||"")+'"></label></div><div class="hc-inline-fields"><label>Category<select name="categoryId" required>'+categories.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===categoryId?" selected":"")+'>'+esc(x.title)+'</option>').join("")+'</select></label><label>Subcategory<select name="subcategoryId"><option value="">Choose subcategory</option>'+subs.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===(d.subcategoryId||"")?" selected":"")+'>'+esc(x.title)+'</option>').join("")+'</select></label></div><div class="hc-inline-fields"><label>Language / locale<input name="locale" value="'+esc(d.locale||"en")+'" pattern="[a-z]{2}(-[A-Z]{2})?"></label><label>Short answer preview<input name="excerpt" maxlength="400" value="'+esc(d.excerpt||"")+'"></label></div><label>Full answer (Markdown)<textarea name="answerMarkdown" maxlength="100000" required>'+esc(d.answerMarkdown||"")+'</textarea></label><div class="hc-inline-fields"><label>Search keywords, comma separated<input name="searchTerms" value="'+esc((d.searchTerms||[]).join(", "))+'"></label><label>Approved source / reference<input name="sourceReference" maxlength="500" required value="'+esc(d.sourceReference||"")+'" placeholder="Reference document, verified app route, or evidence"></label></div><label><input type="checkbox" name="isFeatured"'+(d.isFeatured?" checked":"")+'> Feature after approval</label><div class="hc-admin-actions"><button type="submit" class="hc-primary-button">Save draft</button><button type="button" id="hc-editor-close" class="hc-secondary-button">Close</button></div><p id="hc-editor-status" class="hc-admin-status" role="status"></p></form><div id="hc-workflow" class="hc-admin-actions"></div><div id="hc-revisions"></div></div>';
$("#hc-editor-close").onclick=()=>$("#hc-admin-editor").innerHTML="";
const form=$("#hc-article-form");
form.elements.categoryId.onchange=()=>{const list=(state.adminOverview?.subcategories||state.subcategories).filter(x=>(x.category_id||x.categoryId)===form.elements.categoryId.value);form.elements.subcategoryId.innerHTML='<option value="">Choose subcategory</option>'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join("");};
form.onsubmit=async event=>{
event.preventDefault();const values=Object.fromEntries(new FormData(form));values.articleId=d.articleId||"";values.searchTerms=String(values.searchTerms||"").split(",").map(x=>x.trim()).filter(Boolean);values.isFeatured=form.elements.isFeatured.checked;
const btn=form.querySelector('button[type=submit]'),status=$("#hc-editor-status");btn.disabled=true;status.textContent="Saving draft…";
try{const saved=await adminApi("/api/help-center/admin/articles",{method:"POST",body:JSON.stringify(values)});state.currentArticleId=saved.articleId;state.currentTranslationId=saved.translationId;await refreshAdmin();await editAdminArticle(saved.translationId);adminStatus("Draft saved. It is not visible to members.");}
catch(e){status.textContent=e.message;}finally{btn.disabled=false;}
};
if(d.translationId){
const transitions={draft:[["submit_review","Submit for review"]],review:[["complete_fact_check","Complete fact-check"]],fact_check:[["approve","Approve"]],approved:[["publish","Publish"]],published:[["archive","Archive"]],archived:[["restore","Restore as draft"]]};
(transitions[d.status]||[]).forEach(pair=>{
const b=document.createElement("button");b.type="button";b.className="hc-secondary-button";b.textContent=pair[1];b.onclick=async()=>{b.disabled=true;try{await adminApi("/api/help-center/admin/transitions",{method:"POST",body:JSON.stringify({articleId:d.articleId,translationId:d.translationId,transition:pair[0]})});await refreshAdmin();await editAdminArticle(d.translationId);adminStatus(pair[1]+" completed.");}catch(e){adminStatus(e.message);b.disabled=false;}};$("#hc-workflow").append(b);
});
adminApi("/api/help-center/admin/revisions?translationId="+encodeURIComponent(d.translationId)).then(result=>{
$("#hc-revisions").innerHTML='<h3>Revision history</h3>'+(result.revisions||[]).map(r=>'<div class="hc-admin-row"><div><strong>Revision '+Number(r.revision_number)+'</strong><small>'+esc(r.change_note||"Saved version")+' · '+esc(date(r.created_at))+'</small></div><button class="hc-secondary-button" type="button" data-hc-restore="'+esc(r.id)+'">Restore</button></div>').join("");
$$("[data-hc-restore]").forEach(b=>b.onclick=async()=>{if(!confirm("Restore this revision as a new draft? The current version will be preserved."))return;b.disabled=true;try{await adminApi("/api/help-center/admin/restore-revision",{method:"POST",body:JSON.stringify({revisionId:b.dataset.hcRestore})});await editAdminArticle(d.translationId);adminStatus("Revision restored as a draft.");}catch(e){adminStatus(e.message);b.disabled=false;}});
}).catch(()=>{});
}
}
function renderAdminCategories(){
const cats=state.adminOverview?.categories||state.categories,subs=state.adminOverview?.subcategories||state.subcategories;
$("#hc-admin-panel").innerHTML='<div class="hc-admin-panel"><h2>Categories</h2><p>Update the existing category structure. Avoid creating duplicate topics.</p><div class="hc-admin-list">'+cats.map(x=>'<div class="hc-admin-row"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.slug)+' · '+Number(x.articleCount||0)+' published</small></div><button class="hc-secondary-button" data-hc-cat-edit="'+esc(x.id)+'">Edit</button></div>').join("")+'</div></div><div class="hc-admin-panel"><h2>Create / update category</h2><form id="hc-cat-form" class="hc-admin-form"><div class="hc-inline-fields"><label>Title<input name="title" required maxlength="120"></label><label>Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*"></label></div><label>Description<input name="description" maxlength="500"></label><div class="hc-inline-fields"><label>3D icon<select name="icon">'+["home","profile","lock","friends","photo","video","messages","call","groups","live","creator","gift","coins","meetwave","activity","privacy","request","settings","search"].map(x=>'<option>'+x+'</option>').join("")+'</select></label><label>Sort order<input name="sortOrder" type="number" value="100"></label></div><input type="hidden" name="categoryId"><button class="hc-primary-button" type="submit">Save category</button></form></div><div class="hc-admin-panel"><h2>Subcategories</h2><form id="hc-sub-form" class="hc-admin-form"><div class="hc-inline-fields"><label>Category<select name="categoryId">'+cats.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join("")+'</select></label><label>Title<input name="title" required maxlength="120"></label></div><div class="hc-inline-fields"><label>Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*"></label><label>Sort order<input name="sortOrder" type="number" value="100"></label></div><label>Description<input name="description" maxlength="500"></label><button class="hc-primary-button" type="submit">Save subcategory</button></form><p class="hc-admin-status">'+subs.length+' current subcategories.</p></div>';
$$("[data-hc-cat-edit]").forEach(b=>b.onclick=()=>{const x=cats.find(c=>c.id===b.dataset.hcCatEdit),f=$("#hc-cat-form");if(!x)return;f.elements.categoryId.value=x.id;f.elements.title.value=x.title;f.elements.slug.value=x.slug;f.elements.description.value=x.description||"";f.elements.icon.value=x.icon||"request";f.elements.sortOrder.value=x.sortOrder||0;f.scrollIntoView({behavior:"smooth"});});
$("#hc-cat-form").onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));v.locale="en";v.isActive=true;try{await adminApi("/api/help-center/admin/categories",{method:"POST",body:JSON.stringify(v)});await refreshAdmin();adminTab("categories");adminStatus("Category saved.");}catch(x){adminStatus(x.message);}};
$("#hc-sub-form").onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));v.locale="en";v.isActive=true;try{await adminApi("/api/help-center/admin/subcategories",{method:"POST",body:JSON.stringify(v)});await refreshAdmin();adminTab("categories");adminStatus("Subcategory saved.");}catch(x){adminStatus(x.message);}};
}
async function renderAdminFeedback(){
$("#hc-admin-panel").innerHTML='<div class="hc-loading">Loading member feedback…</div>';
try{const d=await adminApi("/api/help-center/admin/feedback?limit=100");const rows=d.feedback||[];$("#hc-admin-panel").innerHTML='<div class="hc-admin-panel"><h2>Member answer feedback</h2><div class="hc-admin-list">'+(rows.length?rows.map(x=>'<div class="hc-admin-row"><div><strong>'+esc(x.title)+' · '+(x.helpful?"Helpful":"Needs improvement")+'</strong><small>'+esc(x.note||"No written note")+' · '+esc(date(x.created_at))+'</small></div></div>').join(""):empty("No feedback received","Member ratings will appear after questions are reviewed."))+'</div></div>';}catch(e){$("#hc-admin-panel").innerHTML=empty("Feedback unavailable",e.message);}
}
function renderAdminSearches(){const rows=state.adminOverview?.popularSearches||[];$("#hc-admin-panel").innerHTML='<div class="hc-admin-panel"><h2>Member search trends</h2><div class="hc-admin-list">'+(rows.length?rows.map(x=>'<div class="hc-admin-row"><div><strong>'+esc(x.query_normalized)+'</strong><small>'+Number(x.search_count||0)+' searches · '+Number(x.result_count||0)+' results on latest search</small></div></div>').join(""):empty("No search trends yet","Search activity appears here after real member searches."))+'</div></div>';}
function adminTabs(){
$$(".hc-admin-tabs button").forEach(b=>b.onclick=()=>adminTab(b.dataset.hcAdminTab));
$("#hc-admin-new").onclick=()=>{state.currentArticleId="";state.currentTranslationId="";renderAdminEditor();};
}
function wire(){
$("#hc-search-form").onsubmit=e=>{e.preventDefault();$("#hc-suggestions").hidden=true;openDirectory({query:$("#hc-search-input").value.trim()});};
$("#hc-search-input").oninput=e=>{clearTimeout(state.debounce);const q=e.target.value;state.debounce=setTimeout(()=>suggestions(q),220);};
$("#hc-search-input").onkeydown=e=>{if(e.key==="Escape")$("#hc-suggestions").hidden=true;};
document.addEventListener("click",e=>{if(!e.target.closest(".hc-search"))$("#hc-suggestions").hidden=true;});
$("#hc-all-categories").onclick=()=>openDirectory({});
$("#hc-category-filter").onchange=()=>{subcategoryOptions($("#hc-category-filter").value);openDirectory({query:state.query,category:$("#hc-category-filter").value});};
$("#hc-subcategory-filter").onchange=()=>openDirectory({query:state.query,category:$("#hc-category-filter").value,subcategory:$("#hc-subcategory-filter").value});
$("#hc-sort-filter").onchange=()=>openDirectory({query:state.query,category:state.category,subcategory:state.subcategory});
$("#hc-clear-filters").onclick=()=>openDirectory({query:state.query});
$("#hc-load-more").onclick=async()=>{const b=$("#hc-load-more");b.disabled=true;try{const rows=await search({query:state.query,category:state.category,subcategory:state.subcategory,append:true});renderRows(rows);b.hidden=!state.hasMore;}catch(e){announcement(e.message);}finally{b.disabled=false;}};
adminTabs();
}
async function boot(){
wire();categoryOptions();
try{
const results=await Promise.all([api("/api/help-center/bootstrap?locale="+encodeURIComponent(locale)),api("/api/auth/me").catch(()=>null)]);
state.bootstrap=results[0];state.categories=state.bootstrap.categories||[];state.subcategories=state.bootstrap.subcategories||[];state.member=Boolean(results[1]?.user?.id);categoryOptions();renderHome();
const p=new URLSearchParams(location.search);
if(p.get("article"))await openArticle(p.get("article"));
else if(p.get("category"))await openCategory(p.get("category"),p.get("subcategory")||"");
else if(p.get("manage")==="1"&&state.bootstrap.adminAccess)await openAdmin();
else if(p.get("q"))await openDirectory({query:p.get("q")||""});
if(state.bootstrap.adminAccess){const b=document.createElement("button");b.type="button";b.className="hc-link-button";b.textContent="Manage Help Center";b.onclick=openAdmin;$(".hc-top-actions").append(b);}
}catch(e){announcement("The Help Center could not connect to Minglora. "+e.message);$("#hc-categories").innerHTML=empty("Help Center temporarily unavailable","Refresh this page or contact Support.");}
}
window.addEventListener("popstate",()=>{const p=new URLSearchParams(location.search);if(p.get("article"))openArticle(p.get("article"));else if(p.get("category"))openCategory(p.get("category"),p.get("subcategory")||"");else if(p.get("manage")==="1"&&state.bootstrap?.adminAccess)openAdmin();else if(p.get("q"))openDirectory({query:p.get("q")});else renderHome();});
boot();
})();