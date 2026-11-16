import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const liveCss=read('public/styles.css')+'\n'+read('public/live-room-fit.css')+'\n'+read('public/live-tiktok-compact.css');
const meetwaveCss=read('public/meetwave.css');
const layouts=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'];
const expectedColumns={'fluid-grid':2,'fixed-grid':3,'fixed-panel':2,'side-by-side':4,'spotlight':4,'roundtable-2':3};
const viewports=[{name:'desktop',width:1280,height:900},{name:'mobile',width:390,height:844}];
const artifacts=path.join(root,'artifacts/cropped-guest-layout-visual');
fs.mkdirSync(artifacts,{recursive:true});
const makeSeats=meetwave=>Array.from({length:9},(_,index)=>{
  const host=index===0;
  const classes='live-guest-seat '+(meetwave?'mw-video-tile ':'')+(host?'is-host'+(meetwave?' is-focused':''):'is-guest');
  return '<article class="'+classes+'" data-seat-index="'+index+'" style="order:'+index+'"><span>Seat '+index+'</span></article>';
}).join('');
const makeHeading='<div class="live-guest-layout-heading"><strong>Guest stage</strong></div>';
const browser=await chromium.launch({headless:true});
let rendered=0;
function columnCount(value){
  const text=String(value||'').trim();
  return !text||text==='none'?0:text.split(/\s+/).length;
}
function assertFullTile(tile,stage,label){
  assert.ok(tile.display!=='none',label+' should be visible');
  assert.ok(tile.width>=stage.width-24,label+' should fill the main stage');
  assert.ok(tile.height>=stage.height-24,label+' should fill the main stage height');
}
function assertSmallTile(tile,stage,label){
  assert.ok(tile.display!=='none',label+' should be visible');
  assert.ok(tile.width>0&&tile.height>0,label+' must have a visible panel');
  assert.ok(tile.width<stage.width*.55,label+' should remain a smaller guest panel');
}
function checkGeometry(layout,state,product,viewport){
  const label=product+' '+layout+' '+viewport;
  const host=state.seats[0],g1=state.seats[1],g2=state.seats[2],g3=state.seats[3],g5=state.seats[5];
  if(layout==='full-screen'){
    assertFullTile(host,state.grid,label+' main tile');
    for(let index=1;index<9;index++)assert.equal(state.seats[index].display,'none',label+' should show only the main tile');
  }else if(layout==='fluid-panel'){
    assertFullTile(host,state.grid,label+' main tile');
    assertSmallTile(g1,state.grid,label+' first lower-right panel');
    assertSmallTile(g2,state.grid,label+' second lower-right panel');
    assert.ok(g1.y<g2.y,label+' guest panels should stack vertically');
    assert.ok(g1.x>state.grid.x+state.grid.width*.55,label+' guest panels should sit on the right');
  }else if(layout==='fluid-grid'){
    assert.equal(state.columns,2,label+' should have two columns');
    assert.ok(host.height>g1.height*1.45,label+' host panel should span the two grid rows');
    assert.ok(host.x<g1.x,label+' host panel should be on the left');
    assert.ok(g1.x>host.x+host.width-3&&g2.x>host.x+host.width-3,label+' two guest panels should stack on the right');
  }else if(layout==='fixed-grid'){
    assert.equal(state.columns,3,label+' should be a fixed three-column grid');
    assert.equal(state.visibleSeats,9,label+' should display all nine positions');
  }else if(layout==='fixed-panel'){
    assert.equal(state.columns,2,label+' should have a main and side-panel column');
    assert.ok(host.height>g1.height*2.2,label+' main tile should span three rows');
    for(const tile of [g1,g2,g3])assertSmallTile(tile,state.grid,label+' right-side panel');
    assert.ok(g1.x>host.x+host.width-3,label+' right panels should be on the right');
  }else if(layout==='side-by-side'){
    assert.equal(state.columns,4,label+' should have four columns');
    assert.ok(Math.abs(host.y-g1.y)<3,label+' two large panels should share the top row');
    assert.ok(Math.abs(host.width-g1.width)<3,label+' top panels should be equally wide');
    assert.ok(g2.y>host.y+host.height-3,label+' smaller guest panels should be below the top row');
    assert.ok(g2.width<host.width,label+' lower guest panels should be smaller');
  }else if(layout==='spotlight'){
    assert.equal(state.columns,4,label+' should have four columns');
    assert.ok(host.width>state.grid.width-24,label+' spotlight panel should span the full top width');
    assert.ok(g1.y>host.y+host.height-3,label+' guest grid should sit under the spotlight panel');
    assert.ok(g1.width<host.width*.4,label+' guest panels should occupy the lower grid');
  }else if(layout==='roundtable-1'){
    assertFullTile(host,state.grid,label+' background/main tile');
    assertSmallTile(g1,state.grid,label+' left-side guest overlay');
    assertSmallTile(g5,state.grid,label+' right-side guest overlay');
    assert.ok(g1.x<state.grid.x+state.grid.width*.25,label+' left guest rail should sit on the left');
    assert.ok(g5.x>state.grid.x+state.grid.width*.7,label+' right guest rail should sit on the right');
  }else if(layout==='roundtable-2'){
    assert.equal(state.columns,3,label+' should have three columns');
    assert.ok(host.height>g1.height*2.5,label+' center panel should span four rows');
    assert.ok(g1.x<host.x&&g5.x>host.x+host.width-3,label+' guests should be on both sides');
  }
}
function stateInPage(){
  const grid=document.querySelector('#guest-grid');
  const stage=document.querySelector('#guest-stage');
  const tiles=Array.from(grid.querySelectorAll('.live-guest-seat'));
  const getTile=tile=>{
    const r=tile.getBoundingClientRect(),c=getComputedStyle(tile);
    return {display:c.display,position:c.position,x:r.x,y:r.y,width:r.width,height:r.height,
      columnStart:c.gridColumnStart,columnEnd:c.gridColumnEnd,rowStart:c.gridRowStart,rowEnd:c.gridRowEnd};
  };
  const gr=grid.getBoundingClientRect();
  return {display:getComputedStyle(grid).display,columns:columnCount(getComputedStyle(grid).gridTemplateColumns),
    grid:{x:gr.x,y:gr.y,width:gr.width,height:gr.height},visibleSeats:tiles.filter(t=>getComputedStyle(t).display!=='none').length,
    seats:tiles.map(getTile),stage:[stage.getBoundingClientRect().width,stage.getBoundingClientRect().height]};
}
try{
  for(const viewport of viewports){
    for(const product of ['live','meetwave']){
      const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
      for(const layout of layouts){
        const tiles=makeSeats(product==='meetwave');
        const stageId=product==='live'?'live-video-stage':'mw-screen-stage';
        const gridClass=product==='live'?'live-guest-layout':'mw-video-grid live-guest-layout';
        const stageClass=product==='live'?'live-video-stage':'mw-screen-stage';
        const layoutAttribute=product==='live'?'data-live-layout':'data-guest-layout';
        const body=product==='live'
          ?'<main id="live-player-shell"><section id="guest-stage" id="'+stageId+'" class="'+stageClass+'" style="width:100%;height:640px;min-height:560px"><div id="guest-grid" id="live-guest-layout" class="'+gridClass+'" '+layoutAttribute+'="'+layout+'">'+makeHeading+tiles+'</div></section></main>'
          :'<main class="mw-meeting"><section id="guest-stage" id="'+stageId+'" class="'+stageClass+'" '+layoutAttribute+'="'+layout+'" style="width:100%;height:640px;min-height:560px"><div id="guest-grid" id="mw-grid" class="'+gridClass+'" data-layout="'+layout+'" data-guest-layout="'+layout+'">'+makeHeading+tiles+'</div></section></main>';
        const css=product==='live'?liveCss:meetwaveCss;
        await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;width:100%;min-height:100%;}'+css+'</style></head><body>'+body+'</body></html>');
        const state=await page.evaluate(stateInPage);
        checkGeometry(layout,state,product,viewport.name);
        const file=product+'-'+layout+'-'+viewport.name+'.png';
        await page.screenshot({path:path.join(artifacts,file),fullPage:true});
        rendered++;
      }
      await page.close();
    }
  }
}finally{
  await browser.close();
}
console.log(JSON.stringify({result:'passed',guestLayouts:layouts.length,products:2,viewports:viewports.length,rendered,screenshots:rendered},null,2));
