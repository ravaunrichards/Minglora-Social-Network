import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
// Include the stylesheet used by the production page, after its legacy cascade.
const liveCss=read('public/styles.css')+'\n'+read('public/live-room-fit.css')+'\n'+read('public/live-guest-layout-reference.css');
const meetwaveCss=read('public/meetwave.css');
const screens=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'];
const guests=[null,'roundtable-1','roundtable-2'];
const viewports=[{name:'desktop',width:1280,height:900},{name:'mobile',width:390,height:844}];
const artifacts=path.join(root,'artifacts/layout-separation-visual');
fs.mkdirSync(artifacts,{recursive:true});

const seatMarkup=Array.from({length:9},(_,index)=>{
  const role=index===0?'is-host':'is-guest';
  const label=index===0?'HOST':'GUEST '+index;
  const name=index===0?'Minglora Host':'Guest '+index;
  return '<article class="live-guest-seat '+role+'" data-seat-index="'+index+'">'+
    '<span class="live-guest-seat-tag">'+label+'</span>'+
    '<span class="live-guest-seat-avatar" aria-hidden="true">'+(index===0?'MH':'G'+index)+'</span>'+
    '<span class="live-guest-seat-meta"><strong>'+name+'</strong><small>'+(index===0?'Host':'Connected')+'</small></span>'+
    '<div class="live-guest-seat-media"></div></article>';
}).join('');

const browser=await chromium.launch({headless:true});
let combinations=0;
let referenceChecks=0;

function assertStableScreenGeometry(current,baseline,message){
  assert.equal(current.columns,baseline.columns,message+' (column template)');
  assert.equal(current.rows,baseline.rows,message+' (row template)');
  assert.deepEqual(current.stage,baseline.stage,message+' (stage dimensions)');
  assert.equal(current.screen,baseline.screen,message+' (screen identifier)');
  assert.equal(current.visibleSeats,baseline.visibleSeats,message+' (visible seat count)');
}

function assertReferenceGeometry(screen,state,viewport){
  const label=screen+' '+viewport+' reference geometry';
  if(screen==='full-screen'){
    assert.ok(state.hostRect.height>state.hostRect.width*.8,label+': portrait host tile should remain prominent');
    assert.ok(state.hostRect.width>0&&state.hostRect.height>0,label+': host tile must occupy the stage');
    assert.equal(state.visibleSeats,1,label+': Full Screen displays one full-stage tile only');
    assert.equal(state.headingDisplay,'none',label+': no extra layout heading in Full Screen');
  }
  if(screen==='fluid-panel'){
    assert.equal(state.columnsCount,4,label+': four-column overlay grid');
    assert.equal(state.hostPlacement[0],'1',label+': primary stage starts at column one');
    assert.equal(state.hostPlacement[1],'5',label+': primary stage spans four columns');
    assert.equal(state.visibleSeats,3,label+': host plus exactly two overlay boxes');
    assert.equal(state.smallGuestPlacements[0][0],'4',label+': first overlay is on right edge');
    assert.equal(state.smallGuestPlacements[1][0],'4',label+': second overlay is on right edge');
  }
  if(screen==='fluid-grid'){
    assert.equal(state.columnsCount,2,label+': large and small columns');
    assert.equal(state.hostPlacement[0],'1',label+': large tile is left');
    assert.equal(state.hostPlacement[2],'2',label+': large tile spans two stacked rows');
    assert.equal(state.visibleSeats,3,label+': large tile plus two right-side tiles');
    assert.ok(state.hostRect.width>state.smallGuestRects[0].width,label+': left tile is wider than right tiles');
    assert.ok(state.hostRect.height>state.smallGuestRects[0].height,label+': left tile is taller than right tiles');
  }
  if(screen==='fixed-grid'){
    assert.equal(state.columnsCount,3,label+': exactly three columns');
    assert.equal(state.rowsCount,3,label+': exactly three rows');
    assert.equal(state.visibleSeats,9,label+': all nine equal participant cells are visible');
    const widths=state.seatRects.map(rect=>rect.width),heights=state.seatRects.map(rect=>rect.height);
    assert.ok(Math.max(...widths)-Math.min(...widths)<=1,label+': all grid cells have equal widths');
    assert.ok(Math.max(...heights)-Math.min(...heights)<=1,label+': all grid cells have equal heights');
    assert.equal(state.headingDisplay,'none',label+': grid has no extra heading row');
  }
  if(screen==='fixed-panel'){
    assert.equal(state.columnsCount,2,label+': large and narrow side-panel columns');
    assert.equal(state.hostPlacement[0],'1',label+': large panel is on the left');
    assert.equal(state.hostPlacement[2],'1',label+': left panel begins at first row');
    assert.equal(state.hostPlacement[3],'4',label+': left panel spans all three rows');
    assert.equal(state.visibleSeats,4,label+': one large panel and exactly three fixed right boxes');
    assert.equal(state.headingDisplay,'none',label+': no unused heading row');
    for(const rect of state.smallGuestRects)assert.ok(rect.width<state.hostRect.width,label+': right guest box is narrower than the main panel');
  }
  if(screen==='side-by-side'){
    assert.equal(state.columnsCount,4,label+': four columns for two large and compact guest cells');
    assert.equal(state.hostPlacement[0],'1',label+': first large tile begins at first column');
    assert.equal(state.hostPlacement[1],'3',label+': first large tile spans two columns');
    const compactGuests=state.smallGuestRects.slice(1);
    assert.equal(compactGuests.length,7,label+': seven remaining compact guest cells after two upper tiles');
    assert.ok(state.hostRect.height>compactGuests[0].height,label+': top tiles are taller than compact guest cells');
    assert.ok(state.hostRect.width>compactGuests[0].width,label+': top tiles are wider than compact guest cells');
  }
  if(screen==='spotlight'){
    assert.equal(state.columnsCount,4,label+': four compact columns below the spotlight');
    assert.equal(state.hostPlacement[0],'1',label+': spotlight begins at first column');
    assert.equal(state.hostPlacement[1],'5',label+': spotlight spans all four columns');
    assert.equal(state.visibleSeats,9,label+': spotlight plus eight guests');
    assert.ok(state.hostRect.width>state.smallGuestRects[0].width*2,label+': spotlight is wider than compact guest cells');
    assert.ok(state.hostRect.height>state.smallGuestRects[0].height,label+': spotlight is taller than compact guest cells');
  }
  referenceChecks++;
}

try{
  for(const viewport of viewports){
    const livePage=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
    for(const mode of ['video','audio']){
      const stageClass=mode==='audio'?'live-video-stage live-audio-stage':'live-video-stage';
      const gridClass=mode==='audio'?'live-guest-layout audio-guest-layout':'live-guest-layout';
      const body='<main id="live-player-shell"><section id="live-video-stage" class="'+stageClass+'" style="width:100%;height:640px;min-height:560px"><div id="live-guest-layout" class="'+gridClass+'">'+seatMarkup+'</div></section></main>';
      await livePage.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+liveCss+'</style></head><body>'+body+'</body></html>');
      for(const screen of screens){
        let baseline=null;
        const guestPositions=[];
        for(const guest of guests){
          const state=await livePage.evaluate(({screen,guest,mode})=>{
            const stage=document.querySelector('#live-video-stage');
            const grid=document.querySelector('#live-guest-layout');
            let heading=grid.querySelector('.live-guest-layout-heading');
            if(screen==='full-screen'&&mode==='video'){
              heading?.remove();
              grid.classList.add('live-host-only-layout','has-active-guests','has-many-guests');
              stage.classList.add('live-full-screen-layout');
            }else{
              if(!heading){
                heading=document.createElement('div');
                heading.className='live-guest-layout-heading';
                heading.innerHTML='<strong>Multi-guest stage</strong><small>9 / 9 seats</small>';
                grid.prepend(heading);
              }
              grid.classList.remove('live-host-only-layout','has-active-guests','has-many-guests');
              stage.classList.remove('live-full-screen-layout');
            }
            grid.dataset.liveLayout=screen;
            if(guest)grid.dataset.liveGuestLayout=guest;else delete grid.dataset.liveGuestLayout;
            const gridStyle=getComputedStyle(grid);
            const host=grid.querySelector('.is-host');
            const hostStyle=getComputedStyle(host);
            const seats=Array.from(grid.querySelectorAll('.live-guest-seat'));
            const visible=seats.filter(seat=>getComputedStyle(seat).display!=='none');
            const rect=element=>{const box=element.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height};};
            return {
              columns:gridStyle.gridTemplateColumns,
              rows:gridStyle.gridTemplateRows,
              columnsCount:gridStyle.gridTemplateColumns.trim().split(/\s+/).length,
              rowsCount:gridStyle.gridTemplateRows.trim().split(/\s+/).length,
              stage:[stage.getBoundingClientRect().width,stage.getBoundingClientRect().height],
              screen:grid.dataset.liveLayout,
              guest:grid.dataset.liveGuestLayout||'default',
              hostPlacement:[hostStyle.gridColumnStart,hostStyle.gridColumnEnd,hostStyle.gridRowStart,hostStyle.gridRowEnd],
              hostRect:rect(host),
              smallGuestPlacements:seats.filter(seat=>seat.classList.contains('is-guest')).slice(0,2).map(seat=>{const style=getComputedStyle(seat);return [style.gridColumnStart,style.gridColumnEnd,style.gridRowStart,style.gridRowEnd];}),
              smallGuestRects:seats.filter(seat=>seat.classList.contains('is-guest')&&getComputedStyle(seat).display!=='none').map(rect),
              seatRects:visible.map(rect),
              visibleSeats:visible.length,
              headingDisplay:heading?getComputedStyle(heading).display:'none'
            };
          },{screen,guest,mode});
          if(baseline){
            assertStableScreenGeometry(state,baseline,mode+' LIVE '+screen+' screen geometry must not change when only guest-box layout changes at '+viewport.name);
            assert.equal(state.guest,guest||'default','LIVE guest selection did not apply independently');
          }else baseline=state;
          guestPositions.push(state.hostPlacement);
          if(mode==='video'&&!guest)assertReferenceGeometry(screen,state,viewport.name);
          if(mode==='video'){
            await livePage.screenshot({
              path:path.join(artifacts,'live-video-'+screen+'-'+guest+'-'+viewport.name+'.png'),
              fullPage:true
            });
          }
          combinations++;
        }
        assert.notDeepEqual(guestPositions[1],guestPositions[2],mode+' LIVE '+screen+' Roundtable 1 and Roundtable 2 must place the host differently at '+viewport.name);
        assert.notDeepEqual(guestPositions[0],guestPositions[1],mode+' LIVE '+screen+' Roundtable 1 must change guest-box placement at '+viewport.name);
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
          stage.dataset.screenLayout=screen;grid.dataset.layout=screen;if(guest)grid.dataset.guestLayout=guest;else delete grid.dataset.guestLayout;
          const css=getComputedStyle(grid),host=getComputedStyle(grid.querySelector('.is-host'));
          return {columns:css.gridTemplateColumns,stage:[stage.getBoundingClientRect().width,stage.getBoundingClientRect().height],screen:stage.dataset.screenLayout,gridScreen:grid.dataset.layout,guest:grid.dataset.guestLayout||'default',host:[host.gridColumnStart,host.gridColumnEnd,host.gridRowStart,host.gridRowEnd],seats:grid.querySelectorAll('.live-guest-seat').length};
        },{screen,guest});
        if(baseline){
          assertStableScreenGeometry({
            columns:state.columns,rows:'',stage:state.stage,screen:state.screen,visibleSeats:state.seats
          },{
            columns:baseline.columns,rows:'',stage:baseline.stage,screen:baseline.screen,visibleSeats:baseline.seats
          },'MeetWave '+screen+' screen mode or stage geometry changed when only guest layout changed at '+viewport.name);
          assert.equal(state.guest,guest||'default','MeetWave guest selection did not apply independently');
        }else baseline=state;
        guestPositions.push(state.host);
        combinations++;
        if(screen==='fluid-grid'&&guest==='roundtable-1'){
          await mwPage.screenshot({path:path.join(artifacts,'meetwave-fluid-grid-roundtable-1-'+viewport.name+'.png'),fullPage:true});
        }
        if(screen==='spotlight'&&guest==='roundtable-2'){
          await mwPage.screenshot({path:path.join(artifacts,'meetwave-spotlight-roundtable-2-'+viewport.name+'.png'),fullPage:true});
        }
      }
      assert.notDeepEqual(guestPositions[1],guestPositions[2],'MeetWave '+screen+' Roundtable 1 and Roundtable 2 must place the host differently at '+viewport.name);
      assert.notDeepEqual(guestPositions[0],guestPositions[1],'MeetWave '+screen+' Roundtable 1 must change guest-box placement at '+viewport.name);
    }
    await mwPage.close();
  }
}finally{
  await browser.close();
}
console.log(JSON.stringify({
  result:'passed',
  screenLayouts:7,
  guestBoxLayouts:2,
  viewports:viewports.length,
  liveModes:2,
  combinations,
  referenceGeometryChecks:referenceChecks,
  liveScreenshots:42
},null,2));
