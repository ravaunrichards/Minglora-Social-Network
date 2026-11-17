import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const server=read('src/server.js');
const routeStart=server.indexOf("if (p === '/api/ai-discovery'");
const ownerStart=server.indexOf("if (p === '/api/ai-network'");
const route=server.slice(routeStart,ownerStart);
const sql=read('supabase/migrations/20261114022055_minglora_ai_discovery_and_following.sql');
const html=read('public/ai-discovery.html');
const js=read('public/ai-discovery.js');
const app=read('public/app.js');
const index=read('public/index.html');

test('public AI discovery is a distinct signed-in member API before owner-only AI administration',()=>{
 assert.ok(routeStart>=0&&ownerStart>routeStart);
 assert.match(route,/const user = sessionUser\(req\)/);
 assert.match(route,/requireAuth\(user\)/);
 assert.match(route,/isSupabasePersistence\(\)/);
 assert.match(route,/requestSupabaseState\('ai_discovery_command'/);
 assert.doesNotMatch(route,/isDesignatedCreatorHubAdmin|hasActiveReviewerSession|isModerator/);
 assert.match(server.slice(ownerStart,ownerStart+1200),/isDesignatedCreatorHubAdmin\(user\)/);
});

test('member API allows only bounded discovery, own follows and saved-search operations',()=>{
 for(const token of ["'discover'","'list_following'","'list_follow_requests'","'list_saved_groups'","'follow'","'bulk_follow'","'unfollow'","'review_follow_request'","'save_discovery_group'","'delete_saved_group'"]) assert.ok(route.includes(token),token);
 assert.match(route,/input\.identity_ids\.length > 100/);
 assert.match(route,/uuid\.test/);
 assert.match(route,/Discovery filters are limited to 16 KB/);
 assert.match(route,/actorUserId: user\.id/);
 assert.match(server,/isSameOriginApiWrite\(req\)/);
});

test('database discovery returns only active enabled public AI profiles and never exposes emails',()=>{
 assert.match(sql,/i\.status='active' and i\.enabled=true\s+and p\.profile_visibility='public'/);
 assert.match(sql,/f\.follower_user_id=p_actor_user_id/);
 assert.match(sql,/unique \(identity_id,follower_user_id\)/);
 assert.doesNotMatch(sql,/primary_email|email_address/);
 assert.match(sql,/where group_id=\(v_payload->>'group_id'\)::uuid and owner_user_id=p_actor_user_id/);
});

test('Discover AI page is clearly AI-labelled and presents combined world filters',()=>{
 assert.match(html,/<h1>Discover AI profiles<\/h1>/);
 assert.match(html,/AI identities are not human members/);
 assert.match(html,/name="category_keys"/);
 assert.match(html,/name="populations"/);
 assert.match(html,/name="genders"/);
 assert.match(html,/id="ai-discovery-countries"/);
 assert.match(js,/const COUNTRY_CODES='[A-Z ]+'/);
 assert.match(js,/const selected=new Set\(list\(filters\[key\]\)\)/);
 assert.match(js,/Follow selected \(max 100\)/);
 assert.match(js,/Minglora members following/);
});

test('country options are searchable and member-owned AI follow requests can be reviewed',()=>{
 assert.match(html,/id="ai-discovery-country-search"/);
 assert.match(js,/function filterCountries\(value\)/);
 assert.match(js,/option\.hidden=Boolean\(query\)/);
 assert.match(html,/Follow requests for your AI profiles/);
 assert.match(js,/reviewFollowRequest/);
});

test('Discover AI navigation is exposed to members without removing owner-only control',()=>{
 assert.match(index,/href="\/ai-discovery\.html"[^>]*aria-label="Discover public AI profiles"/);
 assert.match(app,/label:'Discover AI'.*action:'ai-discovery'/);
 assert.match(app,/window\.location\.assign\('\/ai-discovery\.html'\)/);
 assert.match(index,/id="ai-network-sidebar-link" data-view="ai-network"/);
});
