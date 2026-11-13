import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const adminKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = SUPABASE_URL && adminKey ? createClient(SUPABASE_URL, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
}) : null;

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICONS = new Set(["home","profile","lock","friends","photo","video","messages","call","groups","live","creator","gift","coins","meetwave","activity","privacy","request","settings","search"]);
const now = () => new Date().toISOString();
const fail = (status: number, message: string) => json(status, { error: message });
const requiredText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,"0")).join("");
}
function constantTimeEqual(a: string,b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function requireStaff(actorUserId: string, mfaVerified: boolean) {
  if (!UUID.test(actorUserId)) return null;
  const { data, error } = await admin!.from("minglora_platform_staff")
    .select("user_id,role,active,permissions,mfa_required").eq("user_id",actorUserId).eq("active",true).maybeSingle();
  if (error || !data) return null;
  if (data.mfa_required === true && mfaVerified !== true) return null;
  const permissions = Array.isArray(data.permissions) ? data.permissions.map(String) : [];
  const accessPermissions = [
    "platform:admin","help_center:manage","help_center:review",
    "help_center:fact_check","help_center:approve","help_center:publish"
  ];
  return permissions.some((permission:string) => accessPermissions.includes(permission))
    ? { ...data, permissions } : null;
}
async function localizedNameMap(table: "help_category_translations" | "help_subcategory_translations",
  idColumn: "category_id" | "subcategory_id", ids: string[], locale: string) {
  if (!ids.length) return new Map<string,any>();
  const result=new Map<string,any>();
  const read=async(language:string)=>{
    const {data,error}=await admin!.from(table).select(idColumn+",title,description,locale,translation_status")
      .in(idColumn,ids).eq("locale",language).eq("translation_status","published");
    if(error) throw error;
    for(const row of data||[]) if(!result.has(row[idColumn]))
      result.set(row[idColumn],{...row,sourceLocale:language,isLocalized:language===locale});
  };
  await read(locale);
  if(locale!=="en"&&result.size<ids.length) await read("en");
  return result;
}
async function getCategoryNames(ids: string[], locale: string) {
  return localizedNameMap("help_category_translations","category_id",ids,locale);
}
async function getSubcategoryNames(ids: string[], locale: string) {
  return localizedNameMap("help_subcategory_translations","subcategory_id",ids,locale);
}
async function categoriesPayload(locale: string) {
  const [{data:cats,error:catError},{data:subs,error:subError}] = await Promise.all([
    admin!.from("help_categories").select("id,slug,icon_key,sort_order,is_active").eq("is_active",true).order("sort_order"),
    admin!.from("help_subcategories").select("id,category_id,slug,sort_order,is_active").eq("is_active",true).order("sort_order")
  ]);
  if (catError || subError) throw catError || subError;
  const catNames = await getCategoryNames((cats||[]).map((x:any)=>x.id),locale);
  const subNames = await getSubcategoryNames((subs||[]).map((x:any)=>x.id),locale);
  return {
    categories:(cats||[]).map((c:any)=>{const translation=catNames.get(c.id);return {id:c.id,slug:c.slug,icon:c.icon_key,sortOrder:c.sort_order,
      title:translation?.title || c.slug,description:translation?.description || "",sourceLocale:translation?.sourceLocale||null,
      isTranslated:translation?.isLocalized!==false,subcategories:[] as any[]};}),
    subcategories:(subs||[]).map((s:any)=>{const translation=subNames.get(s.id);return {id:s.id,categoryId:s.category_id,slug:s.slug,sortOrder:s.sort_order,
      title:translation?.title || s.slug,description:translation?.description || "",sourceLocale:translation?.sourceLocale||null,
      isTranslated:translation?.isLocalized!==false};})
  };
}
async function publishedTranslation(articleId: string, locale: string) {
  let {data,error}=await admin!.from("help_article_translations")
    .select("id,article_id,locale,title,excerpt,answer_markdown,search_terms,status,updated_at,published_at,source_reference,help_articles!inner(id,slug,category_id,subcategory_id,is_featured,is_active)")
    .eq("article_id",articleId).eq("locale",locale).eq("status","published").maybeSingle();
  if (error) throw error;
  if (!data && locale !== "en") {
    const fallback=await admin!.from("help_article_translations")
      .select("id,article_id,locale,title,excerpt,answer_markdown,search_terms,status,updated_at,published_at,source_reference,help_articles!inner(id,slug,category_id,subcategory_id,is_featured,is_active)")
      .eq("article_id",articleId).eq("locale","en").eq("status","published").maybeSingle();
    if (fallback.error) throw fallback.error;
    data=fallback.data;
  }
  return data;
}
async function articleResult(slug: string, locale: string) {
  const {data:article,error}=await admin!.from("help_articles").select("id,slug,category_id,subcategory_id,is_featured,is_active")
    .eq("slug",slug).eq("is_active",true).maybeSingle();
  if (error) throw error;
  if (!article) return null;
  const translation=await publishedTranslation(article.id,locale);
  if (!translation) return null;
  const {data:rels,error:relError}=await admin!.from("help_related_articles").select("related_article_id,sort_order")
    .eq("article_id",article.id).order("sort_order");
  if (relError) throw relError;
  const relatedIds=(rels||[]).map((x:any)=>x.related_article_id);
  const relatedLocales=locale==="en"?["en"]:[locale,"en"];
  const {data:relatedRows,error:relatedError}=relatedIds.length
    ? await admin!.from("help_article_translations").select("id,article_id,title,excerpt,locale,status,updated_at,help_articles!inner(slug,category_id,is_active)")
      .in("article_id",relatedIds).in("locale",relatedLocales).eq("status","published").eq("help_articles.is_active",true)
      .order("updated_at",{ascending:false})
    : {data:[],error:null};
  if (relatedError) throw relatedError;
  const preferredRelated=new Map<string,any>();
  for(const row of relatedRows||[]){
    const prior=preferredRelated.get(row.article_id);
    if(!prior||row.locale===locale) preferredRelated.set(row.article_id,row);
  }
  const names=await getCategoryNames([article.category_id],locale);
  const subNames=await getSubcategoryNames(article.subcategory_id?[article.subcategory_id]:[],translation.locale);
  const sub=subNames.get(article.subcategory_id||"")||null;
  const [{count:yes,error:yesError},{count:no,error:noError}]=await Promise.all([
    admin!.from("help_article_feedback").select("id",{count:"exact",head:true}).eq("translation_id",translation.id).eq("helpful",true),
    admin!.from("help_article_feedback").select("id",{count:"exact",head:true}).eq("translation_id",translation.id).eq("helpful",false)
  ]);
  if (yesError || noError) throw yesError || noError;
  return {
    article:{id:article.id,slug:article.slug,isFeatured:article.is_featured,translationId:translation.id,locale:translation.locale,
      title:translation.title,excerpt:translation.excerpt,answerMarkdown:translation.answer_markdown,searchTerms:translation.search_terms||[],updatedAt:translation.updated_at,
      publishedAt:translation.published_at,category:{id:article.category_id,slug:(await admin!.from("help_categories").select("slug").eq("id",article.category_id).single()).data?.slug||"",
        title:names.get(article.category_id)?.title || "Help"},
      subcategory:{id:article.subcategory_id,title:sub?.title||""}},
    related:[...preferredRelated.values()].sort((a:any,b:any)=>relatedIds.indexOf(a.article_id)-relatedIds.indexOf(b.article_id))
      .map((r:any)=>({id:r.article_id,translationId:r.id,slug:r.help_articles.slug,title:r.title,excerpt:r.excerpt})),
    feedback:{helpful:yes||0,notHelpful:no||0}
  };
}
async function adminOverview(locale: string) {
  const structure=await categoriesPayload(locale);
  const [{data:articles,error:articleError},{data:searches,error:searchError}] = await Promise.all([
    admin!.from("help_article_translations").select("id,article_id,locale,title,excerpt,status,updated_at,source_reference,source_verified_at,approved_by,help_articles!inner(id,slug,category_id,subcategory_id,is_featured,is_active)")
      .order("updated_at",{ascending:false}).limit(500),
    admin!.from("help_search_events").select("query_normalized,result_count,search_count,last_searched_at")
      .order("search_count",{ascending:false}).limit(30)
  ]);
  if (articleError || searchError) throw articleError || searchError;
  return {...structure,articles:articles||[],popularSearches:searches||[]};
}
async function saveArticle(input:any, actor:string) {
  const articleId=requiredText(input.articleId,64);
  const slug=requiredText(input.slug,120).toLowerCase();
  const title=requiredText(input.title,240);
  const excerpt=requiredText(input.excerpt,600);
  const answer=String(input.answerMarkdown??"");
  const categoryId=requiredText(input.categoryId,64);
  const subcategoryId=requiredText(input.subcategoryId,64)||null;
  const locale=requiredText(input.locale,16)||"en";
  if(!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)) return {error:"Use a language code such as en or es-MX.",status:400};
  const source=requiredText(input.sourceReference,500);
  const terms=Array.isArray(input.searchTerms)?input.searchTerms.map((x:any)=>requiredText(x,80)).filter(Boolean).slice(0,30):[];
  if (!SLUG.test(slug)||!title||answer.trim().length<1||answer.length>100000||!UUID.test(categoryId))
    return {error:"Enter a valid article slug, title, category and answer (maximum 100,000 characters).",status:400};
  const {data:category,error:categoryError}=await admin!.from("help_categories").select("id").eq("id",categoryId).eq("is_active",true).maybeSingle();
  if (categoryError||!category) return {error:"Choose an active Help Center category.",status:400};
  if (subcategoryId) {
    const {data:sub,error:subError}=await admin!.from("help_subcategories").select("id,category_id").eq("id",subcategoryId).eq("is_active",true).maybeSingle();
    if (subError||!sub||sub.category_id!==categoryId) return {error:"Choose a subcategory from the selected category.",status:400};
  }
  let article:any=null, translation:any=null;
  if (articleId) {
    if (!UUID.test(articleId)) return {error:"The article identifier is invalid.",status:400};
    const a=await admin!.from("help_articles").select("*").eq("id",articleId).maybeSingle();
    if (a.error||!a.data) return {error:"The article was not found.",status:404};
    article=a.data;
    const t=await admin!.from("help_article_translations").select("*").eq("article_id",articleId).eq("locale",locale).maybeSingle();
    if (t.error) return {error:"The article translation could not be loaded.",status:503};
    translation=t.data;
    if (translation) {
      const latest=await admin!.from("help_article_revisions").select("revision_number").eq("translation_id",translation.id).order("revision_number",{ascending:false}).limit(1).maybeSingle();
      if (latest.error) throw latest.error;
      const snapshot={article,translation};
      const inserted=await admin!.from("help_article_revisions").insert({translation_id:translation.id,revision_number:(latest.data?.revision_number||0)+1,
        snapshot,change_note:"Saved before an editorial update",created_by:actor});
      if (inserted.error) throw inserted.error;
    }
    const {data:updatedArticle,error:articleUpdateError}=await admin!.from("help_articles").update({
      category_id:categoryId,subcategory_id:subcategoryId,slug,is_featured:Boolean(input.isFeatured),updated_by:actor,updated_at:now()
    }).eq("id",articleId).select().single();
    if (articleUpdateError) throw articleUpdateError;
    article=updatedArticle;
    const payload={title,excerpt,answer_markdown:answer,search_terms:terms,source_reference:source,
      status:"draft",source_verified_at:null,approved_by:null,published_at:null,updated_by:actor,updated_at:now()};
    if (translation) {
      const {data,error}=await admin!.from("help_article_translations").update(payload).eq("id",translation.id).select().single();
      if (error) throw error; translation=data;
    } else {
      const {data,error}=await admin!.from("help_article_translations").insert({article_id:articleId,locale,...payload,created_by:actor}).select().single();
      if (error) throw error; translation=data;
    }
  } else {
    const {data,error}=await admin!.from("help_articles").insert({category_id:categoryId,subcategory_id:subcategoryId,slug,
      is_featured:Boolean(input.isFeatured),created_by:actor,updated_by:actor}).select().single();
    if (error) throw error;
    article=data;
    const {data:created,error:translationError}=await admin!.from("help_article_translations").insert({
      article_id:article.id,locale,title,excerpt,answer_markdown:answer,search_terms:terms,source_reference:source,
      status:"draft",created_by:actor,updated_by:actor
    }).select().single();
    if (translationError) {
      await admin!.from("help_articles").delete().eq("id",article.id);
      throw translationError;
    }
    translation=created;
  }
  const relatedIds=[...new Set((Array.isArray(input.relatedArticleIds)?input.relatedArticleIds:[])
    .map((id:any)=>requiredText(id,64)).filter((id:string)=>UUID.test(id)&&id!==article.id))].slice(0,20);
  if(relatedIds.length){
    const {data:validRelated,error:relatedValidationError}=await admin!.from("help_articles").select("id")
      .in("id",relatedIds).eq("is_active",true);
    if(relatedValidationError) throw relatedValidationError;
    if((validRelated||[]).length!==relatedIds.length) return {error:"One or more related articles are unavailable.",status:400};
    const {error:upsertError}=await admin!.from("help_related_articles").upsert(
      relatedIds.map((related_article_id:string,sort_order:number)=>({article_id:article.id,related_article_id,sort_order})),
      {onConflict:"article_id,related_article_id"});
    if(upsertError) throw upsertError;
  }
  const {data:existingRelations,error:existingRelationError}=await admin!.from("help_related_articles")
    .select("related_article_id").eq("article_id",article.id);
  if(existingRelationError) throw existingRelationError;
  const staleIds=(existingRelations||[]).map((row:any)=>row.related_article_id).filter((id:string)=>!relatedIds.includes(id));
  if(staleIds.length){
    const {error:removeError}=await admin!.from("help_related_articles").delete().eq("article_id",article.id).in("related_article_id",staleIds);
    if(removeError) throw removeError;
  }
  return {articleId:article.id,translationId:translation.id,status:translation.status,title:translation.title};
}

Deno.serve(async (req:Request) => {
  if (req.method!=="POST") return fail(405,"Method not allowed.");
  if (!admin) return fail(503,"Minglora Help Center storage is not configured.");
  const supplied=req.headers.get("x-minglora-api-key")||"";
  if (!supplied || supplied.length<40) return fail(401,"Unauthorized.");
  const {data:credential,error:credentialError}=await admin.from("minglora_runtime_api_secrets")
    .select("secret_sha256").eq("name","render_runtime").maybeSingle();
  if (credentialError || !credential?.secret_sha256) return fail(503,"Minglora runtime authorization is unavailable.");
  if (!constantTimeEqual(await sha256(supplied),credential.secret_sha256)) return fail(401,"Unauthorized.");
  let input:any;
  try {
    const raw=await req.text();
    if (new TextEncoder().encode(raw).byteLength>1_000_000) return fail(413,"Request is too large.");
    input=JSON.parse(raw);
    if (!input||typeof input!=="object"||Array.isArray(input)) return fail(400,"Invalid request.");
  } catch { return fail(400,"Invalid JSON request."); }

  const action=requiredText(input.action,40);
  const actor=requiredText(input.actorUserId,64);
  const mfaVerified=input.mfaVerified===true;
  const locale=requiredText(input.locale,16)||"en";
  try {
    if (["record_view","feedback","bookmarks","view_history","bookmark_add","bookmark_remove"].includes(action) && !UUID.test(actor))
      return fail(401,"A valid Minglora member session is required.");

    if (action==="bootstrap") {
      const structure=await categoriesPayload(locale);
      const queryLocales=locale==="en"?["en"]:[locale,"en"];
      const [{data:published,error:publishedError},{data:popular,error:popularError}] = await Promise.all([
        admin.from("help_article_translations").select("id,article_id,locale,title,excerpt,updated_at,published_at,help_articles!inner(id,slug,category_id,subcategory_id,is_featured,is_active)")
          .eq("status","published").in("locale",queryLocales).eq("help_articles.is_active",true).order("updated_at",{ascending:false}).limit(500),
        admin.rpc("help_center_popular",{p_locale:locale,p_limit:8})
      ]);
      if (publishedError||popularError) throw publishedError||popularError;
      const preferredTranslations=new Map<string,any>();
      for (const row of published||[]) {
        const existing=preferredTranslations.get(row.article_id);
        if(!existing||row.locale===locale) preferredTranslations.set(row.article_id,row);
      }
      const currentPublished=[...preferredTranslations.values()].sort((a:any,b:any)=>
        new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime());
      const categoryCounts=new Map<string,number>();
      for (const row of currentPublished) {
        const article=(row as any).help_articles;
        categoryCounts.set(article.category_id,(categoryCounts.get(article.category_id)||0)+1);
      }
      const cats=structure.categories.map((c:any)=>({...c,articleCount:categoryCounts.get(c.id)||0}));
      const recent=currentPublished.slice(0,8).map((row:any)=>({id:row.article_id,translationId:row.id,slug:row.help_articles.slug,
        title:row.title,excerpt:row.excerpt,updatedAt:row.updated_at,categorySlug:cats.find((c:any)=>c.id===row.help_articles.category_id)?.slug||""}));
      const recentlyAdded=[...currentPublished].sort((a:any,b:any)=>
        new Date(b.published_at||b.updated_at).getTime()-new Date(a.published_at||a.updated_at).getTime()
      ).slice(0,8).map((row:any)=>({id:row.article_id,translationId:row.id,slug:row.help_articles.slug,
        title:row.title,excerpt:row.excerpt,publishedAt:row.published_at||row.updated_at,categorySlug:cats.find((c:any)=>c.id===row.help_articles.category_id)?.slug||""}));
      const featured=currentPublished.filter((row:any)=>row.help_articles.is_featured).slice(0,8).map((row:any)=>({
        id:row.article_id,translationId:row.id,slug:row.help_articles.slug,title:row.title,excerpt:row.excerpt,updatedAt:row.updated_at
      }));
      let popularRows=popular||[];
      if(!popularRows.length&&locale!=="en"){
        const fallback=await admin.rpc("help_center_popular",{p_locale:"en",p_limit:8});
        if(fallback.error) throw fallback.error;
        popularRows=fallback.data||[];
      }
      return json(200,{categories:cats,subcategories:structure.subcategories,popular:popularRows,featured,recent,recentlyAdded,
        articleCount:currentPublished.length,locale,adminAccess:Boolean((await requireStaff(actor,mfaVerified)))});
    }
    if (action==="search") {
      const query=requiredText(input.query,120);
      const limit=Math.max(1,Math.min(50,Number(input.limit)||20));
      const offset=Math.max(0,Math.min(10000,Number(input.offset)||0));
      const {data,error}=await admin.rpc("help_center_search",{p_query:query,p_locale:locale,
        p_category_slug:requiredText(input.categorySlug,120)||null,p_subcategory_slug:requiredText(input.subcategorySlug,120)||null,
        p_limit:limit,p_offset:offset});
      if (error) throw error;
      await admin.rpc("help_center_record_search",{p_query:query,p_result_count:(data||[]).length});
      return json(200,{results:data||[],query,limit,offset,hasMore:(data||[]).length===limit});
    }
    if (action==="article") {
      const slug=requiredText(input.slug,120).toLowerCase();
      if (!SLUG.test(slug)) return fail(400,"Article link is not valid.");
      const result=await articleResult(slug,locale);
      if (!result) return fail(404,"This Help Center article is not published or is unavailable.");
      return json(200,result);
    }
    if (action==="record_view") {
      const id=requiredText(input.translationId,64);
      if (!UUID.test(id)) return fail(400,"Invalid article identifier.");
      const {error}=await admin.rpc("help_center_record_view",{p_translation_id:id,p_user_id:actor});
      if (error) throw error;
      return json(200,{ok:true});
    }
    if (action==="feedback") {
      const id=requiredText(input.translationId,64);
      if (!UUID.test(id)||typeof input.helpful!=="boolean") return fail(400,"Choose whether this answer helped.");
      const note=requiredText(input.note,1000);
      const {data:published,error:checkError}=await admin.from("help_article_translations").select("id").eq("id",id).eq("status","published").maybeSingle();
      if (checkError||!published) return fail(404,"This article is no longer available.");
      const {error}=await admin.from("help_article_feedback").upsert({translation_id:id,user_id:actor,helpful:input.helpful,note,updated_at:now()},{onConflict:"translation_id,user_id"});
      if (error) throw error;
      return json(200,{ok:true});
    }
    if (action==="bookmarks") {
      const {data,error}=await admin.from("help_user_bookmarks").select("translation_id,created_at,help_article_translations!inner(id,title,excerpt,article_id,locale,status,help_articles!inner(slug,category_id,is_active))")
        .eq("user_id",actor).eq("help_article_translations.status","published").eq("help_article_translations.help_articles.is_active",true)
        .order("created_at",{ascending:false}).limit(100);
      if (error) throw error;
      return json(200,{bookmarks:data||[]});
    }
    if (action==="view_history") {
      const {data,error}=await admin.from("help_article_views")
        .select("translation_id,view_count,last_viewed_at,help_article_translations!inner(title,excerpt,locale,status,help_articles!inner(slug,is_active))")
        .eq("user_id",actor).eq("help_article_translations.status","published")
        .eq("help_article_translations.locale",locale).eq("help_article_translations.help_articles.is_active",true)
        .order("last_viewed_at",{ascending:false}).limit(12);
      if(error) throw error;
      return json(200,{views:(data||[]).map((row:any)=>({translationId:row.translation_id,
        title:row.help_article_translations.title,excerpt:row.help_article_translations.excerpt,
        slug:row.help_article_translations.help_articles.slug,lastViewedAt:row.last_viewed_at,viewCount:row.view_count}))});
    }
    if (action==="bookmark_add"||action==="bookmark_remove") {
      const id=requiredText(input.translationId,64);
      if (!UUID.test(id)) return fail(400,"Invalid article identifier.");
      if (action==="bookmark_add") {
        const {data:row,error:lookupError}=await admin.from("help_article_translations").select("id").eq("id",id).eq("status","published").maybeSingle();
        if (lookupError||!row) return fail(404,"This article is no longer available.");
        const {error}=await admin.from("help_user_bookmarks").upsert({user_id:actor,translation_id:id},{onConflict:"user_id,translation_id"});
        if (error) throw error;
      } else {
        const {error}=await admin.from("help_user_bookmarks").delete().eq("user_id",actor).eq("translation_id",id);
        if (error) throw error;
      }
      return json(200,{ok:true});
    }

    const staff=await requireStaff(actor,mfaVerified);
    if (!staff) return fail(403,"Help Center content-management permission is required.");
    const staffPermissions=Array.isArray(staff.permissions)?staff.permissions.map(String):[];
    const isPlatformAdmin=staffPermissions.includes("platform:admin");
    const canManageContent=isPlatformAdmin||staffPermissions.includes("help_center:manage");
    const managementActions=new Set(["admin_article_save","admin_category_save","admin_subcategory_save","admin_restore_revision"]);
    if (managementActions.has(action)&&!canManageContent)
      return fail(403,"Help Center editor permission is required for this change.");
    if (action==="admin_overview") return json(200,await adminOverview(locale));
    if (action==="admin_article_get") {
      const id=requiredText(input.translationId,64);
      if(!UUID.test(id)) return fail(400,"Invalid article translation.");
      const {data,error}=await admin.from("help_article_translations")
        .select("id,article_id,locale,title,excerpt,answer_markdown,search_terms,status,source_reference,help_articles!inner(id,slug,category_id,subcategory_id,is_featured,is_active)")
        .eq("id",id).maybeSingle();
      if(error) throw error;
      if(!data) return fail(404,"The requested article draft was not found.");
      const a=data.help_articles;
      const {data:relations,error:relationError}=await admin.from("help_related_articles")
        .select("related_article_id").eq("article_id",data.article_id).order("sort_order",{ascending:true});
      if(relationError) throw relationError;
      return json(200,{articleId:data.article_id,translationId:data.id,locale:data.locale,title:data.title,
        excerpt:data.excerpt,answerMarkdown:data.answer_markdown,searchTerms:data.search_terms||[],status:data.status,
        sourceReference:data.source_reference,slug:a.slug,categoryId:a.category_id,subcategoryId:a.subcategory_id,
        isFeatured:a.is_featured,isActive:a.is_active,relatedArticleIds:(relations||[]).map((row:any)=>row.related_article_id)});
    }
    if (action==="admin_feedback") {
      const limit=Math.max(1,Math.min(100,Number(input.limit)||50));
      const {data,error}=await admin.from("help_article_feedback")
        .select("id,translation_id,helpful,note,created_at,help_article_translations!inner(title,locale,help_articles!inner(slug))")
        .order("updated_at",{ascending:false}).limit(limit);
      if(error) throw error;
      return json(200,{feedback:(data||[]).map((row:any)=>({id:row.id,translationId:row.translation_id,
        helpful:row.helpful,note:row.note,created_at:row.created_at,title:row.help_article_translations.title,
        locale:row.help_article_translations.locale,slug:row.help_article_translations.help_articles.slug}))});
    }
    if (action==="admin_article_save") {
      const saved=await saveArticle(input,actor);
      return saved.error?fail(saved.status||400,saved.error):json(200,{ok:true,...saved});
    }
    if (action==="admin_transition") {
      const articleId=requiredText(input.articleId,64),translationId=requiredText(input.translationId,64);
      const transition=requiredText(input.transition,24);
      if (!UUID.test(articleId)||!UUID.test(translationId)) return fail(400,"Invalid article reference.");
      const {data:t,error}=await admin.from("help_article_translations").select("*").eq("id",translationId).eq("article_id",articleId).maybeSingle();
      if (error||!t) return fail(404,"The selected article translation was not found.");
      const transitions:Record<string,string>={submit_review:"review",complete_fact_check:"fact_check",approve:"approved",publish:"published",archive:"archived",restore:"draft"};
      const next=transitions[transition];
      if (!next) return fail(400,"Choose a supported publishing workflow action.");
      const transitionPermissions:Record<string,string>={
        submit_review:"help_center:manage",complete_fact_check:"help_center:fact_check",
        approve:"help_center:approve",publish:"help_center:publish",
        archive:"help_center:manage",restore:"help_center:manage"
      };
      const requiredPermission=transitionPermissions[transition];
      const canFactCheck=transition==="complete_fact_check"&&staffPermissions.includes("help_center:review");
      if (!isPlatformAdmin&&!staffPermissions.includes(requiredPermission)&&!canFactCheck)
        return fail(403,"Your Help Center role does not have permission for this publishing stage.");
      if (transition==="submit_review"&&t.status!=="draft") return fail(409,"Only a draft can be submitted for review.");
      if (transition==="complete_fact_check"&&(t.status!=="review"||!t.source_reference)) return fail(409,"Add a source reference and complete review before fact-checking.");
      if (transition==="approve"&&(t.status!=="fact_check"||!t.source_verified_at)) return fail(409,"Complete the fact-check stage before approval.");
      if (transition==="publish"&&(t.status!=="approved"||!t.approved_by||!t.source_verified_at)) return fail(409,"Only approved, fact-checked articles can be published.");
      if (transition==="archive"&&t.status==="archived") return fail(409,"This article is already archived.");
      if (transition==="restore"&&t.status!=="archived") return fail(409,"Only archived articles can be restored.");
      const patch:any={status:next,updated_by:actor,updated_at:now()};
      if (transition==="complete_fact_check") { patch.source_verified_at=now();patch.last_reviewed_at=now(); }
      if (transition==="approve") patch.approved_by=actor;
      if (transition==="publish") patch.published_at=now();
      if (transition==="archive"||transition==="restore") { patch.published_at=null; if(transition==="restore") {patch.approved_by=null;patch.source_verified_at=null;} }
      const {error:updateError}=await admin.from("help_article_translations").update(patch).eq("id",translationId);
      if (updateError) throw updateError;
      return json(200,{ok:true,status:next});
    }
    if (action==="admin_revisions") {
      const id=requiredText(input.translationId,64);
      if (!UUID.test(id)) return fail(400,"Invalid article translation.");
      const {data,error}=await admin.from("help_article_revisions").select("id,revision_number,change_note,created_by,created_at,snapshot")
        .eq("translation_id",id).order("revision_number",{ascending:false}).limit(50);
      if (error) throw error;
      return json(200,{revisions:data||[]});
    }
    if (action==="admin_restore_revision") {
      const id=requiredText(input.revisionId,64);
      if (!UUID.test(id)) return fail(400,"Invalid revision reference.");
      const {data:revision,error:revisionError}=await admin.from("help_article_revisions").select("*").eq("id",id).maybeSingle();
      if (revisionError||!revision) return fail(404,"The selected revision was not found.");
      const snapshot=revision.snapshot||{};
      const oldTranslation=snapshot.translation;
      const oldArticle=snapshot.article;
      if (!oldTranslation||!oldArticle) return fail(409,"This revision does not contain a restorable snapshot.");
      const {data:current,error:currentError}=await admin.from("help_article_translations").select("*").eq("id",revision.translation_id).maybeSingle();
      const {data:currentArticle,error:articleError}=await admin.from("help_articles").select("*").eq("id",oldArticle.id).maybeSingle();
      if (currentError||articleError||!current||!currentArticle) return fail(409,"The current article could not be loaded for safe restoration.");
      const latest=await admin.from("help_article_revisions").select("revision_number").eq("translation_id",revision.translation_id).order("revision_number",{ascending:false}).limit(1).maybeSingle();
      if (latest.error) throw latest.error;
      const {error:backupError}=await admin.from("help_article_revisions").insert({translation_id:revision.translation_id,
        revision_number:(latest.data?.revision_number||0)+1,snapshot:{article:currentArticle,translation:current},
        change_note:"Current version saved before restoring a previous revision",created_by:actor});
      if (backupError) throw backupError;
      const articlePatch={category_id:oldArticle.category_id,subcategory_id:oldArticle.subcategory_id,slug:oldArticle.slug,
        is_featured:oldArticle.is_featured,updated_by:actor,updated_at:now()};
      const translationPatch={title:oldTranslation.title,excerpt:oldTranslation.excerpt,answer_markdown:oldTranslation.answer_markdown,
        search_terms:oldTranslation.search_terms,source_reference:oldTranslation.source_reference,status:"draft",
        source_verified_at:null,approved_by:null,published_at:null,updated_by:actor,updated_at:now()};
      const a=await admin.from("help_articles").update(articlePatch).eq("id",oldArticle.id);
      const t=await admin.from("help_article_translations").update(translationPatch).eq("id",revision.translation_id);
      if (a.error||t.error) throw a.error||t.error;
      return json(200,{ok:true,status:"draft"});
    }
    if (action==="admin_category_save") {
      const id=requiredText(input.categoryId,64),slug=requiredText(input.slug,120).toLowerCase();
      const title=requiredText(input.title,120),description=requiredText(input.description,500);
      const icon=requiredText(input.icon,30),locale=requiredText(input.locale,16)||"en";
      if (!title||!SLUG.test(slug)||!ICONS.has(icon)) return fail(400,"Enter a valid category title, slug and icon.");
      let category:any;
      if (id) {
        const {data,error}=await admin.from("help_categories").update({slug,icon_key:icon,sort_order:Number(input.sortOrder)||0,
          is_active:input.isActive!==false,updated_at:now()}).eq("id",id).select().single();
        if (error) throw error;category=data;
      } else {
        const {data,error}=await admin.from("help_categories").insert({slug,icon_key:icon,sort_order:Number(input.sortOrder)||0}).select().single();
        if (error) throw error;category=data;
      }
      const {error:translationError}=await admin.from("help_category_translations").upsert({
        category_id:category.id,locale,title,description,translation_status:"published",updated_at:now()
      },{onConflict:"category_id,locale"});
      if (translationError) throw translationError;
      return json(200,{ok:true,categoryId:category.id});
    }
    if (action==="admin_subcategory_save") {
      const id=requiredText(input.subcategoryId,64),categoryId=requiredText(input.categoryId,64),slug=requiredText(input.slug,120).toLowerCase();
      const title=requiredText(input.title,120),description=requiredText(input.description,500),locale=requiredText(input.locale,16)||"en";
      if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)) return fail(400,"Use a language code such as en or es-MX.");
      if (!UUID.test(categoryId)||!title||!SLUG.test(slug)) return fail(400,"Enter a valid category, subcategory title and slug.");
      let sub:any;
      if (id) {
        const {data,error}=await admin.from("help_subcategories").update({category_id:categoryId,slug,sort_order:Number(input.sortOrder)||0,
          is_active:input.isActive!==false,updated_at:now()}).eq("id",id).select().single();
        if (error) throw error;sub=data;
      } else {
        const {data,error}=await admin.from("help_subcategories").insert({category_id:categoryId,slug,sort_order:Number(input.sortOrder)||0}).select().single();
        if (error) throw error;sub=data;
      }
      const {error:translationError}=await admin.from("help_subcategory_translations").upsert({
        subcategory_id:sub.id,locale,title,description,translation_status:"published",updated_at:now()
      },{onConflict:"subcategory_id,locale"});
      if (translationError) throw translationError;
      return json(200,{ok:true,subcategoryId:sub.id});
    }
    return fail(400,"Unsupported Help Center action.");
  } catch (error) {
    console.error("[Minglora Help Center]",String((error as any)?.message||error).slice(0,300));
    return fail(500,"Minglora could not complete that Help Center request. Please retry or contact Support.");
  }
});
