import taxonomy from "../../data/help-center-taxonomy.json" with { type: "json" };

const cleanId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
const asText = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const result = (status, body) => ({ status, body });
const localCategories = () => ({
  categories: taxonomy.primaryCategories.map(category => ({
    ...category, id: category.slug,
    subcategories: taxonomy.subcategories
      .filter(item => item.categorySlug === category.slug)
      .map(item => ({ ...item, id: item.slug }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  }))
});
const emptyArticles = () => ({ articles: [], total: 0, page: 1, limit: 20 });

export async function handleHelpCenterRoute({
  method, path, url, input = {}, user, req,
  requestSupabaseState, isSupabasePersistence, isModerator, hasActiveReviewerSession
}) {
  if (!path.startsWith("/api/help/")) return null;
  if (!user?.id) return result(401, { error: "Sign in to use the Minglora Help Center." });

  const actorUserId = String(user.id);
  const send = async (action, values = {}) => {
    if (!isSupabasePersistence()) return { ok: true, localMode: true };
    return requestSupabaseState(action, { actorUserId, ...values });
  };
  const adminAllowed = () => Boolean(isModerator(user, req) && hasActiveReviewerSession(user));
  const fail = error => result(Number(error?.status) || 503, { error: String(error?.message || "The Help Center request could not be completed.").slice(0, 240) });

  try {
    if (method === "GET" && path === "/api/help/access") {
      if (!isSupabasePersistence() || !adminAllowed()) return result(200, { canManage: false, canReview: false, canApprove: false, canPublish: false });
      return result(200, await send("help_access"));
    }

    if (method === "GET" && path === "/api/help/categories") {
      if (!isSupabasePersistence()) return result(200, localCategories());
      return result(200, await send("help_categories_list"));
    }

    if (method === "GET" && path === "/api/help/articles") {
      if (!isSupabasePersistence()) return result(200, emptyArticles());
      const action = url.searchParams.get("featured") === "true" ? "help_featured"
        : url.searchParams.get("recentlyUpdated") === "true" ? "help_recently_updated" : "help_articles_list";
      return result(200, await send(action, {
        query: asText(url.searchParams.get("q"), 120),
        categorySlug: asText(url.searchParams.get("category"), 120),
        subcategorySlug: asText(url.searchParams.get("subcategory"), 140),
        sort: asText(url.searchParams.get("sort"), 20),
        page: Math.max(1, Number(url.searchParams.get("page") || 1)),
        limit: Math.max(1, Math.min(60, Number(url.searchParams.get("limit") || 20)))
      }));
    }

    if (method === "GET" && /^\/api\/help\/(popular|featured|recently-updated)$/.test(path)) {
      const name = path.split("/").pop();
      if (!isSupabasePersistence()) return result(200, emptyArticles());
      const action = name === "popular" ? "help_popular" : name === "featured" ? "help_featured" : "help_recently_updated";
      return result(200, await send(action, { limit: Math.max(1, Math.min(20, Number(url.searchParams.get("limit") || 8))) }));
    }

    const articleMatch = path.match(/^\/api\/help\/articles\/([a-z0-9-]+)$/i);
    if (method === "GET" && articleMatch) {
      if (!isSupabasePersistence()) return result(404, { error: "No published Help Center answer is available yet." });
      return result(200, await send("help_article_get", { slug: articleMatch[1] }));
    }

    if (method === "GET" && path === "/api/help/bookmarks") {
      if (!isSupabasePersistence()) return result(200, { articles: [] });
      return result(200, await send("help_bookmarks_list"));
    }
    if (method === "GET" && path === "/api/help/recent") {
      if (!isSupabasePersistence()) return result(200, { articles: [] });
      return result(200, await send("help_recent_list"));
    }

    const feedbackMatch = path.match(/^\/api\/help\/articles\/([0-9a-f-]+)\/feedback$/i);
    if (method === "POST" && feedbackMatch) {
      if (!cleanId(feedbackMatch[1]) || typeof input.helpful !== "boolean") return result(400, { error: "Choose whether this answer was helpful." });
      if (!isSupabasePersistence()) return result(503, { error: "Help Center feedback is unavailable until the knowledge base is connected." });
      return result(200, await send("help_article_feedback", {
        articleId: feedbackMatch[1], helpful: input.helpful, reason: asText(input.reason, 600)
      }));
    }

    const bookmarkMatch = path.match(/^\/api\/help\/articles\/([0-9a-f-]+)\/bookmark$/i);
    if ((method === "POST" || method === "DELETE") && bookmarkMatch) {
      if (!cleanId(bookmarkMatch[1])) return result(400, { error: "Choose a valid answer to save." });
      if (!isSupabasePersistence()) return result(503, { error: "Saved answers are unavailable until the knowledge base is connected." });
      return result(200, await send("help_bookmark_set", { articleId: bookmarkMatch[1], saved: method === "POST" }));
    }

    if (path.startsWith("/api/help/admin/")) {
      if (!adminAllowed()) return result(403, { error: "Authorized Help Center administrator access is required." });
      if (!isSupabasePersistence()) return result(503, { error: "Help Center administration requires the connected Minglora knowledge base." });

      if (method === "GET" && path === "/api/help/admin/articles") {
        return result(200, await send("help_admin_article_list", { status: asText(url.searchParams.get("status"), 20) || "all" }));
      }
      if (method === "POST" && path === "/api/help/admin/articles") {
        return result(201, await send("help_admin_article_create", {
          question: asText(input.question, 180), slug: asText(input.slug, 120),
          categoryId: asText(input.categoryId, 40), subcategoryIds: Array.isArray(input.subcategoryIds) ? input.subcategoryIds : [],
          excerpt: asText(input.excerpt, 360), answerMarkdown: asText(input.answerMarkdown, 30000),
          sourceReference: asText(input.sourceReference, 300)
        }));
      }
      const adminArticleMatch = path.match(/^\/api\/help\/admin\/articles\/([0-9a-f-]+)$/i);
      if (method === "PATCH" && adminArticleMatch) {
        if (!cleanId(adminArticleMatch[1])) return result(400, { error: "Choose an article to edit." });
        return result(200, await send("help_admin_article_update", {
          articleId: adminArticleMatch[1], question: asText(input.question, 180), slug: asText(input.slug, 120),
          categoryId: asText(input.categoryId, 40), subcategoryIds: Array.isArray(input.subcategoryIds) ? input.subcategoryIds : [],
          excerpt: asText(input.excerpt, 360), answerMarkdown: asText(input.answerMarkdown, 30000),
          sourceReference: asText(input.sourceReference, 300), featured: input.featured === true,
          revisionNote: asText(input.revisionNote, 300)
        }));
      }
      const workflowMatch = path.match(/^\/api\/help\/admin\/articles\/([0-9a-f-]+)\/workflow$/i);
      if (method === "POST" && workflowMatch) {
        if (!cleanId(workflowMatch[1])) return result(400, { error: "Choose an article." });
        return result(200, await send("help_admin_article_workflow", {
          articleId: workflowMatch[1], status: asText(input.status, 20), revisionNote: asText(input.revisionNote, 300)
        }));
      }
      const revisionsMatch = path.match(/^\/api\/help\/admin\/articles\/([0-9a-f-]+)\/revisions$/i);
      if (method === "GET" && revisionsMatch) return result(200, await send("help_admin_revision_list", { articleId: revisionsMatch[1] }));
      const restoreMatch = path.match(/^\/api\/help\/admin\/articles\/([0-9a-f-]+)\/restore$/i);
      if (method === "POST" && restoreMatch) return result(200, await send("help_admin_revision_restore", { articleId: restoreMatch[1], revisionId: asText(input.revisionId, 40) }));
      if (method === "GET" && path === "/api/help/admin/feedback") return result(200, await send("help_admin_feedback"));
      if (method === "GET" && path === "/api/help/admin/unanswered") return result(200, await send("help_admin_unanswered"));
      if (method === "POST" && path === "/api/help/admin/categories") return result(200, await send("help_admin_category_update", input));
      const categoryMatch = path.match(/^\/api\/help\/admin\/categories\/([0-9a-f-]+)$/i);
      if (method === "PATCH" && categoryMatch) return result(200, await send("help_admin_category_update", { ...input, id: categoryMatch[1] }));
      if (method === "POST" && path === "/api/help/admin/subcategories") return result(200, await send("help_admin_subcategory_update", input));
      const subcategoryMatch = path.match(/^\/api\/help\/admin\/subcategories\/([0-9a-f-]+)$/i);
      if (method === "PATCH" && subcategoryMatch) return result(200, await send("help_admin_subcategory_update", { ...input, id: subcategoryMatch[1] }));
      const assetSignMatch = path.match(/^\\/api\\/help\\/admin\\/articles\\/([0-9a-f-]+)\\/assets\\/sign$/i);
      if (method === "POST" && assetSignMatch) return result(200, await send("help_admin_asset_sign", {
        articleId:assetSignMatch[1], assetType:asText(input.assetType,10), contentType:asText(input.contentType,100)
      }));
      const assetRecordMatch = path.match(/^\\/api\\/help\\/admin\\/articles\\/([0-9a-f-]+)\\/assets$/i);
      if (method === "POST" && assetRecordMatch) return result(201, await send("help_admin_asset_record", {
        articleId:assetRecordMatch[1], storagePath:asText(input.storagePath,300), assetType:asText(input.assetType,10),
        altText:asText(input.altText,200), caption:asText(input.caption,300), sortOrder:input.sortOrder
      }));
      const assetDeleteMatch = path.match(/^\\/api\\/help\\/admin\\/assets\\/([0-9a-f-]+)$/i);
      if (method === "DELETE" && assetDeleteMatch) return result(200, await send("help_admin_asset_delete", { assetId:assetDeleteMatch[1] }));
      if (method === "POST" && path === "/api/help/admin/translations") return result(200, await send("help_admin_translation_update", input));
    }
  } catch (error) {
    return fail(error);
  }
  return result(404, { error: "This Help Center route was not found." });
}
