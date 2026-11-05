import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../../public/gifter-badge-art.js",import.meta.url),"utf8");
const context=vm.createContext({window:{}});
vm.runInContext(source,context,{filename:"gifter-badge-art.js"});
const art=context.window.MingloraGifterBadgeArt;
test("all 50 levels render their own premium 3D crest",()=>{
const markup=Array.from({length:50},(_,i)=>art.render({level:i+1}));
assert.equal(new Set(markup).size,50);
for(let n=1;n<=50;n++){assert.match(markup[n-1],new RegExp("gp-level-"+n+"(?![0-9])"));assert.match(markup[n-1],new RegExp('data-gp-level="'+n+'"'));assert.match(markup[n-1],/gp-crest-rim-outer[\\s\\S]*gp-crest-gem/);}
});
test("design profile advances continuously from Level 1 to Level 50",()=>{
const first=art.designProfile(1),last=art.designProfile(50);
assert.equal(first.tier,1);assert.equal(last.tier,10);
assert.equal(first.crownPoints,3);assert.equal(last.crownPoints,7);
assert.ok(last.wingFeathers>first.wingFeathers);assert.ok(last.orbitRings>first.orbitRings);
assert.ok(last.accentGems>first.accentGems);assert.ok(last.facetLines>first.facetLines);
assert.ok(last.gemScale>first.gemScale);assert.ok(last.relief>first.relief);assert.ok(last.glow>first.glow);
for(let n=2;n<=50;n++)assert.ok(art.designProfile(n).progress>art.designProfile(n-1).progress);
});
test("level input is clamped and full, compact and inline badges remain accessible",()=>{
assert.equal(art.designProfile(0).level,1);assert.equal(art.designProfile(99).level,50);
const full=art.render({level:25,badgeName:"Platinum Gifter"}),small=art.render({level:25,compact:true}),inline=art.render({level:25,inline:true});
assert.match(full,/aria-label="Platinum Gifter"/);assert.match(full,/gp-badge-level/);
assert.doesNotMatch(small,/gp-badge-level/);assert.match(small,/gp-badge--small/);
assert.match(inline,/gp-inline-badge/);assert.match(inline,/<strong>25<\\/strong>/);
});
test("badge labels are escaped before insertion into markup",()=>{
const markup=art.render({level:1,badgeName:'<img src=x onerror=alert(1)>'});
assert.match(markup,/&lt;img src=x onerror=alert\\(1\\)&gt;/);assert.doesNotMatch(markup,/<img/);
});