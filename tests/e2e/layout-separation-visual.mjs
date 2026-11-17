import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const layouts=[
  {id:'full-screen',label:'Full Screen',file:'Full Screen.png',visible:1},
  {id:'fluid-panel',label:'Fluid Panel',file:'Fluid Panel.png',visible:3},
  {id:'fluid-grid',label:'Fluid Grid',file:'Fluid Grid.png',visible:3},
  {id:'fixed-grid',label:'Fixed Grid',file:'Fixed Grid.png',visible:9},
  {id:'fixed-panel',label:'Fixed Panel',file:'Fixed Panel.png',visible:4},
  {id:'side-by-side',label:'Side by Side',file:'Side by Side.png',visible:9},
  {id:'spotlight',label:'Spotlight',file:'Spotlight.png',visible:9},
  {id:'roundtable-1',label:'Roundtable 1',file:'Roundtable 1.png',visible:9},
  {id:'roundtable-2',label:'Roundtable 2',file:'Roundtable 2.png',visible:9}
];
const viewports=[
  {name:'mobile',width:390,height:844},
  {name:'tablet',width:820,height:1180},
  {name:'desktop',width:1366,height:900}
];
const referenceDirectory=path.join(root,'assets/Crop References/Guests Layout');
const artifacts=path.join(root,'artifacts/layout-separation-visual');
fs.mkdirSync(artifacts,{recursive:true});
const liveCss=read('public/styles.css')+'\n'+read('public/live-room-fit.css')+'\n'+read('public/live-tiktok-compact.css')+'\n'+read('public/live-interface-guardrails.css');
const meetwaveCss=read('public/meetwave.css');
const sizing='html,body{margin:0;width:100%;min-height:100%;background:#080b12;color:#fff;font-family:Arial,sans-serif}body{padding:0;box-sizing:border-box}';
const report={
  result:'pending',
  originalCropDirectory:'assets/Crop References/Guests Layout/',
  products:['LIVE','MeetWave'],
  layouts:layouts.map(item=>item.id),
  viewports:[],
  screenshots:[],
  hostHeaderScreenshots:[],
  hostHeaderChecks:[],
  occupiedSeatChecks:[],
  emptySeatChecks:[],
  geometryComparisons:[],
  notes:['Every seat remains in the DOM; each reference determines which stage panels are visible.','Side by Side preserves the reference 4-column, 3-row structure; the ninth participant fills nine of its ten depicted cells because current capacity is one host plus eight guests.']
};
function seatMarkup(product,state){
  const nodes=[];
  nodes.push('<div class="mw-video-tile live-guest-seat is-host" data-seat-index="0" data-identity="qa-host"><div class="mw-video-placeholder">Host</div><span class="live-guest-seat-tag">HOST</span><span class="live-guest-seat-meta"><strong>Host participant</strong><small>Visual QA</small></span></div>');
  for(let i=1;i<=8;i++){
    const id='qa-guest-'+i;
    if(product==='MeetWave'&&state==='empty'){
      nodes.push('<button type="button" class="mw-video-tile live-guest-seat empty mw-empty-seat" data-seat-index="'+i+'" data-identity="'+id+'" aria-label="Invite Guest '+i+'"><span class="mw-empty-seat-icon">+</span><span class="mw-empty-seat-label">Guest '+i+'</span></button>');
    }else{
      nodes.push('<div class="mw-video-tile live-guest-seat is-guest" data-seat-index="'+i+'" data-identity="'+id+'"><div class="mw-video-placeholder">Guest '+i+'</div><span class="live-guest-seat-tag">GUEST '+i+'</span><span class="live-guest-seat-meta"><strong>Guest participant '+i+'</strong><small>Visual QA</small></span></div>');
    }
  }
  return nodes.join('');
}
function markup(product,state){
  const heading='<div class="live-guest-layout-heading"><strong>'+product.toUpperCase()+' STAGE</strong><small>Original-crop visual QA</small></div>';
  const seats=heading+seatMarkup(product,state);
  if(product==='LIVE'){
    return '<section id="live-player-shell" class="live-player-shell live-mode-video_audio"><header class="live-player-header"><strong>MINGLORA LIVE</strong></header><div class="live-player-layout"><div class="live-video-column"><section id="live-video-stage" class="live-video-stage live-mode-video_audio"><div id="live-guest-layout" class="live-guest-layout">'+seats+'</div><div id="live-screen-share-stage" class="live-screen-share-stage" aria-label="Shared screen"></div></section><div class="live-player-controls live-icon-controls" role="group" aria-label="LIVE controls"></div></div><aside id="live-fullscreen-chat-slot" class="live-fullscreen-chat-slot"></aside></div></section>';
  }
  return '<section class="mw-meeting live-player-shell"><header class="mw-meeting-head live-player-header"><div><span class="mw-eyebrow">MINGLORA MEETWAVE</span><h1>Visual QA room</h1></div><b id="mw-count" class="mw-meeting-count">9 seats</b></header><div class="mw-meeting-layout live-player-layout"><section class="mw-stage-column live-video-column"><div id="mw-screen-stage" class="mw-screen-stage" data-screen-layout="fluid-grid"><div id="mw-grid" class="mw-video-grid live-guest-layout live-video-stage" data-grid-role="host-eight-guest-seats" data-layout="fluid-grid">'+seats+'</div><div id="mw-screen-share-stage" class="mw-screen-share-stage" hidden></div></div><div id="mw-audio" class="mw-audio"></div><div class="mw-controls live-player-controls live-icon-controls" role="group" aria-label="MeetWave controls"></div></section><aside id="mw-chat-panel" class="mw-chat-panel"></aside></div></section>';
}
async function buildPage(browser,product,viewport,state){
  const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1});
  const css=product==='LIVE'?liveCss:meetwaveCss;
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\n'+sizing+'</style></head><body>'+markup(product,state)+'</body></html>');
  return page;
}
async function applyLayout(page,product,layout){
  return page.evaluate(args=>{
    const stage=document.querySelector(args.product==='LIVE'?'#live-video-stage':'#mw-screen-stage');
    const grid=document.querySelector(args.product==='LIVE'?'#live-guest-layout':'#mw-grid');
    if(args.product==='LIVE'){
      grid.dataset.liveLayout=args.layout;
      delete grid.dataset.liveGuestLayout;
    }else{
      stage.dataset.screenLayout=args.layout;
      grid.dataset.layout=args.layout;
      delete stage.dataset.guestLayout;
      delete grid.dataset.guestLayout;
    }
    if(args.layout==='spotlight'){
      const selected=grid.querySelector('[data-seat-index="3"]');
      if(selected)selected.classList.add('is-spotlight','is-focused');
    }
    const bounds=stage.getBoundingClientRect();
    const seats=[...grid.querySelectorAll('.live-guest-seat')].map(node=>{
      const r=node.getBoundingClientRect(),s=getComputedStyle(node);
      return {
        index:Number(node.dataset.seatIndex),
        style:{position:s.position,width:s.width,height:s.height,minWidth:s.minWidth,maxWidth:s.maxWidth,flex:s.flex,left:s.left,right:s.right,top:s.top,bottom:s.bottom,transform:s.transform,zoom:s.zoom,gridColumn:s.gridColumn,gridRow:s.gridRow},
        x:r.x-bounds.x,y:r.y-bounds.y,w:r.width,h:r.height,
        visible:s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&r.width>1&&r.height>1,
        display:s.display,visibility:s.visibility,opacity:s.opacity
      };
    });
    const computed=getComputedStyle(grid);
    const rowTracks=computed.gridTemplateRows.trim().split(/\s+/);
    const heading=grid.querySelector(':scope > .live-guest-layout-heading');
    const headingStyle=heading?getComputedStyle(heading):null;
    const headingBounds=heading?heading.getBoundingClientRect():null;
    const hasDedicatedHeadingTrack=!!heading&&headingStyle.display!=='none'&&headingStyle.gridRowStart==='1'&&headingBounds.height>0;
    const gridBounds=grid.getBoundingClientRect();
    const liveSelector='body:has(#live-player-shell) #live-video-stage #live-guest-layout[data-live-layout="'+args.layout+'"]';
    return {
      product:args.product,layout:args.layout,
      stage:{width:bounds.width,height:bounds.height},
      grid:{x:gridBounds.x-bounds.x,y:gridBounds.y-bounds.y,width:gridBounds.width,height:gridBounds.height},
      layoutAttribute:grid.getAttribute(args.product==='LIVE'?'data-live-layout':'data-layout'),
      productionSelectorMatches:args.product==='LIVE'?document.querySelectorAll(liveSelector).length:document.querySelectorAll('.mw-meeting #mw-screen-stage[data-screen-layout] #mw-grid[data-layout="'+args.layout+'"]').length,
      columns:computed.gridTemplateColumns.trim().split(/\s+/).length,
      rows:rowTracks.length-(hasDedicatedHeadingTrack?1:0),
      totalGridRows:rowTracks.length,
      headingRowHeight:hasDedicatedHeadingTrack?headingBounds.height:null,
      columnTemplate:computed.gridTemplateColumns,rowTemplate:computed.gridTemplateRows,
      display:computed.display,
      seats
    };
  },{product,layout});
}
function assertInside(result,seat,label){
  assert.ok(seat.w>1&&seat.h>1,label+' seat '+seat.index+' has a visible panel');
  assert.ok(seat.x>=-2&&seat.y>=-2,label+' seat '+seat.index+' starts inside stage');
  assert.ok(seat.x+seat.w<=result.stage.width+3,label+' seat '+seat.index+' ends inside horizontally');
  assert.ok(seat.y+seat.h<=result.stage.height+3,label+' seat '+seat.index+' ends inside vertically');
}
function verify(result,definition,viewport,state){
  const label=result.product+' '+definition.id+' '+viewport.name+' '+state;
  if(result.headingRowHeight!==null){
    assert.ok(Math.abs(result.headingRowHeight-22)<=1,label+' reserves a separate 22px heading row');
    const host=result.seats.find(seat=>seat.index===0&&seat.visible);
    if(host)assert.ok(host.y>=result.headingRowHeight-1,label+' keeps the host panel below the heading row');
  }
  assert.equal(result.seats.length,9,label+' retains all nine seat records');
  const visible=result.seats.filter(seat=>seat.visible);
  assert.equal(visible.length,definition.visible,label+' stage panel count matches its source-crop arrangement');
  visible.forEach(seat=>assertInside(result,seat,label));
  const get=index=>visible.find(seat=>seat.index===index);
  if(definition.id==='full-screen'){
    const host=get(0);
    assert.ok(host.w>=result.stage.width*.88&&host.h>=result.stage.height*.88,label+' uses one full-stage panel; host='+JSON.stringify(host)+' stage='+JSON.stringify(result.stage));
    assert.equal(result.columns,1,label+' uses one column');
    assert.equal(result.rows,1,label+' uses one row');
  }
  if(definition.id==='fluid-panel'){
    const host=get(0),first=get(1),second=get(2);
    assert.ok(host.w>=result.stage.width*.88&&host.h>=result.stage.height*.88,label+' keeps one dominant panel; host='+JSON.stringify(host)+' stage='+JSON.stringify(result.stage));
    assert.ok(first&&second&&first.x>result.stage.width*.68&&second.x>result.stage.width*.68,label+' places two compact panels at the lower right');
    assert.ok(Math.abs(first.x-second.x)<3&&Math.abs(first.y-second.y)>first.h*.7,label+' stacks the compact panels vertically');
    const stackGap=first.y-(second.y+second.h);
    assert.ok(stackGap>=3&&stackGap<=10,label+' keeps the two lower-right thumbnails close together; gap='+stackGap);
  }
  if(definition.id==='fluid-grid'){
    const host=get(0),first=get(1),second=get(2);
    assert.ok(host.x<first.x&&host.h>=result.stage.height*.88,label+' keeps the large panel full height at left');
    assert.ok(Math.abs(first.x-second.x)<3&&Math.abs(first.y-second.y)>first.h*.7,label+' has two stacked panels in the right column');
    assert.equal(result.columns,2,label+' uses two columns');
    assert.equal(result.rows,2,label+' uses two rows');
  }
  if(definition.id==='fixed-grid'){
    assert.equal(result.columns,3,label+' uses three columns');
    assert.equal(result.rows,3,label+' uses three rows');
    assert.equal(new Set(visible.map(seat=>Math.round(seat.x/3))).size,3,label+' fills three columns');
    assert.equal(new Set(visible.map(seat=>Math.round(seat.y/3))).size,3,label+' fills three rows');
  }
  if(definition.id==='fixed-panel'){
    const host=get(0),guests=[get(1),get(2),get(3)];
    assert.ok(host.x<guests[0].x&&host.h>=result.stage.height*.88,label+' uses a large left panel');
    assert.ok(guests.every(Boolean)&&guests.every(item=>Math.abs(item.x-guests[0].x)<3),label+' aligns three guest panels on the right');
    assert.equal(new Set(guests.map(item=>Math.round(item.y/3))).size,3,label+' uses three stacked rows');
    assert.equal(result.columns,2,label+' uses two columns');
    assert.equal(result.rows,3,label+' uses three rows');
  }
  if(definition.id==='side-by-side'){
    const top=[get(0),get(1)],small=visible.filter(seat=>seat.index>=2);
    assert.ok(top.every(Boolean)&&Math.abs(top[0].y-top[1].y)<3,label+' places two large panels on the top row');
    assert.ok(top.every(item=>item.h>small[0].h*1.3),label+' keeps top panels larger than compact panels');
    assert.ok(small.every(item=>item.y>top[0].y+top[0].h*.7),label+' places compact panels underneath');
    assert.equal(result.columns,4,label+' uses four columns');
    assert.equal(result.rows,3,label+' uses three rows');
  }
  if(definition.id==='spotlight'){
    const main=visible.find(seat=>seat.w>result.stage.width*.9);
    const small=visible.filter(seat=>seat.index!==main.index);
    assert.ok(main,label+' has one full-width spotlight panel');
    assert.equal(new Set(small.map(seat=>Math.round(seat.y/3))).size,2,label+' has two lower rows');
    assert.equal(new Set(small.map(seat=>Math.round(seat.x/3))).size,4,label+' has four compact columns');
  }
  if(definition.id==='roundtable-1'||definition.id==='roundtable-2'){
    const host=get(0),center=host.x+host.w/2;
    const left=visible.filter(seat=>seat.index>0&&seat.x+seat.w/2<center);
    const right=visible.filter(seat=>seat.index>0&&seat.x+seat.w/2>center);
    assert.ok(Math.abs(center-result.stage.width/2)<result.stage.width*.1,label+' centers the main panel');
    assert.equal(left.length,4,label+' has four guest panels on the left');
    assert.equal(right.length,4,label+' has four guest panels on the right');
    assert.equal(new Set(left.map(seat=>Math.round(seat.y/3))).size,4,label+' has four left-side rows');
    assert.equal(new Set(right.map(seat=>Math.round(seat.y/3))).size,4,label+' has four right-side rows');
    assert.equal(result.columns,definition.id==='roundtable-1'?3:4,label+' keeps its distinct column count');
    assert.equal(result.rows,4,label+' keeps four rows');
  }
  return {
    product:result.product,layout:result.layout,viewport:viewport.name,state,
    visiblePanels:visible.length,seatRecords:result.seats.length,
    stage:result.stage,columns:result.columns,rows:result.rows,totalGridRows:result.totalGridRows,headingRowHeight:result.headingRowHeight,
    panels:visible.map(seat=>({index:seat.index,x:Math.round(seat.x),y:Math.round(seat.y),width:Math.round(seat.w),height:Math.round(seat.h),style:seat.style}))
  };
}
function signature(result){
  return result.seats.filter(seat=>seat.visible)
    .map(seat=>[seat.index,seat.x,seat.y,seat.w,seat.h].map(value=>Math.round(value/3)).join(',')).join('|');
}
async function compareCrop(browser,product,definition,viewport,png){
  const pathToCrop=path.join(referenceDirectory,definition.file);
  assert.ok(fs.existsSync(pathToCrop),'Original crop missing: '+pathToCrop);
  const original=fs.readFileSync(pathToCrop).toString('base64');
  const rendered=png.toString('base64');
  const page=await browser.newPage({viewport:{width:1440,height:620},deviceScaleFactor:1});
  const html='<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#edf0f5;color:#101828;font-family:Arial,sans-serif}.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.head strong{font-size:17px}.head small{font-size:12px;color:#475467}.compare{display:grid;grid-template-columns:250px minmax(0,1fr);gap:16px;align-items:start}.panel{background:#fff;border:1px solid #cbd3dd;border-radius:10px;padding:10px;min-width:0}.panel h2{margin:0 0 8px;font-size:12px;letter-spacing:.04em}.panel img{display:block;width:100%;height:480px;object-fit:contain;background:#f7f8fa}.foot{margin-top:8px;font-size:10px;color:#667085}</style></head><body><div class="head"><strong>'+product+' · '+definition.label+'</strong><small>'+viewport.name+' · '+viewport.width+' × '+viewport.height+'</small></div><div class="compare"><section class="panel"><h2>ORIGINAL CROPPED REFERENCE</h2><img src="data:image/png;base64,'+original+'" alt="Original '+definition.label+' crop"></section><section class="panel"><h2>RENDERED IMPLEMENTATION</h2><img src="data:image/png;base64,'+rendered+'" alt="'+product+' '+definition.label+' render"></section></div><div class="foot">Source file: '+definition.file+' · viewport: '+viewport.width+' × '+viewport.height+'</div></body></html>';
  await page.setContent(html);
  const name='compare-'+product.toLowerCase()+'-'+definition.id+'-'+viewport.name+'.png';
  await page.screenshot({path:path.join(artifacts,name),fullPage:true});
  await page.close();
  report.screenshots.push(name);
}
const browser=await chromium.launch({headless:true});
try{
  for(const viewport of viewports){
    for(const product of ['LIVE','MeetWave']){
      const page=await buildPage(browser,product,viewport,'occupied');
      const signatures=new Set();
      const productResults=[];
      for(const definition of layouts){
        const result=await applyLayout(page,product,definition.id);
        report.lastMeasurement=result;
        const summary=verify(result,definition,viewport,'occupied');
        report.occupiedSeatChecks.push(summary);
        signatures.add(signature(result));
        productResults.push(result);
        const selector=product==='LIVE'?'#live-video-stage':'#mw-screen-stage';
        const png=await page.locator(selector).screenshot();
        await compareCrop(browser,product,definition,viewport,png);
      }
      assert.equal(signatures.size,9,product+' must have nine independent geometries on '+viewport.name);
      report.viewports.push({product,name:viewport.name,width:viewport.width,height:viewport.height,independentLayouts:signatures.size});
      if(product==='MeetWave'){
        const emptyPage=await buildPage(browser,'MeetWave',viewport,'empty');
        for(const definition of layouts){
          const result=await applyLayout(emptyPage,'MeetWave',definition.id);
          report.emptySeatChecks.push(verify(result,definition,viewport,'empty'));
        }
        await emptyPage.close();
        const liveResults=report.occupiedSeatChecks.filter(row=>row.product==='LIVE'&&row.viewport===viewport.name);
        const mwResults=report.occupiedSeatChecks.filter(row=>row.product==='MeetWave'&&row.viewport===viewport.name);
        for(const definition of layouts){
          const liveRow=liveResults.find(row=>row.layout===definition.id);
          const mwRow=mwResults.find(row=>row.layout===definition.id);
          assert.ok(liveRow&&mwRow,'Both products must render '+definition.id+' on '+viewport.name);
          assert.equal(liveRow.panels.length,mwRow.panels.length,
            'LIVE and MeetWave panel counts differ for '+definition.id+' on '+viewport.name);
          let maxRelativeDelta=0;
          for(let index=0;index<liveRow.panels.length;index++){
            const livePanel=liveRow.panels[index],mwPanel=mwRow.panels[index];
            assert.equal(livePanel.index,mwPanel.index,
              'LIVE and MeetWave seat order differs for '+definition.id+' on '+viewport.name);
            if(definition.id==='fluid-panel'&&livePanel.index>0){
              const liveAnchors={
                right:liveRow.stage.width-livePanel.x-livePanel.width,
                bottom:liveRow.stage.height-livePanel.y-livePanel.height,
                width:livePanel.width,height:livePanel.height
              };
              const mwAnchors={
                right:mwRow.stage.width-mwPanel.x-mwPanel.width,
                bottom:mwRow.stage.height-mwPanel.y-mwPanel.height,
                width:mwPanel.width,height:mwPanel.height
              };
              // LIVE Fluid Panel intentionally has a larger right/bottom safe inset than
              // MeetWave so guest thumbnails clear the host-stage border lines.
              const rightInsetDelta=liveAnchors.right-mwAnchors.right;
              const bottomInsetDelta=liveAnchors.bottom-mwAnchors.bottom;
              assert.ok(rightInsetDelta>=10&&rightInsetDelta<=56,
                'LIVE Fluid Panel guest seat must sit 10–56px farther inside the host right frame for seat '+livePanel.index+' on '+viewport.name+
                '; LIVE='+JSON.stringify(liveAnchors)+' MeetWave='+JSON.stringify(mwAnchors));
              assert.ok(bottomInsetDelta>=10&&bottomInsetDelta<=32,
                'LIVE Fluid Panel guest seat must sit 10–32px farther inside the host bottom frame for seat '+livePanel.index+' on '+viewport.name+
                '; LIVE='+JSON.stringify(liveAnchors)+' MeetWave='+JSON.stringify(mwAnchors));
              for(const metric of ['width','height']){
                const delta=Math.abs(liveAnchors[metric]-mwAnchors[metric]);
                assert.ok(delta<=2.5,
                  'LIVE and MeetWave Fluid Panel '+metric+' differs by '+delta.toFixed(2)+'px for seat '+livePanel.index+' on '+viewport.name+
                  '; LIVE='+JSON.stringify(liveAnchors)+' MeetWave='+JSON.stringify(mwAnchors));
              }
              continue;
            }
            const liveHeadingOffset=liveRow.headingRowHeight||0;
            const mwHeadingOffset=mwRow.headingRowHeight||0;
            const liveContentHeight=Math.max(1,liveRow.stage.height-liveHeadingOffset);
            const mwContentHeight=Math.max(1,mwRow.stage.height-mwHeadingOffset);
            for(const metric of ['x','y','width','height']){
              const dimension=(metric==='x'||metric==='width')?'width':'height';
              const liveValue=metric==='y'?Math.max(0,livePanel.y-liveHeadingOffset):livePanel[metric];
              const mwValue=metric==='y'?Math.max(0,mwPanel.y-mwHeadingOffset):mwPanel[metric];
              const liveExtent=dimension==='height'?liveContentHeight:liveRow.stage[dimension];
              const mwExtent=dimension==='height'?mwContentHeight:mwRow.stage[dimension];
              const liveRatio=liveValue/liveExtent;
              const mwRatio=mwValue/mwExtent;
              const delta=Math.abs(liveRatio-mwRatio);
              maxRelativeDelta=Math.max(maxRelativeDelta,delta);
              assert.ok(delta<=0.025,
                'LIVE and MeetWave relative '+metric+' differs by '+delta.toFixed(4)+' for seat '+livePanel.index+' in '+definition.id+' on '+viewport.name+
                '; heading-excluded LIVE stage='+liveContentHeight+'px MeetWave stage='+mwContentHeight+'px');
            }
          }
          report.geometryComparisons.push({
            layout:definition.id,viewport:viewport.name,
            result:'matched within 2.5% of each usable video-area dimension',
            geometryBasis:'video area excludes its dedicated heading row',
            maxRelativeDelta:Number(maxRelativeDelta.toFixed(4)),
            liveStage:liveRow.stage,meetWaveStage:mwRow.stage
          });
        }
      }
      await page.close();
    }
  }

  // Reference-check the host header independently from guest-stage geometry.
  // The host row must keep the avatar/name above LIVE NOW + live likes, with Follow
  // beside the card before following and the compact orange Heart Me heart afterward.
  const headerViewports=[
    {name:'small-phone',width:320,height:760},
    {name:'phone',width:390,height:844},
    {name:'tablet',width:820,height:1180},
    {name:'desktop',width:1366,height:900}
  ];
  const headerStates=[
    {name:'before-follow',role:'viewer',followed:false},
    {name:'after-follow',role:'viewer',followed:true},
    {name:'host',role:'host',followed:false}
  ];
  for(const viewport of headerViewports){
    for(const state of headerStates){
      const followMarkup=state.role==='viewer'
        ?'<button type="button" id="live-follow-host" class="live-follow-button'+(state.followed?' is-heart-me':'')+'" aria-pressed="'+(state.followed?'true':'false')+'">'+(state.followed?'♥':'Follow')+'</button>'
        :'';
      const headerMarkup=
        '<section id="live-player-shell" class="live-player-shell live-mode-video_audio">'+
          '<header class="live-player-header"><div><span class="live-indicator">LIVE</span><strong>Minglora Live Room</strong></div></header>'+
          '<div class="live-session-meta"><span>Video + Audio</span></div>'+
          '<div class="live-player-layout">'+
            '<div class="live-video-column">'+
              '<div class="live-stage-topbar '+(state.role==='host'?'is-host':'')+'">'+
                '<div class="live-stage-top-left">'+
                  '<div class="live-host-profile-wrap">'+
                    '<div class="live-host-identity-block">'+
                      '<button type="button" class="live-host-profile" aria-label="Open Minglora Creator profile in LIVE">'+
                        '<img src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Ccircle cx=%2732%27 cy=%2732%27 r=%2732%27 fill=%27%236a55bd%27/%3E%3C/svg%3E" alt="">'+
                        '<span class="live-host-identity-copy"><strong>Minglora Creator With A Long Display Name</strong></span>'+
                      '</button>'+
                      '<div class="live-host-meta-row">'+
                        '<small class="live-host-live-status"><i class="live-host-live-dot"></i> LIVE NOW</small>'+
                        '<div class="live-like-control live-like-count" aria-label="LIVE heart reactions"><button type="button" id="live-heart-like" class="live-heart-like" aria-label="Like this LIVE"><span aria-hidden="true">♥</span></button><strong id="live-reaction-count">12.4K</strong></div>'+
                      '</div>'+
                    '</div>'+
                    followMarkup+
                  '</div>'+
                '</div>'+
              '</div>'+
              '<section id="live-video-stage" class="live-video-stage"></section>'+
              '<div class="live-player-controls live-icon-controls" role="group" aria-label="LIVE controls"></div>'+
            '</div>'+
            '<aside id="live-fullscreen-chat-slot" class="live-fullscreen-chat-slot"><header class="live-fullscreen-side-head"><strong>LIVE PANEL</strong></header></aside>'+
          '</div>'+
        '</section>';
      const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1});
      await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+liveCss+'\n'+sizing+'</style></head><body>'+headerMarkup+'</body></html>');
      await page.waitForFunction(()=>document.fonts?.status!=='loading');
      const metrics=await page.evaluate(()=>{
        const rect=selector=>{
          const node=document.querySelector(selector);
          if(!node)return null;
          const r=node.getBoundingClientRect();
          const style=getComputedStyle(node);
          return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,display:style.display,visibility:style.visibility,opacity:Number(style.opacity)};
        };
        const box=document.querySelector('.live-stage-topbar');
        return {
          viewport:{width:innerWidth,height:innerHeight},
          topbar:rect('.live-stage-topbar'),
          topbarClientWidth:box?.clientWidth||0,topbarScrollWidth:box?.scrollWidth||0,
          identity:rect('.live-host-identity-block'),
          profile:rect('.live-host-profile'),
          avatar:rect('.live-host-profile img'),
          name:rect('.live-host-profile strong'),
          meta:rect('.live-host-meta-row'),
          status:rect('.live-host-live-status'),
          likes:rect('.live-like-control'),
          heart:rect('.live-heart-like'),
          count:rect('#live-reaction-count'),
          follow:rect('#live-follow-host'),
          topLeft:rect('.live-stage-top-left')
        };
      });
      const label='LIVE host header '+viewport.name+' '+state.name;
      for(const key of ['topbar','identity','profile','avatar','name','meta','status','likes','heart','count']){
        const item=metrics[key];
        assert.ok(item&&item.width>0&&item.height>0,label+' '+key+' is visible: '+JSON.stringify(metrics));
        assert.ok(item.display!=='none'&&item.visibility!=='hidden'&&item.opacity>0,label+' '+key+' is not hidden');
      }
      const inside=(parent,child,key)=>{
        assert.ok(child.x>=parent.x-1&&child.right<=parent.right+2&&child.y>=parent.y-1&&child.bottom<=parent.bottom+2,
          label+' '+key+' stays inside its parent; '+JSON.stringify({parent,child}));
      };
      inside(metrics.topbar,metrics.identity,'identity card');
      inside(metrics.identity,metrics.profile,'profile action');
      inside(metrics.identity,metrics.meta,'LIVE/likes row');
      inside(metrics.profile,metrics.avatar,'avatar');
      inside(metrics.profile,metrics.name,'host name');
      inside(metrics.meta,metrics.status,'LIVE NOW status');
      inside(metrics.meta,metrics.likes,'likes');
      assert.ok(metrics.meta.y>=metrics.profile.bottom-1,label+' LIVE NOW and likes appear below the avatar/name row');
      assert.ok(metrics.status.right<=metrics.likes.x+2,label+' LIVE NOW and heart/count do not overlap');
      assert.ok(metrics.avatar.right<metrics.name.x+2,label+' avatar and host name retain separate columns');
      assert.ok(metrics.topbarScrollWidth<=metrics.topbarClientWidth+2,label+' topbar has no horizontal clipping/overflow: '+JSON.stringify(metrics));
      if(state.role==='viewer'){
        assert.ok(metrics.follow&&metrics.follow.width>0,label+' viewer follow action is present');
        assert.ok(metrics.follow.x>=metrics.identity.right-1,label+' follow/Heart Me is separate from host identity and likes');
        if(state.followed){
          assert.equal(metrics.follow.width,27,label+' after-follow Heart Me remains the compact orange heart');
        }else{
          assert.ok(metrics.follow.width>=40,label+' before-follow action retains a readable Follow label');
        }
      }else{
        assert.equal(metrics.follow,null,label+' host does not get a self-follow action');
      }
      const screenshot='host-header-'+viewport.name+'-'+state.name+'.png';
      await page.screenshot({path:path.join(artifacts,screenshot),fullPage:true});
      report.hostHeaderScreenshots.push(screenshot);
      report.hostHeaderChecks.push({viewport:viewport.name,width:viewport.width,height:viewport.height,state:state.name,role:state.role,result:'passed',metrics});
      await page.close();
    }
  }

  report.result='passed';
  report.summary={
    layouts:9,products:2,viewports:3,
    cropComparisons:report.screenshots.length,
    occupiedSeatChecks:report.occupiedSeatChecks.length,
    MeetWaveEmptySeatChecks:report.emptySeatChecks.length,
    matchingLiveMeetWaveGeometries:report.geometryComparisons.length,
    hostHeaderChecks:report.hostHeaderChecks.length,
    hostHeaderScreenshots:report.hostHeaderScreenshots.length
  };
  fs.writeFileSync(path.join(artifacts,'visual-matrix.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({result:'passed',...report.summary},null,2));
}catch(error){
  report.result='failed';
  report.error=String(error);
  fs.writeFileSync(path.join(artifacts,'visual-matrix.json'),JSON.stringify(report,null,2));
  throw error;
}finally{
  await browser.close();
}