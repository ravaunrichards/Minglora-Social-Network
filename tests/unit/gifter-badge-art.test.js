import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../../public/gifter-badge-art.js",import.meta.url),"utf8");
const context=vm.createContext({window:{}});
vm.runInContext(source,context,{filename:"gifter-badge-art.js"});
const art=context.window.MingloraGifterBadgeArt;

test("all 50 Gifter Levels render their matching original numbered PNG",()=>{
  const badges=Array.from({length:50},(_,i)=>art.render({level:i+1}));
  assert.equal(new Set(badges).size,50);
  badges.forEach((html,index)=>{
    const level=index+1;
    assert.ok(html.includes('data-gp-level="'+level+'"'));
    assert.ok(html.includes('src="/assets/gifter-badges/level_'+String(level).padStart(2,"0")+'.png"'));
    assert.ok(!html.includes("gp-crest-svg"));
    assert.ok(!html.includes("<svg"));
  });
});

test("uploaded strip stages map to the six original tier ranges",()=>{
  for(const [level,stage] of [[1,1],[9,1],[10,2],[19,2],[20,3],[29,3],[30,4],[39,4],[40,5],[49,5],[50,6]]){
    assert.equal(art.designProfile(level).stage,stage,"level "+level);
  }
  assert.equal(art.designProfile(50).stageLabel,"Level 50+");
  assert.equal(art.designProfile(0).level,1);
  assert.equal(art.designProfile(99).level,50);
});

test("original badge renderer preserves compact, inline, profile and gallery sizing",()=>{
  const profile=art.render({level:25}),compact=art.render({level:25,compact:true}),inline=art.render({level:25,inline:true}),gallery=art.render({level:25,gallery:true});
  assert.ok(profile.includes('width="48" height="21"'));
  assert.ok(compact.includes('width="40" height="18"'));
  assert.ok(inline.includes('width="44" height="20"'));
  assert.ok(gallery.includes('width="170" height="76"'));
  assert.ok(profile.includes('class="gp-profile-level-badge gp-profile-level-badge--profile"'));
});

test("badge labels are escaped before insertion into accessible markup",()=>{
  const html=art.render({level:1,badgeName:'<img src=x onerror=alert(1)>'});
  assert.ok(html.includes('aria-label="&lt;img src=x onerror=alert(1)&gt;"'));
  assert.ok(!html.includes('aria-label="<img'));
});

test("six crop files are independent viewBox crops of the uploaded source JPEG",()=>{
  const entries=[
    ["tier-01.svg",'viewBox="45 18 100 104"'],
    ["tier-02.svg",'viewBox="223 18 100 104"'],
    ["tier-03.svg",'viewBox="400 18 100 104"'],
    ["tier-04.svg",'viewBox="579 18 100 104"'],
    ["tier-05.svg",'viewBox="757 18 100 104"'],
    ["tier-06.svg",'viewBox="935 18 100 104"']
  ];
  for(const [file,viewBox] of entries){
    const svg=readFileSync(new URL("../../public/assets/gifter-badge-progression-crops/"+file,import.meta.url),"utf8");
    assert.ok(svg.includes(viewBox),file+" has a dedicated crop window");
    assert.ok(svg.includes('href="/assets/gifter-badge-progression-art.jpg"'),file+" references the uploaded photo");
    assert.ok(svg.includes('width="1080" height="167"'),file+" preserves original image dimensions");
  }
});
