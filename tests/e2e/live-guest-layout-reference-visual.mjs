import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const css=read('public/styles.css')+'\n'+read('public/live-room-fit.css')+'\n'+read('public/live-tiktok-compact.css');
const output=path.join(root,'artifacts/layout-separation-visual');
fs.mkdirSync(output,{recursive:true});

const layouts=[
  ['full-screen',1],
  ['fluid-panel',3],
  ['fluid-grid',3],
  ['fixed-grid',9],
  ['fixed-panel',4],
  ['side-by-side',10],
  ['spotlight',9],
  ['roundtable-1',9],
  ['roundtable-2',9]
];
const viewports=[
  {name:'desktop',width:1280,height:900},
  {name:'mobile',width:390,height:844}
];

const seatMarkup=count=>Array.from({length:count},(_,index)=>{
  if(index===0){
    return '<article class="live-guest-seat is-host"><div class="live-guest-seat-media"></div><span class="live-guest-seat-avatar">H</span><span class="live-guest-seat-meta"><strong>Host</strong><small>Host</small></span></article>';
  }
  return '<button type="button" class="live-guest-seat empty" aria-label="Open guest seat '+index+'"></button>';
}).join('');

const near=(actual,expected,tolerance,message)=>{
  assert.ok(Math.abs(actual-expected)<=tolerance,message+': expected '+expected.toFixed(2)+', got '+actual.toFixed(2));
};
const groupValues=(values,tolerance=2.5)=>{
  const groups=[];
  for(const value of [...values].sort((a,b)=>a-b)){
    if(!groups.length||Math.abs(value-groups[groups.length-1])>tolerance)groups.push(value);
  }
  return groups;
};
const rect=(item,stage)=>({
  x:item.x-stage.x,y:item.y-stage.y,width:item.width,height:item.height,
  right:item.x-stage.x+item.width,bottom:item.y-stage.y+item.height
});
const fullStage=(item,stage,message)=>{
  near(item.x,stage.x,2,message+' left edge');
  near(item.y,stage.y,2,message+' top edge');
  near(item.width,stage.width,2,message+' width');
  near(item.height,stage.height,2,message+' height');
};

const browser=await chromium.launch({headless:true});
const evidence=[];
try{
  for(const viewport of viewports){
    const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
    const stageStyle='#live-video-stage{position:relative!important;display:block!important;box-sizing:border-box!important;width:min(420px,92vw)!important;height:min(680px,80vh)!important;min-height:0!important;max-height:none!important;aspect-ratio:auto!important;padding:0!important;margin:0 auto!important;overflow:hidden!important}html,body{margin:0!important;width:100%;height:100%;background:#151922}#live-player-shell{display:block;width:100%;height:100%}';
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><style>'+stageStyle+'</style></head><body><main id="live-player-shell"><section id="live-video-stage" class="live-video-stage"><div id="live-guest-layout" class="live-guest-layout"></div></section></main></body></html>');
    for(const [layout,count] of layouts){
      const markup=seatMarkup(count);
      const state=await page.evaluate(({layout,markup})=>{
        const stage=document.querySelector('#live-video-stage');
        const grid=document.querySelector('#live-guest-layout');
        stage.className='live-video-stage'+(layout==='full-screen'?' live-full-screen-layout':'');
        grid.dataset.liveLayout=layout;
        grid.innerHTML=markup;
        const toRect=element=>{
          const r=element.getBoundingClientRect();
          return {x:r.x,y:r.y,width:r.width,height:r.height};
        };
        return {
          stage:toRect(stage),
          root:toRect(grid),
          display:getComputedStyle(grid).display,
          columns:getComputedStyle(grid).gridTemplateColumns,
          rows:getComputedStyle(grid).gridTemplateRows,
          seats:Array.from(grid.querySelectorAll('.live-guest-seat'),toRect)
        };
      },{layout,markup});
      assert.equal(state.seats.length,count,layout+' renders the exact reference seat count');
      const seats=state.seats.map(item=>rect(item,state.stage));
      for(const [index,seat] of seats.entries()){
        assert.ok(seat.width>0&&seat.height>0,layout+' seat '+(index+1)+' is visible');
        assert.ok(seat.x>=-1&&seat.y>=-1,layout+' seat '+(index+1)+' starts inside the stage');
        assert.ok(seat.right<=state.stage.width+1&&seat.bottom<=state.stage.height+1,layout+' seat '+(index+1)+' remains inside the stage');
      }
      if(layout==='full-screen'){
        fullStage(state.root,state.stage,'Full Screen root');
        fullStage(state.seats[0],state.stage,'Full Screen single host tile');
      }
      if(layout==='fluid-panel'){
        fullStage(state.seats[0],state.stage,'Fluid Panel dominant host tile');
        const [top,bottom]=seats.slice(1);
        assert.ok(top.x>state.stage.width*.5&&bottom.x>state.stage.width*.5,'Fluid Panel guest tiles stay at bottom-right');
        near(top.x,bottom.x,2,'Fluid Panel guest rail alignment');
        assert.ok(top.y<bottom.y,'Fluid Panel guest tiles stack vertically');
        assert.ok(top.width<state.stage.width*.4&&bottom.width<state.stage.width*.4,'Fluid Panel guest tiles remain small');
      }
      if(layout==='fluid-grid'){
        assert.equal(state.display,'grid','Fluid Grid uses a true grid');
        assert.ok(seats[0].x<seats[1].x&&seats[1].x===seats[2].x,'Fluid Grid has one tall left tile and a right stack');
        near(seats[1].y,seats[0].y,2,'Fluid Grid upper-right tile starts level with the host tile');
        assert.ok(seats[2].y>seats[1].y,'Fluid Grid has a second lower-right tile');
        near(seats[0].height,seats[1].height+seats[2].height+4,5,'Fluid Grid left tile spans both right rows');
      }
      if(layout==='fixed-grid'){
        assert.equal(state.display,'grid','Fixed Grid uses a true grid');
        assert.equal(groupValues(seats.map(s=>s.x)).length,3,'Fixed Grid has three columns');
        assert.equal(groupValues(seats.map(s=>s.y)).length,3,'Fixed Grid has three rows');
        near(Math.max(...seats.map(s=>s.width)),Math.min(...seats.map(s=>s.width)),2,'Fixed Grid tile widths match');
        near(Math.max(...seats.map(s=>s.height)),Math.min(...seats.map(s=>s.height)),2,'Fixed Grid tile heights match');
      }
      if(layout==='fixed-panel'){
        assert.equal(state.display,'grid','Fixed Panel uses a true grid');
        assert.ok(seats[0].x<seats[1].x,'Fixed Panel host tile occupies the left panel');
        near(seats[0].height,seats[1].height+seats[2].height+seats[3].height+8,6,'Fixed Panel host spans three stacked rows');
        assert.equal(groupValues(seats.slice(1).map(s=>s.y)).length,3,'Fixed Panel has three right-side guest rows');
      }
      if(layout==='side-by-side'){
        assert.equal(state.display,'grid','Side by Side uses a true grid');
        assert.equal(groupValues(seats.map(s=>s.y)).length,3,'Side by Side has three horizontal rows');
        assert.equal(groupValues(seats.slice(2).map(s=>s.y)).length,2,'Side by Side has two rows of small tiles');
        near(seats[0].y,seats[1].y,2,'Side by Side large tiles share the top row');
        near(seats[0].width,seats[2].width*2,4,'Side by Side top host spans two small columns');
      }
      if(layout==='spotlight'){
        assert.equal(state.display,'grid','Spotlight uses a true grid');
        assert.ok(seats[0].width>seats[1].width*3,'Spotlight has one wide dominant top tile');
        assert.equal(groupValues(seats.slice(1).map(s=>s.y)).length,2,'Spotlight has two rows of supporting tiles');
        assert.equal(groupValues(seats.slice(1).map(s=>s.x)).length,4,'Spotlight has four supporting columns');
      }
      if(layout==='roundtable-1'){
        fullStage(state.seats[0],state.stage,'Roundtable 1 full-stage host backdrop');
        const left=seats.slice(1).filter(s=>s.x<state.stage.width*.5);
        const right=seats.slice(1).filter(s=>s.x>state.stage.width*.5);
        assert.equal(left.length,4,'Roundtable 1 has four tiles on the left');
        assert.equal(right.length,4,'Roundtable 1 has four tiles on the right');
        assert.equal(groupValues(left.map(s=>s.y)).length,4,'Roundtable 1 left tiles form four levels');
        assert.equal(groupValues(right.map(s=>s.y)).length,4,'Roundtable 1 right tiles form four levels');
      }
      if(layout==='roundtable-2'){
        const host=seats[0];
        near(host.x+host.width/2,state.stage.width/2,2,'Roundtable 2 central host is centered');
        near(host.width/state.stage.width,.42,.015,'Roundtable 2 host width follows the central portrait reference');
        near(host.height/state.stage.height,.58,.015,'Roundtable 2 host height follows the central portrait reference');
        const left=seats.slice(1).filter(s=>s.x<state.stage.width*.5);
        const right=seats.slice(1).filter(s=>s.x>state.stage.width*.5);
        assert.equal(left.length,4,'Roundtable 2 has four tiles on the left');
        assert.equal(right.length,4,'Roundtable 2 has four tiles on the right');
      }

      const filename='minglora-guest-'+layout+'-'+viewport.name+'.png';
      await page.screenshot({path:path.join(output,filename),fullPage:false});
      evidence.push({layout,viewport:viewport.name,seats:count,stage:state.stage,root:state.root,seatBoxes:seats});
    }
    await page.close();
  }
}finally{
  await browser.close();
}
fs.writeFileSync(path.join(output,'minglora-guest-layout-reference-geometry.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({result:'passed',layouts:layouts.length,viewports:viewports.length,rendered:evidence.length,screenshots:layouts.length*viewports.length},null,2));
