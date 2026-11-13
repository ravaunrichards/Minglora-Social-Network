import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const liveCss=read('public/styles.css')+'\n'+read('public/live-room-fit.css');
const meetwaveCss=read('public/meetwave.css');
const screens=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'];
const guests=['roundtable-1','roundtable-2'];
const viewports=[{name:'desktop',width:1280,height:900},{name:'mobile',width:390,height:844}];
const artifacts=path.join(root,'artifacts/layout-separation-visual');
fs.mkdirSync(artifacts,{recursive:true});
const seatMarkup=Array.from({length:9},(_,index)=>{
  const role=index===0?'is-host':'is-guest';
  return '<div class="live-guest-seat '+role+'" data-seat-index="'+index+'"><span>Seat '+index+'</span></div>';
}).join('');
const browser=await chromium.launch({headless:true});
let combinations=0;
function assertStableScreenGeometry(current,baseline,message){
  const currentColumns=String(current[0]).trim().split(/\\s+/).map(Number);
  const baselineColumns=String(baseline[0]).trim().split(/\\s+/).map(Number);
  assert.equal(currentColumns.length,baselineColumns.length,message+' (column count)');
  for(let index=0;index<currentColumns.length;index++){
    assert.ok(Math.abs(currentColumns[index]-baselineColumns[index])<=1,message+' (column '+(index+1)+' differs by more than 1px)');
  }
  assert.deepEqual(current.slice(1),baseline.slice(1),message);
}
try{
  for(const viewport of viewports){
    const livePage=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
    for(const mode of ['video','audio']){
      const stageClass=mode==='audio'?'live-video-stage live-audio-stage':'live-video-stage';
      const gridClass=mode==='audio'?'live-guest-layout audio-guest-layout':'live-guest-layout';
      const body='<main id="live-player-shell"><section id="live-video-stage" class="'+stageClass+'" style="width:100%;min-height:560px"><div id="live-guest-layout" class="'+gridClass+'">'+seatMarkup+'</div></section></main>';
      await livePage.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+liveCss+'</style></head><body>'+body+'</body></html>');
      for(const screen of screens){
        let baseline=null;
        const guestPositions=[];
        for(const guest of guests){
          const state=await livePage.evaluate(({screen,guest})=>{
            const grid=document.querySelector('#live-guest-layout');
            grid.dataset.liveLayout=screen;
            grid.dataset.liveGuestLayout=guest;
            const css=getComputedStyle(grid),host=getComputedStyle(grid.querySelector('.is-host'));
            return {columns:css.gridTemplateColumns,stage:[document.querySelector('#live-video-stage').getBoundingClientRect().width,document.querySelector('#live-video-stage').getBoundingClientRect().height],screen:grid.dataset.liveLayout,guest:grid.dataset.liveGuestLayout,host:[host.gridColumnStart,host.gridColumnEnd,host.gridRowStart,host.gridRowEnd],seats:grid.querySelectorAll('.live-guest-seat').length};
          },{screen,guest});
          if(baseline){
            assertStableScreenGeometry([state.columns,state.stage,state.screen,state.seats],baseline,mode+' LIVE '+screen+' screen mode or stage geometry changed when only guest layout changed at '+viewport.name);
            assert.equal(state.guest,guest,'LIVE guest selection did not apply independently');
          }else baseline=[state.columns,state.stage,state.screen,state.seats];
          guestPositions.push(state.host);
          combinations++;
        }
        assert.notDeepEqual(guestPositions[0],guestPositions[1],mode+' LIVE '+screen+' guest-box choices do not produce different host placement at '+viewport.name);
        if(screen==='full-screen'&&viewport.name==='desktop'&&mode==='video'){
          await livePage.screenshot({path:path.join(artifacts,'live-video-roundtable-1-desktop.png'),fullPage:true});
        }
        if(screen==='spotlight'&&viewport.name==='mobile'&&mode==='audio'){
          await livePage.screenshot({path:path.join(artifacts,'live-audio-spotlight-mobile.png'),fullPage:true});
        }
      }
    }
    await livePage.close();

    const mwPage=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
    const mwBody='<main class="mw-meeting"><section id="mw-screen-stage" class="mw-screen-stage" style="width:100%;min-height:560px"><div id="mw-grid" class="live-video-stage mw-video-grid live-guest-layout">'+seatMarkup+'</div></section></main>';
    await mwPage.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+meetwaveCss+'</style></head><body>'+mwBody+'</body></html>');
    for(const screen of screens){
      let baseline=null;
      const guestPositions=[];
      for(const guest of guests){
        const state=await mwPage.evaluate(({screen,guest})=>{
          const stage=document.querySelector('#mw-screen-stage'),grid=document.querySelector('#mw-grid');
          stage.dataset.screenLayout=screen;grid.dataset.layout=screen;grid.dataset.guestLayout=guest;
          const css=getComputedStyle(grid),host=getComputedStyle(grid.querySelector('.is-host'));
          return {columns:css.gridTemplateColumns,stage:[stage.getBoundingClientRect().width,stage.getBoundingClientRect().height],screen:stage.dataset.screenLayout,gridScreen:grid.dataset.layout,guest:grid.dataset.guestLayout,host:[host.gridColumnStart,host.gridColumnEnd,host.gridRowStart,host.gridRowEnd],seats:grid.querySelectorAll('.live-guest-seat').length};
        },{screen,guest});
        if(baseline){
          assertStableScreenGeometry([state.columns,state.stage,state.screen,state.gridScreen,state.seats],baseline,'MeetWave '+screen+' screen mode or stage geometry changed when only guest layout changed at '+viewport.name);
          assert.equal(state.guest,guest,'MeetWave guest selection did not apply independently');
        }else baseline=[state.columns,state.stage,state.screen,state.gridScreen,state.seats];
        guestPositions.push(state.host);
        combinations++;
      }
      assert.notDeepEqual(guestPositions[0],guestPositions[1],'MeetWave '+screen+' guest-box choices do not produce different host placement at '+viewport.name);
      if(screen==='fluid-grid'&&viewport.name==='desktop'){
        await mwPage.screenshot({path:path.join(artifacts,'meetwave-fluid-grid-roundtable-1-desktop.png'),fullPage:true});
      }
      if(screen==='spotlight'&&viewport.name==='mobile'){
        await mwPage.screenshot({path:path.join(artifacts,'meetwave-spotlight-roundtable-2-mobile.png'),fullPage:true});
      }
    }
    await mwPage.close();
  }
}finally{
  await browser.close();
}
console.log(JSON.stringify({result:'passed',screenLayouts:7,guestBoxLayouts:2,viewports:2,liveModes:2,combinations,screenshots:4},null,2));
