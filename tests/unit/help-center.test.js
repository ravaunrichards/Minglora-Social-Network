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
