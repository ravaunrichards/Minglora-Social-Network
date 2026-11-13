import test from "node:test";
import assert from "node:assert/strict";
import taxonomy from "../../data/help-center-taxonomy.json" with { type: "json" };
import { handleHelpCenterRoute } from "../../src/domain/help-center-routes.js";

const member = { id: "5b998c21-86b5-4621-ab37-e0808a2657b1", role: "member" };
const base = (overrides = {}) => ({
  method: "GET",
  path: "/api/help/categories",
  url: new URL("http://localhost/api/help/categories"),
  input: {},
  user: member,
  req: {},
  requestSupabaseState: async () => ({ ok: true }),
  isSupabasePersistence: () => false,
  isModerator: () => false,
  hasActiveReviewerSession: () => false,
  ...overrides
});

test("Help Center taxonomy retains both requested category systems without duplicates", () => {
  assert.equal(taxonomy.primaryCategories.length, 22);
  const masterGroups = taxonomy.subcategories.filter(item => item.kind === "master_group");
  assert.equal(masterGroups.length, 30);
  assert.equal(new Set(taxonomy.primaryCategories.map(item => item.slug)).size, 22);
  assert.equal(new Set(taxonomy.subcategories.map(item => item.slug)).size, taxonomy.subcategories.length);
  for (const item of taxonomy.subcategories) {
    assert.ok(taxonomy.primaryCategories.some(category => category.slug === item.categorySlug), item.slug);
  }
});

test("category endpoint returns the full mapped taxonomy in local mode", async () => {
  const response = await handleHelpCenterRoute(base());
  assert.equal(response.status, 200);
  assert.equal(response.body.categories.length, 22);
  assert.equal(response.body.categories.flatMap(item => item.subcategories).filter(item => item.kind === "master_group").length, 30);
});

test("local Help Center never invents answers or popularity statistics", async () => {
  const articles = await handleHelpCenterRoute(base({ path:"/api/help/articles" }));
  const popular = await handleHelpCenterRoute(base({ path:"/api/help/popular" }));
  assert.deepEqual(articles.body.articles, []);
  assert.equal(articles.body.total, 0);
  assert.deepEqual(popular.body.articles, []);
  const article = await handleHelpCenterRoute(base({ path:"/api/help/articles/not-published" }));
  assert.equal(article.status, 404);
});

test("Help Center requires a signed-in member", async () => {
  const response = await handleHelpCenterRoute(base({ user:null }));
  assert.equal(response.status, 401);
});

test("Help Center administration rejects ordinary members", async () => {
  const response = await handleHelpCenterRoute(base({
    method:"GET", path:"/api/help/admin/articles",
    isModerator:() => false
  }));
  assert.equal(response.status, 403);
});

test("Help Center admin API delegates to the protected Supabase action after server checks", async () => {
  let captured = null;
  const response = await handleHelpCenterRoute(base({
    method:"GET", path:"/api/help/admin/articles",
    isSupabasePersistence:() => true,
    isModerator:() => true,
    hasActiveReviewerSession:() => true,
    requestSupabaseState:async (action, args) => { captured={action,args}; return {articles:[],total:0}; }
  }));
  assert.equal(response.status, 200);
  assert.equal(captured.action, "help_admin_article_list");
  assert.equal(captured.args.actorUserId, member.id);
});
