import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("Help Center is a standalone responsive page",()=>{
const html=read("public/help-center.html"),css=read("public/help-center.css"),js=read("public/help-center.js");
assert.match(html,/How can we help you\?/);assert.match(html,/hc-search-input/);assert.match(html,/hc-categories/);assert.match(html,/hc-article/);assert.match(html,/Browse by feature/);assert.match(html,/hc-feature-topics/);
assert.match(css,/@media\(max-width:560px\)/);assert.match(js,/\/api\/help-center\/bootstrap/);assert.match(js,/\/api\/help-center\/search/);assert.match(js,/\/api\/help-center\/articles\//);assert.match(js,/function markdown/);assert.match(js,/function applyMemberTheme/);assert.match(js,/function highlight/);assert.match(js,/relatedArticleIds/);assert.match(js,/hc-preview-answer/);assert.match(js,/renderFeatureTopics/);const topicsBlock=js.match(/const FEATURE_TOPICS=(\[[\s\S]*?\]);/);assert.ok(topicsBlock);assert.equal(JSON.parse(topicsBlock[1]).length,30);
});
test("Help Center reuses existing support-ticket flows",()=>{
const s=read("public/settings.js"),a=read("public/app.js"),m=read("public/minglora-menu.js"),server=read("src/server.js");
assert.match(s,/window\.location\.assign\('\/help-center\.html'\)/);assert.match(s,/openSupport/);assert.match(a,/mingloraSupport/);assert.match(m,/destination==='help-center'/);assert.match(server,/\/api\/support\/tickets/);assert.match(server,/helpCenterGateway/);
});
test("No sample articles or fabricated member statistics are embedded",()=>{
const js=read("public/help-center.js");assert.doesNotMatch(js,/Sample question|Demo question|fake views|1,234 views/i);assert.match(js,/No verified Q&A articles have been published yet/);assert.match(js,/hc-media-figure/);
});
test("Editorial workflow buttons mirror the staged publishing lifecycle",()=>{
const js=read("public/help-center.js");for(const stage of ["submit_review","complete_fact_check","approve","publish","archive","restore"])assert.ok(js.includes(stage));
});

test("The deployed Help Center Edge Function is version-controlled and guarded",()=>{
const edge=read("supabase/functions/minglora-help-center/index.ts");
const server=read("src/server.js");
assert.match(edge,/Deno\.serve/);
assert.match(edge,/x-minglora-api-key/);
assert.match(edge,/requireStaff/);
assert.match(edge,/view_history/);
assert.match(edge,/admin_article_get/);
assert.match(edge,/help_related_articles/);
assert.match(edge,/mfa_required/);
assert.match(edge,/mfaVerified===true/);
assert.match(edge,/help_center:approve/);
assert.match(edge,/help_center:publish/);assert.match(edge,/recentlyAdded/);
assert.match(server,/mfaVerified:activeHelpSession\?\.mfaVerified===true/);
});

test("search indexes article content, keywords, and canonical category and subcategory names",()=>{
const migration=read("supabase/migrations/20261113222317_minglora_help_center_taxonomy_search.sql");
assert.match(migration,/t\.search_document@@websearch_to_tsquery/);
assert.match(migration,/help_keywords/);
assert.match(migration,/ct\.title ilike/);
assert.match(migration,/st\.title ilike/);
assert.match(migration,/greatest\(1,least\(coalesce\(p_limit,20\),50\)\)/);
});

test("Help Center member data excludes anonymous Supabase sessions",()=>{
const edge=read("supabase/functions/minglora-help-center/index.ts");
const migration=read("supabase/migrations/20261113223111_minglora_help_center_permanent_members_only.sql");
assert.match(edge,/requirePermanentMember/);
assert.match(edge,/is_anonymous/);
assert.match(migration,/as restrictive/);
assert.match(migration,/auth\.jwt\(\)->>'is_anonymous'/);
});

test("Help Center administrators can edit, move, rename, and reorder existing subcategories",()=>{
const js=read("public/help-center.js"),edge=read("supabase/functions/minglora-help-center/index.ts");
assert.match(js,/data-hc-sub-edit/);
assert.match(js,/name="subcategoryId"/);
assert.match(js,/f\.elements\.subcategoryId\.value=x\.id/);
assert.match(js,/f\.elements\.categoryId\.value=x\.categoryId/);
assert.match(js,/f\.elements\.sortOrder\.value=Number\(x\.sortOrder\|\|0\)/);
assert.match(js,/hc-sub-reset/);
assert.match(edge,/const id=requiredText\(input\.subcategoryId,64\)/);
assert.match(edge,/help_subcategories"\)\.update/);
});

test("Help Center admin coverage counts published articles once and flags unanswered subcategories",()=>{
const edge=read("supabase/functions/minglora-help-center/index.ts"),js=read("public/help-center.js");
assert.match(edge,/const publishedArticleIds=new Set<string>\(\)/);
assert.match(edge,/row\.status!==\"published\"/);
assert.match(edge,/publishedArticleIds\.has\(row\.article_id\)/);
assert.match(edge,/publishedArticleCount:/);
assert.match(edge,/unansweredSubcategories:/);
assert.match(js,/publishedArticleCount/);
assert.match(js,/subcategories do not yet have a published answer/);
});

test("Help Center instructional media upload is restricted and validated",()=>{
const edge=read("supabase/functions/minglora-help-center/index.ts");
const server=read("src/server.js");
const migration=read("supabase/migrations/20261114000100_minglora_help_center_media_storage.sql");
const js=read("public/help-center.js");
assert.match(edge,/action==="admin_media_upload"/);
assert.match(edge,/managementActions\.add\("admin_media_upload"|admin_media_upload/);
assert.match(edge,/help-center-media/);
assert.match(edge,/bytes\.length>5\*1024\*1024/);
assert.match(edge,/isJpeg|isPng|isWebp|isAvif/);
assert.match(server,/\/api\/help-center\/admin\/media/);
assert.match(server,/help-center\/admin\/media'\?8_000_000/);
assert.match(migration,/file_size_limit/);
assert.match(migration,/image\/jpeg/);
assert.match(js,/accept="image\/jpeg,image\/png,image\/webp,image\/avif"/);
assert.match(js,/Watch video demonstration/);assert.match(js,/url\.protocol!=="https:"/);
});

test("Help Center article keywords, ordering, translations, unpublishing and review coverage are managed",()=>{
const edge=read("supabase/functions/minglora-help-center/index.ts");
const js=read("public/help-center.js");
const html=read("public/help-center.html");
const orderMigration=read("supabase/migrations/20261114000200_minglora_help_center_article_order.sql");
assert.match(edge,/from\("help_keywords"\)\.delete\(\)/);
assert.match(edge,/from\("help_keywords"\)\.insert/);
assert.match(edge,/sort_order:Math\.trunc\(Number\(input\.sortOrder\)/);
assert.match(edge,/unpublish:"approved"/);
assert.match(edge,/transition==="unpublish"/);
assert.match(js,/createAdminTranslation/);
assert.match(js,/\["unpublish","Unpublish"\]/);
assert.match(js,/renderAdminQuality/);
assert.match(html,/Content quality &amp; translations|Content quality & translations/);
assert.match(orderMigration,/case when qi\.q is null then a\.sort_order/);
});

test("Help Center duplicate merge keeps history and is limited to authorized editors",()=>{
const edge=read("supabase/functions/minglora-help-center/index.ts");
const server=read("src/server.js");
const js=read("public/help-center.js");
const migration=read("supabase/migrations/20261114000300_minglora_help_center_safe_article_merge.sql");
assert.match(edge,/admin_merge_articles/);
assert.match(edge,/admin\.rpc\("help_center_merge_articles"/);
assert.match(edge,/admin_merge_articles/);
assert.match(server,/\/api\/help-center\/admin\/merge/);
assert.match(js,/Merge duplicate questions/);
assert.match(js,/Merge duplicate safely/);
assert.match(js,/This operation cannot be automatically undone/);
assert.match(migration,/set article_id = p_target_article_id/);
assert.match(migration,/update public\.help_articles[\s\S]*is_active = false/);
assert.doesNotMatch(migration,/delete from public\.help_articles/i);
assert.match(migration,/revoke all on function public\.help_center_merge_articles/);
assert.match(migration,/to service_role/);
});

test("Help Center image and HTTPS video Markdown insertions keep actual line breaks",()=>{
const js=read("public/help-center.js");
assert.ok(js.includes("form.elements.answerMarkdown.value=form.elements.answerMarkdown.value.trimEnd()+\"\\n\\n[Watch video demonstration]("));
assert.ok(js.includes("form.elements.answerMarkdown.value=form.elements.answerMarkdown.value.trimEnd()+\"\\n\\n!["));
assert.match(js,/if\(url\.protocol!=="https:"\)/);
});
