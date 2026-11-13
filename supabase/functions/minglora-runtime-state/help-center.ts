type JsonResponse = (status: number, body: Record<string, unknown>) => Response;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown) => uuidPattern.test(String(value || ""));
const asText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const safeSlug = (value: unknown) => asText(value, 120).toLowerCase()
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const uniqueIds = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.map(String).filter(isUuid))].slice(0, 30) : [];
const publishedSelect = "id,slug,question,excerpt,category_id,featured,published_at,updated_at,help_categories(name,slug)";

export async function handleHelpCenterAction(
  admin: any,
  action: string,
  input: Record<string, unknown>,
  json: JsonResponse
): Promise<Response | null> {
  const actorUserId = String(input.actorUserId || "");
  const getStaff = async () => {
    if (!isUuid(actorUserId)) return null;
    const { data, error } = await admin.from("minglora_platform_staff")
      .select("role,active,permissions,mfa_required").eq("user_id", actorUserId).maybeSingle();
    if (error || !data || data.active !== true) return null;
    const permissions = Array.isArray(data.permissions) ? data.permissions.map(String) : [];
    return {
      role: String(data.role || ""),
      permissions,
      canManage: permissions.includes("platform:admin") || permissions.includes("help:manage"),
      canReview: permissions.includes("platform:admin") || permissions.includes("help:manage") || permissions.includes("help:review"),
      canApprove: permissions.includes("platform:admin") || permissions.includes("help:approve"),
      canPublish: permissions.includes("platform:admin") || permissions.includes("help:publish")
    };
  };
  const requireStaff = async (permission: "manage" | "review" | "approve" | "publish" = "manage") => {
    const staff = await getStaff();
    const allowed = staff && (
      permission === "manage" ? staff.canManage :
      permission === "review" ? staff.canReview :
      permission === "approve" ? staff.canApprove :
      staff.canPublish
    );
    return allowed ? staff : null;
  };
  const staffError = () => json(403, { error: "Authorized Help Center editor access is required." });

  if (action === "help_access") {
    const staff = await getStaff();
    return json(200, {
      canManage: Boolean(staff?.canManage),
      canReview: Boolean(staff?.canReview),
      canApprove: Boolean(staff?.canApprove),
      canPublish: Boolean(staff?.canPublish)
    });
  }

  if (action === "help_categories_list") {
    const { data, error } = await admin.from("help_categories")
      .select("id,slug,name,description,icon_key,sort_order,help_subcategories(id,slug,name,kind,sort_order,active)")
      .eq("active", true).order("sort_order", { ascending: true });
    if (error) return json(503, { error: "Help Center categories are unavailable." });
    const categories = (data || []).map((category: any) => ({
      ...category,
      subcategories: (category.help_subcategories || [])
        .filter((item: any) => item.active !== false)
        .sort((a: any, b: any) => Number(a.sort_order) - Number(b.sort_order))
    }));
    return json(200, { categories });
  }

  if (action === "help_articles_list" || action === "help_popular" || action === "help_featured" || action === "help_recently_updated") {
    const limit = Math.max(1, Math.min(60, Math.floor(Number(input.limit || 12))));
    const page = Math.max(1, Math.floor(Number(input.page || 1)));
    const query = asText(input.query, 120);
    const categorySlug = asText(input.categorySlug, 120);
    const subcategorySlug = asText(input.subcategorySlug, 140);
    const ids: string[] = [];
    let matchedCatalogQuery = false;
    if (categorySlug) {
      const { data: category } = await admin.from("help_categories").select("id").eq("slug", categorySlug).maybeSingle();
      if (!category?.id) return json(200, { articles: [], total: 0 });
      ids.push(String(category.id));
    } else if (query) {
      const pattern = "%" + query.replace(/[\\%_]/g, "\\    const ids: string[] = [];
    if (categorySlug) {
      const { data: category } = await admin.from("help_categories").select("id").eq("slug", categorySlug).maybeSingle();
      if (!category?.id) return json(200, { articles: [], total: 0 });
      ids.push(String(category.id));
    }
    let subcategoryArticleIds: string[] = [];") + "%";
      const { data: categoryMatches } = await admin.from("help_categories").select("id").eq("active", true).ilike("name", pattern).limit(5);
      if (categoryMatches?.length) {
        for (const match of categoryMatches) ids.push(String(match.id));
        matchedCatalogQuery = true;
      }
    }
    let subcategoryArticleIds: string[] = [];
    if (query && !subcategorySlug) {
      const pattern = "%" + query.replace(/[\\%_]/g, "\\    const ids: string[] = [];
    if (categorySlug) {
      const { data: category } = await admin.from("help_categories").select("id").eq("slug", categorySlug).maybeSingle();
      if (!category?.id) return json(200, { articles: [], total: 0 });
      ids.push(String(category.id));
    }
    let subcategoryArticleIds: string[] = [];") + "%";
      const { data: subcategoryMatches } = await admin.from("help_subcategories").select("id").eq("active", true).ilike("name", pattern).limit(10);
      if (subcategoryMatches?.length) {
        const { data: matchedLinks } = await admin.from("help_article_subcategories").select("article_id").in("subcategory_id", subcategoryMatches.map((item: any) => item.id));
        subcategoryArticleIds = [...new Set((matchedLinks || []).map((item: any) => String(item.article_id)))];
        matchedCatalogQuery = true;
      }
    }
    if (subcategorySlug) {
      const { data: subcategory } = await admin.from("help_subcategories").select("id").eq("slug", subcategorySlug).eq("active", true).maybeSingle();
      if (!subcategory?.id) return json(200, { articles: [], total: 0 });
      const { data: links } = await admin.from("help_article_subcategories").select("article_id").eq("subcategory_id", subcategory.id);
      subcategoryArticleIds = [...new Set((links || []).map((item: any) => String(item.article_id)))];
      if (!subcategoryArticleIds.length) return json(200, { articles: [], total: 0 });
      matchedCatalogQuery = false;
    }
    const applyFilters = (queryBuilder: any) => {
      let result = queryBuilder.eq("status", "published");
      if (ids.length === 1) result = result.eq("category_id", ids[0]);
      else if (ids.length > 1) result = result.in("category_id", ids);
      if (subcategoryArticleIds.length) result = result.in("id", subcategoryArticleIds);
      if (query && !matchedCatalogQuery) result = result.textSearch("search_vector", query, { config: "english", type: "websearch" });
      return result;
    };

    if (action === "help_popular") {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: views, error: viewError } = await admin.from("help_article_views")
        .select("article_id").gte("viewed_at", since).limit(10000);
      if (viewError) return json(503, { error: "Help Center activity could not be loaded." });
      const counts = new Map<string, number>();
      for (const view of views || []) counts.set(String(view.article_id), (counts.get(String(view.article_id)) || 0) + 1);
      const rankedIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
      if (!rankedIds.length) return json(200, { articles: [], total: 0 });
      const { data, error } = await admin.from("help_articles").select(publishedSelect)
        .eq("status", "published").in("id", rankedIds);
      if (error) return json(503, { error: "Popular Help Center articles are unavailable." });
      const byId = new Map((data || []).map((article: any) => [String(article.id), article]));
      const articles = rankedIds.map(id => byId.get(id)).filter(Boolean)
        .map((article: any) => ({ ...article, realViews90d: counts.get(String(article.id)) || 0 }));
      return json(200, { articles, total: articles.length });
    }

    let queryBuilder = applyFilters(admin.from("help_articles").select(publishedSelect, { count: "exact" }));
    if (action === "help_featured") queryBuilder = queryBuilder.eq("featured", true);
    const order = action === "help_recently_updated" || input.sort === "updated"
      ? "updated_at" : input.sort === "alphabetical" ? "question" : "published_at";
    queryBuilder = queryBuilder.order(order, { ascending: input.sort === "alphabetical" }).range((page - 1) * limit, page * limit - 1);
    const { data, error, count } = await queryBuilder;
    if (error) return json(503, { error: "Help Center articles could not be loaded." });
    if (query && isUuid(actorUserId)) {
      await admin.from("help_search_events").insert({ user_id: actorUserId, search_query: query, results_count: Number(count || 0) });
    }
    return json(200, { articles: data || [], total: count || 0, page, limit });
  }

  if (action === "help_article_get") {
    const slug = safeSlug(input.slug);
    const { data: article, error } = await admin.from("help_articles")
      .select("id,slug,question,excerpt,answer_markdown,category_id,featured,published_at,updated_at,last_reviewed_at,review_due_at,help_categories(name,slug)")
      .eq("slug", slug).eq("status", "published").maybeSingle();
    if (error) return json(503, { error: "This Help Center article could not be loaded." });
    if (!article) return json(404, { error: "This published Help Center article was not found." });
    if (isUuid(actorUserId)) {
      await admin.from("help_article_views").upsert(
        { article_id: article.id, user_id: actorUserId },
        { onConflict: "article_id,user_id,view_day", ignoreDuplicates: true }
      );
    }
    const [links, relatedLinks, translations, assets, bookmark, feedback] = await Promise.all([
      admin.from("help_article_subcategories").select("help_subcategories(id,slug,name,kind)")
        .eq("article_id", article.id),
      admin.from("help_related_articles").select("related_article_id,sort_order")
        .eq("article_id", article.id).order("sort_order", { ascending: true }),
      admin.from("help_article_translations").select("locale,question,excerpt,answer_markdown,status,published_at")
        .eq("article_id", article.id).eq("status", "published"),
      admin.from("help_article_assets").select("id,asset_type,storage_bucket,storage_path,alt_text,caption,sort_order")
        .eq("article_id", article.id).order("sort_order", { ascending: true }),
      isUuid(actorUserId) ? admin.from("help_article_bookmarks").select("article_id")
        .eq("article_id", article.id).eq("user_id", actorUserId).maybeSingle() : Promise.resolve({ data: null }),
      isUuid(actorUserId) ? admin.from("help_article_feedback").select("helpful")
        .eq("article_id", article.id).eq("user_id", actorUserId).maybeSingle() : Promise.resolve({ data: null })
    ]);
    const relatedIds = (relatedLinks.data || []).map((item: any) => String(item.related_article_id));
    let related: any[] = [];
    if (relatedIds.length) {
      const { data } = await admin.from("help_articles").select(publishedSelect)
        .eq("status", "published").in("id", relatedIds);
      const byId = new Map((data || []).map((item: any) => [String(item.id), item]));
      related = (relatedLinks.data || []).map((item: any) => byId.get(String(item.related_article_id))).filter(Boolean);
    }
    const signedAssets = await Promise.all((assets.data || []).map(async (asset: any) => {
      const signed = await admin.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 3600);
      return { ...asset, url: signed.error ? null : signed.data?.signedUrl || null };
    }));
    return json(200, {
      article,
      subcategories: (links.data || []).map((item: any) => item.help_subcategories).filter(Boolean),
      related,
      translations: translations.data || [],
      assets: signedAssets.filter((asset: any) => Boolean(asset.url)), 
      bookmarked: Boolean(bookmark.data),
      myFeedback: feedback.data?.helpful ?? null
    });
  }

  if (action === "help_article_feedback") {
    const articleId = String(input.articleId || "");
    if (!isUuid(articleId) || !isUuid(actorUserId) || typeof input.helpful !== "boolean") {
      return json(400, { error: "Choose whether this published answer was helpful." });
    }
    const { data: article } = await admin.from("help_articles").select("id").eq("id", articleId).eq("status", "published").maybeSingle();
    if (!article) return json(404, { error: "This published answer was not found." });
    const { error } = await admin.from("help_article_feedback").upsert({
      article_id: articleId, user_id: actorUserId, helpful: input.helpful,
      reason: asText(input.reason, 600), updated_at: new Date().toISOString()
    }, { onConflict: "article_id,user_id" });
    if (error) return json(503, { error: "Your feedback could not be saved." });
    const [yes, no] = await Promise.all([
      admin.from("help_article_feedback").select("id", { count: "exact", head: true }).eq("article_id", articleId).eq("helpful", true),
      admin.from("help_article_feedback").select("id", { count: "exact", head: true }).eq("article_id", articleId).eq("helpful", false)
    ]);
    return json(200, { saved: true, helpfulCount: yes.count || 0, notHelpfulCount: no.count || 0 });
  }

  if (action === "help_bookmarks_list") {
    if (!isUuid(actorUserId)) return json(401, { error: "Sign in to view saved Help Center answers." });
    const { data: links, error } = await admin.from("help_article_bookmarks")
      .select("article_id,created_at").eq("user_id", actorUserId).order("created_at", { ascending: false }).limit(100);
    if (error || !links?.length) return json(200, { articles: [] });
    const ids = links.map((item: any) => String(item.article_id));
    const { data } = await admin.from("help_articles").select(publishedSelect).eq("status", "published").in("id", ids);
    const byId = new Map((data || []).map((item: any) => [String(item.id), item]));
    return json(200, { articles: ids.map(id => byId.get(id)).filter(Boolean) });
  }

  if (action === "help_bookmark_set") {
    const articleId = String(input.articleId || "");
    if (!isUuid(articleId) || !isUuid(actorUserId)) return json(400, { error: "Sign in to save this answer." });
    if (input.saved === true) {
      const { data: article } = await admin.from("help_articles").select("id").eq("id", articleId).eq("status", "published").maybeSingle();
      if (!article) return json(404, { error: "This published answer was not found." });
      const { error } = await admin.from("help_article_bookmarks").upsert({ article_id: articleId, user_id: actorUserId }, { onConflict: "article_id,user_id", ignoreDuplicates: true });
      if (error) return json(503, { error: "This answer could not be saved." });
      return json(200, { saved: true });
    }
    const { error } = await admin.from("help_article_bookmarks").delete().eq("article_id", articleId).eq("user_id", actorUserId);
    if (error) return json(503, { error: "This saved answer could not be removed." });
    return json(200, { saved: false });
  }

  if (action === "help_recent_list") {
    if (!isUuid(actorUserId)) return json(401, { error: "Sign in to view recently opened answers." });
    const { data: views } = await admin.from("help_article_views").select("article_id,viewed_at")
      .eq("user_id", actorUserId).order("viewed_at", { ascending: false }).limit(100);
    const ids = [...new Set((views || []).map((item: any) => String(item.article_id)))].slice(0, 20);
    if (!ids.length) return json(200, { articles: [] });
    const { data } = await admin.from("help_articles").select(publishedSelect).eq("status", "published").in("id", ids);
    const byId = new Map((data || []).map((item: any) => [String(item.id), item]));
    return json(200, { articles: ids.map(id => byId.get(id)).filter(Boolean) });
  }

  if (action.startsWith("help_admin_")) {
    const staff = await requireStaff(action === "help_admin_article_workflow" && input.status === "published" ? "publish" :
      action === "help_admin_article_workflow" && input.status === "approval" ? "approve" :
      action === "help_admin_article_workflow" && ["review","fact_check"].includes(String(input.status)) ? "review" : "manage");
    if (!staff) return staffError();

    if (action === "help_admin_article_list") {
      const status = asText(input.status, 20);
      let query = admin.from("help_articles").select("id,slug,question,excerpt,category_id,status,featured,author_id,reviewer_id,approver_id,publisher_id,published_at,updated_at,help_categories(name,slug),help_article_subcategories(subcategory_id)", { count: "exact" })
        .order("updated_at", { ascending: false }).range(0, 199);
      if (status && status !== "all") query = query.eq("status", status);
      const { data, error, count } = await query;
      if (error) return json(503, { error: "Help Center drafts could not be loaded." });
      return json(200, { articles: data || [], total: count || 0 });
    }

    if (action === "help_admin_article_create") {
      const question = asText(input.question, 180);
      const slug = safeSlug(input.slug || question);
      const categoryId = String(input.categoryId || "");
      if (question.length < 8 || !slug || !isUuid(categoryId)) return json(400, { error: "Add a question and choose a category." });
      const { data: existing } = await admin.from("help_articles").select("id").ilike("question", question).limit(1);
      if (existing?.length) return json(409, { error: "A matching question already exists. Open the existing article instead of creating a duplicate." });
      const draft = {
        slug, category_id: categoryId, question, excerpt: asText(input.excerpt, 360),
        answer_markdown: asText(input.answerMarkdown, 30000), status: "draft",
        featured: false, source_reference: asText(input.sourceReference, 300),
        locale: "en", author_id: actorUserId
      };
      const { data: article, error } = await admin.from("help_articles").insert(draft).select("*").single();
      if (error) return json(409, { error: "The draft could not be created. Check for a duplicate question or category." });
      const subcategoryIds = uniqueIds(input.subcategoryIds);
      const { error: linkError } = await admin.rpc("help_replace_article_subcategories", {
        p_article_id: article.id, p_subcategory_ids: subcategoryIds
      });
      if (linkError) return json(409, { error: "The draft exists, but its topic links could not be saved. Edit the draft to finish organizing it." });
      const snapshot = { slug: article.slug, category_id: article.category_id, question: article.question, excerpt: article.excerpt, answer_markdown: article.answer_markdown, status: article.status, featured: article.featured, source_reference: article.source_reference, subcategory_ids: subcategoryIds };
      const { error: revisionError } = await admin.from("help_article_revisions").insert({ article_id: article.id, revision_no: 1, content_snapshot: snapshot, changed_by: actorUserId, revision_note: "Initial draft" });
      if (revisionError) return json(503, { error: "The draft was created, but its first revision could not be secured." });
      return json(201, { article });
    }

    if (action === "help_admin_article_update") {
      const articleId = String(input.articleId || "");
      if (!isUuid(articleId)) return json(400, { error: "Choose an article to edit." });
      const { data: current, error: currentError } = await admin.from("help_articles").select("*").eq("id", articleId).maybeSingle();
      if (currentError || !current) return json(404, { error: "The Help Center article was not found." });
      const question = asText(input.question, 180);
      const slug = safeSlug(input.slug || question);
      const categoryId = String(input.categoryId || "");
      if (question.length < 8 || !slug || !isUuid(categoryId)) return json(400, { error: "Add a valid question and category." });
      const { data: duplicate } = await admin.from("help_articles").select("id").ilike("question", question).neq("id", articleId).limit(1);
      if (duplicate?.length) return json(409, { error: "A matching question already exists. Merge or update the existing article to avoid duplication." });
      const { data: latest } = await admin.from("help_article_revisions").select("revision_no")
        .eq("article_id", articleId).order("revision_no", { ascending: false }).limit(1).maybeSingle();
      const { data: currentTopicLinks } = await admin.from("help_article_subcategories").select("subcategory_id").eq("article_id", articleId);
      const snapshot = { slug: current.slug, category_id: current.category_id, question: current.question, excerpt: current.excerpt, answer_markdown: current.answer_markdown, status: current.status, featured: current.featured, source_reference: current.source_reference, subcategory_ids: (currentTopicLinks || []).map((item: any) => String(item.subcategory_id)) };
      const { error: revisionError } = await admin.from("help_article_revisions").insert({
        article_id: articleId, revision_no: Number(latest?.revision_no || 0) + 1,
        content_snapshot: snapshot, changed_by: actorUserId, revision_note: asText(input.revisionNote, 300)
      });
      if (revisionError) return json(503, { error: "A revision snapshot could not be secured; the article was not changed." });
      const patch: Record<string, unknown> = {
        slug, question, category_id: categoryId, excerpt: asText(input.excerpt, 360),
        answer_markdown: asText(input.answerMarkdown, 30000), source_reference: asText(input.sourceReference, 300),
        featured: input.featured === true, updated_at: new Date().toISOString()
      };
      // Editing a published answer sends it back through review; changes never bypass approval. 
      if (current.status === "published") {
        patch.status = "review";
        patch.published_at = null;
        patch.publisher_id = null;
      }
      const { data: article, error } = await admin.from("help_articles").update(patch).eq("id", articleId).select("*").single();
      if (error) return json(409, { error: "The article could not be updated. Its previous revision is preserved." });
      const subcategoryIds = uniqueIds(input.subcategoryIds);
      const { error: linkError } = await admin.rpc("help_replace_article_subcategories", {
        p_article_id: articleId, p_subcategory_ids: subcategoryIds
      });
      if (linkError) return json(409, { error: "The article was saved, but its topic mapping needs review. Its previous topic links remain preserved." });
      return json(200, { article });
    }

    if (action === "help_admin_article_workflow") {
      const articleId = String(input.articleId || "");
      const nextStatus = String(input.status || "");
      if (!isUuid(articleId)) return json(400, { error: "Choose an article." });
      const { data: current } = await admin.from("help_articles").select("*").eq("id", articleId).maybeSingle();
      if (!current) return json(404, { error: "The Help Center article was not found." });
      const transitions: Record<string, string[]> = {
        draft: ["review"], review: ["fact_check"], fact_check: ["approval"],
        approval: ["published"], published: ["review","unpublished","archived"],
        unpublished: ["draft","review"], archived: ["draft"]
      };
      if (!(transitions[String(current.status)] || []).includes(nextStatus)) return json(409, { error: "That publishing transition is not allowed." });
      if (nextStatus === "published" && (!String(current.answer_markdown || "").trim() || String(current.answer_markdown).trim().length < 30 || !String(current.question || "").trim())) {
        return json(409, { error: "A complete question and answer are required before publication." });
      }
      const { data: latest } = await admin.from("help_article_revisions").select("revision_no")
        .eq("article_id", articleId).order("revision_no", { ascending: false }).limit(1).maybeSingle();
      const { data: currentTopicLinks } = await admin.from("help_article_subcategories").select("subcategory_id").eq("article_id", articleId);
      const snapshot = { slug: current.slug, category_id: current.category_id, question: current.question, excerpt: current.excerpt, answer_markdown: current.answer_markdown, status: current.status, featured: current.featured, source_reference: current.source_reference, subcategory_ids: (currentTopicLinks || []).map((item: any) => String(item.subcategory_id)) };
      const { error: revisionError } = await admin.from("help_article_revisions").insert({
        article_id: articleId, revision_no: Number(latest?.revision_no || 0) + 1,
        content_snapshot: snapshot, changed_by: actorUserId,
        revision_note: asText(input.revisionNote, 300) || ("Status changed to " + nextStatus)
      });
      if (revisionError) return json(503, { error: "A revision snapshot could not be secured; the status was not changed." });
      const patch: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString() };
      if (nextStatus === "review" || nextStatus === "fact_check") patch.reviewer_id = actorUserId;
      if (nextStatus === "approval") patch.approver_id = actorUserId;
      if (nextStatus === "published") {
        patch.publisher_id = actorUserId; patch.published_at = new Date().toISOString();
        patch.last_reviewed_at = new Date().toISOString();
        patch.review_due_at = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
      }
      const { data: article, error } = await admin.from("help_articles").update(patch).eq("id", articleId).select("*").single();
      if (error) return json(503, { error: "The article workflow could not be updated." });
      return json(200, { article });
    }

    if (action === "help_admin_revision_list") {
      const articleId = String(input.articleId || "");
      if (!isUuid(articleId)) return json(400, { error: "Choose an article." });
      const { data, error } = await admin.from("help_article_revisions").select("id,revision_no,changed_by,revision_note,created_at")
        .eq("article_id", articleId).order("revision_no", { ascending: false }).limit(50);
      if (error) return json(503, { error: "Revision history is unavailable." });
      return json(200, { revisions: data || [] });
    }

    if (action === "help_admin_revision_restore") {
      const articleId = String(input.articleId || "");
      const revisionId = String(input.revisionId || "");
      if (!isUuid(articleId) || !isUuid(revisionId)) return json(400, { error: "Choose an article revision." });
      const { data: revision } = await admin.from("help_article_revisions").select("content_snapshot")
        .eq("article_id", articleId).eq("id", revisionId).maybeSingle();
      const { data: current } = await admin.from("help_articles").select("*").eq("id", articleId).maybeSingle();
      if (!revision || !current) return json(404, { error: "The requested article revision was not found." });
      const { data: latest } = await admin.from("help_article_revisions").select("revision_no").eq("article_id", articleId)
        .order("revision_no", { ascending: false }).limit(1).maybeSingle();
      const snapshot = { slug: current.slug, category_id: current.category_id, question: current.question, excerpt: current.excerpt, answer_markdown: current.answer_markdown, status: current.status, featured: current.featured, source_reference: current.source_reference };
      const { error: saveError } = await admin.from("help_article_revisions").insert({
        article_id: articleId, revision_no: Number(latest?.revision_no || 0) + 1,
        content_snapshot: snapshot, changed_by: actorUserId, revision_note: "Saved before restoring an earlier revision"
      });
      if (saveError) return json(503, { error: "The current article revision could not be secured." });
      const restore = revision.content_snapshot || {};
      const { data: article, error } = await admin.from("help_articles").update({
        slug: safeSlug(restore.slug), category_id: restore.category_id, question: asText(restore.question, 180),
        excerpt: asText(restore.excerpt, 360), answer_markdown: asText(restore.answer_markdown, 30000),
        source_reference: asText(restore.source_reference, 300), featured: restore.featured === true,
        status: "draft", published_at: null, approver_id: null, publisher_id: null, updated_at: new Date().toISOString()
      }).eq("id", articleId).select("*").single();
      if (error) return json(409, { error: "The earlier content could not be restored." });
      const { error: topicsError } = await admin.rpc("help_replace_article_subcategories", {
        p_article_id: articleId, p_subcategory_ids: uniqueIds(restore.subcategory_ids)
      });
      if (topicsError) return json(409, { error: "The article content was restored as a draft, but its topic mapping needs review." });
      return json(200, { article, restoredAs: "draft" });
    }

    if (action === "help_admin_feedback") {
      const { data, error } = await admin.from("help_article_feedback")
        .select("id,article_id,user_id,helpful,reason,created_at,updated_at,help_articles(question,slug)")
        .order("updated_at", { ascending: false }).limit(250);
      if (error) return json(503, { error: "Member Help Center feedback could not be loaded." });
      return json(200, { feedback: data || [] });
    }

    if (action === "help_admin_unanswered") {
      const { data, error } = await admin.from("help_articles")
        .select("id,slug,question,status,updated_at,help_categories(name,slug)")
        .or("answer_markdown.is.null,answer_markdown.eq.")
        .order("updated_at", { ascending: false }).limit(200);
      if (error) return json(503, { error: "Unanswered Help Center entries could not be loaded." });
      return json(200, { articles: data || [] });
    }

    if (action === "help_admin_category_update") {
      const id = String(input.id || "");
      const slug = safeSlug(input.slug || input.name);
      const name = asText(input.name, 100);
      if (!isUuid(id) && (!slug || name.length < 2)) return json(400, { error: "Add a category name." });
      const patch = {
        name, slug, description: asText(input.description, 300), icon_key: asText(input.iconKey, 50) || "help-circle",
        sort_order: Math.max(0, Math.min(999, Math.floor(Number(input.sortOrder) || 0))),
        active: input.active !== false, updated_at: new Date().toISOString()
      };
      const result = isUuid(id)
        ? await admin.from("help_categories").update(patch).eq("id", id).select("*").single()
        : await admin.from("help_categories").insert(patch).select("*").single();
      if (result.error) return json(409, { error: "The category could not be saved." });
      return json(200, { category: result.data });
    }

    if (action === "help_admin_subcategory_update") {
      const id = String(input.id || "");
      const categoryId = String(input.categoryId || "");
      const name = asText(input.name, 120);
      const slug = safeSlug(input.slug || name);
      if (!isUuid(categoryId) || !name || !slug) return json(400, { error: "Add a topic name and choose its main category." });
      const patch = {
        category_id: categoryId, name, slug, kind: input.kind === "master_group" ? "master_group" : "topic",
        active: input.active !== false, sort_order: Math.max(0, Math.min(999, Math.floor(Number(input.sortOrder) || 0))),
        updated_at: new Date().toISOString()
      };
      const result = isUuid(id)
        ? await admin.from("help_subcategories").update(patch).eq("id", id).select("*").single()
        : await admin.from("help_subcategories").insert(patch).select("*").single();
      if (result.error) return json(409, { error: "The Help Center topic could not be saved." });
      return json(200, { subcategory: result.data });
    }

    if (action === "help_admin_asset_sign") {
      const articleId = String(input.articleId || "");
      const assetType = String(input.assetType || "");
      const contentType = asText(input.contentType, 100).toLowerCase();
      const mimeExtensions: Record<string,string> = {
        "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif",
        "video/mp4":"mp4","video/webm":"webm"
      };
      if (!isUuid(articleId) || !["image","video"].includes(assetType) || !mimeExtensions[contentType] ||
          (assetType === "image" && !contentType.startsWith("image/")) ||
          (assetType === "video" && !contentType.startsWith("video/"))) {
        return json(400, { error: "Choose a supported instructional image or video." });
      }
      const { data: article } = await admin.from("help_articles").select("id").eq("id",articleId).maybeSingle();
      if (!article) return json(404, { error: "The Help Center article was not found." });
      const storagePath = articleId + "/" + crypto.randomUUID() + "." + mimeExtensions[contentType];
      const { data, error } = await admin.storage.from("minglora-help-center").createSignedUploadUrl(storagePath);
      if (error || !data?.signedUrl) return json(503, { error: "A secure upload link could not be created." });
      return json(200, { bucket:"minglora-help-center", path:storagePath, signedUrl:data.signedUrl, token:data.token, contentType });
    }

    if (action === "help_admin_asset_record") {
      const articleId = String(input.articleId || "");
      const storagePath = asText(input.storagePath, 300);
      const assetType = String(input.assetType || "");
      const fileName = storagePath.split("/").pop() || "";
      if (!isUuid(articleId) || !["image","video"].includes(assetType) ||
          !storagePath.startsWith(articleId + "/") || storagePath.includes("..") ||
          !/^[0-9a-f-]+\\.(jpg|png|webp|avif|mp4|webm)$/i.test(fileName)) {
        return json(400, { error: "The uploaded Help Center media reference is invalid." });
      }
      const { data: article } = await admin.from("help_articles").select("id").eq("id",articleId).maybeSingle();
      if (!article) return json(404, { error: "The Help Center article was not found." });
      const { data: files, error: fileError } = await admin.storage.from("minglora-help-center").list(articleId,{search:fileName,limit:10});
      if (fileError || !(files || []).some((file:any)=>file.name===fileName)) return json(409, { error: "The uploaded file could not be verified in private storage." });
      const { data, error } = await admin.from("help_article_assets").insert({
        article_id:articleId,asset_type:assetType,storage_bucket:"minglora-help-center",storage_path:storagePath,
        alt_text:asText(input.altText,200),caption:asText(input.caption,300),sort_order:Math.max(0,Math.min(999,Number(input.sortOrder)||0))
      }).select("*").single();
      if (error) return json(409, { error: "The media file exists, but its article attachment could not be saved." });
      return json(201,{asset:data});
    }

    if (action === "help_admin_asset_delete") {
      const assetId = String(input.assetId || "");
      if (!isUuid(assetId)) return json(400,{error:"Choose an instructional image or video."});
      const { data: asset } = await admin.from("help_article_assets").select("*").eq("id",assetId).maybeSingle();
      if (!asset) return json(404,{error:"The Help Center media attachment was not found."});
      const { error: storageError } = await admin.storage.from(asset.storage_bucket).remove([asset.storage_path]);
      if (storageError) return json(503,{error:"The private storage file could not be removed; its article record was preserved."});
      const { error } = await admin.from("help_article_assets").delete().eq("id",assetId);
      if (error) return json(503,{error:"The file was removed from storage, but its metadata requires administrator repair."});
      return json(200,{deleted:true});
    }

    if (action === "help_admin_translation_update") {
      const articleId = String(input.articleId || "");
      const locale = asText(input.locale, 20);
      const question = asText(input.question, 180);
      if (!isUuid(articleId) || locale.length < 2 || !question) return json(400, { error: "Add a language code and translated question." });
      const patch = {
        article_id: articleId, locale, question, excerpt: asText(input.excerpt, 360),
        answer_markdown: asText(input.answerMarkdown, 30000), status: "draft", translator_id: actorUserId,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await admin.from("help_article_translations")
        .upsert(patch, { onConflict: "article_id,locale" }).select("*").single();
      if (error) return json(409, { error: "The translation draft could not be saved." });
      return json(200, { translation: data });
    }
  }

  return null;
}
