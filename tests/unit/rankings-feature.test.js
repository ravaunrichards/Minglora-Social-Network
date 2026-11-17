import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const html=read("public/index.html"),app=read("public/app.js");
const page=read("public/rankings.js"),css=read("public/rankings.css");
const gifter=read("public/top-gifters.js"),leagueJs=read("public/leagues.js");
const styles=read("public/styles.css"),leagueCss=read("public/leagues.css");
const server=read("src/server.js"),service=read("backend/modules/gifter-progression/service.js");
const worker=read("public/sw.js");
test("Rankings is a dedicated secondary destination separate from Leagues and the LIVE shortcut",()=>{
 const start=html.indexOf('<div class="left-rail-feature-list" id="left-rail-feature-list">');
 const end=html.indexOf('id="left-rail-see-toggle"',start),sidebar=html.slice(start,end);
 assert.ok(sidebar.includes('data-view="rankings"'));
 assert.ok(sidebar.includes(">Rankings</span>"));
 assert.ok(html.includes("/rankings.css?v=20261117-avatar-rankings-sync-1"));
 assert.ok(html.includes("/rankings.js?v=20261117-avatar-rankings-sync-1"));
 assert.ok(app.includes("view:'rankings'")&&app.includes("state.view==='rankings'"));
 assert.ok(app.includes("window.MingloraRankings?.render()"));
 assert.ok(app.includes("window.MingloraRankings?.onNavigateAway?.()"));
 assert.ok(app.includes("window.MingloraGifterProgression?.render()"));
 assert.ok(app.includes("window.MingloraLeagues?.render()"));
 assert.ok(page.includes("window.MingloraRankings = {render,onNavigateAway}"));
});
test("Rankings uses the confirmed LIVE gift API for four periods and up to 100 positions",()=>{
 for(const period of ["daily","weekly","monthly","all_time"])assert.ok(page.includes('["'+period+'"'));
 assert.ok(page.includes("/api/live/rankings/top-gifters?period="));
 assert.match(page,/filter\(item => item\.position <= 100\)/);
 assert.match(server,/period,now:new Date\(\),timeZone,limit:100/);
 assert.match(service,/Math\.min\(100,/);
 assert.match(service,/contextType !== "live"/);
 assert.match(service,/getDeduplicatedGiftEvents/);
 assert.match(server,/await syncRefundedGiftActivity\(\)/);
});
test("Rankings uses supplied top-three frames and separate Top 10 and Top 20 rank treatments",()=>{
 assert.match(page,/const podium = \[2,1,3\]/);
 assert.ok(page.includes("daily-ranking-badges/place-") && page.includes(".png' alt='' loading"));
 assert.ok(page.includes("\"top-ten\"")&&page.includes("\"top-twenty\""));
 assert.ok(css.includes(".ranking-position--top-ten")&&css.includes(".ranking-position--top-twenty"));
 assert.ok(page.includes("TOP 10")&&page.includes("TOP 20"));
 assert.ok(page.includes("data-ranking-profile")&&page.includes("window.openProfile"));
 assert.ok(css.includes(".ranking-podium-card--1"));
 assert.ok(css.includes(".ranking-position--top-ten")&&css.includes(".ranking-position--top-twenty"));
 assert.ok(css.includes("@media(max-width:520px)")&&css.includes("prefers-reduced-motion"));
});
test("Rankings handles empty, failure, period-switch and route-cancellation states",()=>{
 assert.ok(page.includes("No members are ranked for this period yet."));
 assert.ok(page.includes("Rankings are temporarily unavailable."));
 assert.ok(page.includes("data-ranking-retry")&&page.includes("AbortController"));
 assert.ok(page.includes("data-ranking-period")&&page.includes('cache:"no-store"'));
 assert.ok(page.includes("function onNavigateAway()"));
 assert.ok(worker.includes("minglora-shell-v352-self-updating-1"));
 assert.ok(worker.includes("/rankings.css?v=20261117-avatar-rankings-sync-1"));
 assert.ok(worker.includes("/rankings.js?v=20261117-avatar-rankings-sync-1"));
});


test("Profile avatars use one compatible source across profiles, daily rankings, Top Gifters and Leagues",()=>{
 assert.ok(app.includes("u?.avatar||u?.avatarUrl||u?.avatar_url||u?.profilePicture"));
 assert.ok(server.includes("const profileAvatar=String(u.avatar||u.avatarUrl||u.avatar_url||u.profilePicture||'')"));
 assert.ok(server.includes("avatar:profileAvatar,avatarUrl:profileAvatar"));
 assert.ok(page.includes("DEFAULT_RANKING_AVATAR")&&page.includes("safeAvatarUrl(user)"));
 assert.ok(gifter.includes("function safeAvatarUrl(user)")&&gifter.includes("DEFAULT_GIFTER_AVATAR"));
 assert.ok(leagueJs.includes("member?.avatar || member?.avatarUrl || member?.avatar_url || member?.profilePicture"));
 assert.ok(leagueJs.includes("DEFAULT_LEAGUE_AVATAR"));
});

test("Ranking badge art remains visible around a compact centered member photo on desktop and mobile",()=>{
 assert.ok(css.includes(".ranking-podium-frame{position:absolute;inset:0;z-index:0"));
 assert.ok(css.includes("object-fit:contain;object-position:center"));
 assert.ok(css.includes("width:36%;height:36%;box-sizing:border-box"));
 assert.ok(styles.includes("width:21px;height:21px;box-sizing:border-box"));
 assert.ok(styles.includes("width:36%;height:36%;max-width:none;box-sizing:border-box"));
 assert.ok(leagueCss.includes("object-fit:contain;object-position:center"));
 assert.ok(leagueCss.includes("width:36%;height:36%;box-sizing:border-box"));
 assert.ok(html.includes("styles.css?v=20261117-avatar-rankings-sync-1"));
 assert.ok(html.includes("app.js?v=20261117-avatar-rankings-sync-1"));
});
