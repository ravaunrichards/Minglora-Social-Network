import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('public/help-center.html');
const ui = read('public/help-center.js');
const css = read('public/help-center.css');
const server = read('src/server.js');
const client = read('src/help-center-client.js');
const edge = read('supabase/functions/minglora-help-center/index.ts');
const schema = read('supabase/migrations/20261113200537_minglora_help_center_knowledge_base.sql');
const reporting = read('supabase/migrations/20261113201156_minglora_help_center_reporting_and_fk_indexes.sql');
const menu = read('public/minglora-menu.js');
const settings = read('public/settings.js');

test('Help Center page and browser script are valid standalone JavaScript/HTML assets', () => {
  assert.doesNotThrow(() => new vm.Script(ui, { filename: 'public/help-center.js' }));
  assert.doesNotThrow(() => new vm.Script(client.replace(/^export /gm, ''), { filename: 'src/help-center-client.js' }));
  assert.match(page, /id="hc-title"/);
  assert.match(page, /id="hc-search-form"/);
  assert.match(page, /id="hc-category-grid"/);
  assert.match(page, /id="hc-article-view"/);
  assert.match(page, /id="hc-admin"/);
  assert.match(page, /help-center\.css/);
  assert.match(page, /help-center\.js/);
});

test('the taxonomy migration contains exactly 22 categories and 178 subcategories', () => {
  const categoryBlock = schema.split('insert into public.help_categories')[1]?.split('on conflict')[0] || '';
  const categoryRows = categoryBlock.match(/\('[a-z0-9-]+','[a-z0-9-]+',\d+\)/g) || [];
  const subcategoryBlock = schema.split('insert into public.help_subcategories')[1]?.split('on conflict')[0] || '';
  const subcategoryRows = subcategoryBlock.match(/\('[a-z0-9-]+','[a-z0-9-]+',\d+\)/g) || [];
  assert.equal(categoryRows.length, 22);
  assert.equal(subcategoryRows.length, 178);
  for (const table of [
    'help_categories','help_category_translations','help_subcategories','help_subcategory_translations',
    'help_articles','help_article_translations','help_keywords','help_related_articles',
    'help_article_feedback','help_article_revisions','help_user_bookmarks','help_article_views','help_search_events'
  ]) assert.match(schema, new RegExp('alter table public\\.' + table + ' enable row level security'));
});

test('no fake Help Center Q&A content is seeded into Minglora', () => {
  assert.doesNotMatch(schema, /insert into public\.help_articles/i);
  assert.doesNotMatch(schema, /insert into public\.help_article_translations/i);
  assert.match(page, /No approved question-and-answer articles have been published yet/);
  assert.match(ui, /No verified Q&amp;A articles have been published/);
});

test('search uses persisted full text, category filters and bounded pagination', () => {
  assert.match(schema, /using gin\(search_document\)/);
  assert.match(schema, /websearch_to_tsquery/);
  assert.match(schema, /help_keywords/);
  assert.match(schema, /p_category_slug is null or c\.slug=p_category_slug/);
  assert.match(schema, /greatest\(1,least\(coalesce\(p_limit,20\),50\)\)/);
  assert.match(ui, /addEventListener\("input"/);
  assert.match(ui, /hc-category-filter/);
  assert.match(ui, /hc-subcategory-filter/);
});

test('articles and member actions have separate access rules from staff editing', () => {
  const publicBootstrap = server.indexOf("if(method==='GET'&&p==='/api/help-center/bootstrap')");
  const authGuard = server.indexOf('requireAuth(user);', publicBootstrap);
  assert.ok(publicBootstrap >= 0 && authGuard > publicBootstrap, 'public article browsing must precede the member auth guard');
  assert.match(server, /isModerator\(user,req\)/);
  assert.match(server, /actorUserId:user\.id/);
  assert.match(edge, /x-minglora-api-key/);
  assert.match(edge, /secret_sha256/);
  assert.match(edge, /constantTimeEqual/);
  assert.match(edge, /help_center:manage/);
  assert.match(edge, /platform:admin/);
  assert.match(edge, /Only approved, fact-checked articles can be published/);
});

test('member feedback and bookmarks are scoped to the active member', () => {
  assert.match(edge, /user_id:actor/);
  assert.match(edge, /eq\("user_id",actor\)/);
  assert.match(schema, /auth\.uid\(\)\)=user_id/);
  assert.match(ui, /\/bookmarks\//);
  assert.match(ui, /\/feedback/);
});

test('Help Center navigation links to the dedicated page and preserves Support Inbox routes', () => {
  assert.match(menu, /window\.location\.assign\('\/help-center\.html'\)/);
  assert.match(settings, /Open the Minglora Help Center/);
  assert.match(settings, /#support-ticket-form/);
  assert.match(settings, /#support-tickets-list/);
  assert.match(server, /p==='\/api\/support\/tickets'/);
});

test('Help Center layout supports mobile sizing and saved Minglora themes', () => {
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /theme-dark/);
  assert.match(page, /minglora-branding\.css/);
  assert.match(ui, /document\.body\.dataset\.colorTheme=colorTheme/);
});

test('server client uses bounded retries and does not expose credentials to the browser', () => {
  assert.match(client, /MAX_ATTEMPTS = 3/);
  assert.match(client, /AbortSignal\.timeout\(15000\)/);
  assert.match(client, /x-minglora-api-key/);
  assert.doesNotMatch(page + ui, /SUPABASE_STATE_API_KEY|SERVICE_ROLE_KEY|x-minglora-api-key/);
});

test('popular metrics are based on recorded article views rather than hard-coded figures', () => {
  assert.match(reporting, /create or replace function public\.help_center_popular/);
  assert.match(reporting, /sum\(v\.view_count\)/);
  assert.match(edge, /help_center_popular/);
  assert.match(ui, /Popular questions/);
});
